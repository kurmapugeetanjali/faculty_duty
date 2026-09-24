const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const pool = require('../database/database');
const { requireAuth, requireHOS } = require('../middleware/auth');

// Multer storage for exam duty notices and circular images/PDFs
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'exam-notice-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp|pdf/;
        const extname = allowed.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowed.test(file.mimetype) || file.mimetype === 'application/pdf';
        if (extname || mimetype) return cb(null, true);
        cb(new Error('Only Images and PDF duty circulars are supported!'));
    }
});

/**
 * Helper to parse dates from OCR text (supports ISO YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY)
 */
function extractDateFromText(text, fallbackDate = null) {
    if (!text) return fallbackDate || new Date().toISOString().split('T')[0];
    
    // YYYY-MM-DD
    const isoMatch = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) {
        return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[3]).padStart(2, '0')}`;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
    if (dmyMatch) {
        return `${dmyMatch[3]}-${String(dmyMatch[2]).padStart(2, '0')}-${String(dmyMatch[1]).padStart(2, '0')}`;
    }

    return fallbackDate || new Date().toISOString().split('T')[0];
}

/**
 * Helper to parse Room Number (e.g. LH-101, Drawing Hall, Room 204, Lab 1)
 */
function extractRoomFromText(text) {
    if (!text) return 'LH-101';
    const lhMatch = text.match(/\b(?:LH|Hall|Room|Lab|Drawing\s*Hall|Block\s*[A-Z])[\s\-_:]*([A-Za-z0-9\-]+)?\b/i);
    if (lhMatch) return lhMatch[0].trim();
    const simpleLh = text.match(/\bLH[-_\s]?\d{1,3}\b/i);
    if (simpleLh) return simpleLh[0].toUpperCase().replace(/\s+/, '-');
    const roomDigits = text.match(/\b(?:Room|Hall)\s*(\d+)\b/i);
    if (roomDigits) return `Room-${roomDigits[1]}`;
    return 'LH-101';
}

// 1. GET ALL EXAM INVIGILATIONS (3 Main Columns: Faculty Name, Room Number, Date)
router.get('/', async (req, res) => {
    const { date, department } = req.query;
    try {
        let query = `
            SELECT ei.id, ei.exam_name, ei.exam_date, ei.session, ei.hall_no, ei.department, ei.notes, ei.photo_url, ei.created_at,
                   u.id AS faculty_id, 
                   COALESCE(u.full_name, ei.notes, 'Assigned Faculty') AS faculty_name, 
                   COALESCE(u.phone, '') AS faculty_phone,
                   u.department AS faculty_dept, u.designation
            FROM exam_invigilation ei
            LEFT JOIN users u ON ei.faculty_id = u.id
        `;
        const conditions = [];
        const params = [];

        if (department && department !== 'ALL') {
            params.push(department.toUpperCase());
            conditions.push(`ei.department = $${params.length}`);
        }
        if (date) {
            params.push(date);
            conditions.push(`ei.exam_date = $${params.length}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ` ORDER BY ei.exam_date ASC, ei.hall_no ASC, ei.id ASC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error("Error in GET /api/invigilation:", err);
        res.status(500).json({ error: 'Database error fetching invigilations' });
    }
});

// 2. ADMIN ONLY: Upload handwritten or printed exam invigilation image/notice with OCR
router.post('/upload-ocr', requireHOS, upload.single('examFile'), async (req, res) => {
    const defaultDate = req.body.exam_date || new Date().toISOString().split('T')[0];
    const defaultExamName = req.body.exam_name || 'Semester Examination Invigilation';

    if (!req.file) {
        return res.status(400).json({ error: 'Please upload an image (handwritten or printed notice) of the exam invigilation schedule.' });
    }

    try {
        console.log(`[Invigilation OCR] Processing notice image: ${req.file.originalname}`);
        const photoUrl = `/uploads/${req.file.filename}`;

        // Fetch all known faculty from database
        const facRes = await pool.query("SELECT id, faculty_id, full_name, phone, department FROM users WHERE role = 'faculty' OR role = 'hos'");
        const allFaculty = facRes.rows;

        // Run Tesseract OCR on the image
        const ocrResult = await Tesseract.recognize(
            req.file.path,
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text' && m.progress % 0.5 === 0) {
                        console.log(`[Invig OCR Progress] ${(m.progress * 100).toFixed(0)}%`);
                    }
                }
            }
        );

        const rawText = (ocrResult.data && ocrResult.data.text) ? ocrResult.data.text : '';
        console.log(`[Invigilation OCR] Extracted ${rawText.length} characters from schedule photo.`);

        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const extractedDuties = [];
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            let detectedDate = extractDateFromText(rawText, defaultDate);

            for (const line of lines) {
                // Check if line contains a date
                const lineDate = extractDateFromText(line, null);
                if (lineDate) {
                    detectedDate = lineDate;
                }

                // Check for matched faculty in this line
                let matchedFaculty = null;
                const lowerLine = line.toLowerCase();

                for (const fac of allFaculty) {
                    if (lowerLine.includes(fac.full_name.toLowerCase())) {
                        matchedFaculty = fac;
                        break;
                    }
                    // Match surname or specific name parts (e.g. Gopala, Kishore, Smitha, Ravi, Anitha, Priya, Ramesh)
                    const parts = fac.full_name.toLowerCase().replace(/^(dr\.|prof\.|mr\.|mrs\.|sri|smt\.)\s*/i, '').split(/\s+/);
                    for (const p of parts) {
                        if (p.length >= 4 && lowerLine.includes(p)) {
                            matchedFaculty = fac;
                            break;
                        }
                    }
                    if (matchedFaculty) break;
                }

                // Extract room from this line or default
                const room = extractRoomFromText(line);

                if (matchedFaculty) {
                    // Avoid duplicate insertion for same faculty on same date
                    const existing = extractedDuties.find(d => d.faculty_id === matchedFaculty.id && d.exam_date === detectedDate);
                    if (!existing) {
                        const dutyRecord = {
                            department: matchedFaculty.department || 'CSE',
                            exam_name: defaultExamName,
                            exam_date: detectedDate,
                            session: 'Exam Duty',
                            hall_no: room,
                            faculty_id: matchedFaculty.id,
                            faculty_name: matchedFaculty.full_name,
                            photo_url: photoUrl,
                            notes: `Invigilator: ${matchedFaculty.full_name}`
                        };

                        const insertRes = await client.query(`
                            INSERT INTO exam_invigilation (department, exam_name, exam_date, session, hall_no, faculty_id, photo_url, notes)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                            RETURNING id
                        `, [dutyRecord.department, dutyRecord.exam_name, dutyRecord.exam_date, dutyRecord.session, dutyRecord.hall_no, dutyRecord.faculty_id, dutyRecord.photo_url, dutyRecord.notes]);

                        dutyRecord.id = insertRes.rows[0].id;
                        extractedDuties.push(dutyRecord);
                    }
                }
            }

            // Fallback: If no specific line matched, but faculty names are in DB, create records for detected names or form inputs
            if (extractedDuties.length === 0 && allFaculty.length > 0) {
                // Check if any faculty names appear anywhere in the document
                for (const fac of allFaculty) {
                    if (rawText.toLowerCase().includes(fac.full_name.toLowerCase().replace(/^(dr\.|prof\.|mr\.|mrs\.|sri|smt\.)\s*/i, ''))) {
                        const insertRes = await client.query(`
                            INSERT INTO exam_invigilation (department, exam_name, exam_date, session, hall_no, faculty_id, photo_url, notes)
                            VALUES ($1, $2, $3, 'Exam Duty', 'Drawing Hall-1', $4, $5, $6)
                            RETURNING id
                        `, [fac.department || 'CSE', defaultExamName, detectedDate, fac.id, photoUrl, `Invigilator: ${fac.full_name}`]);

                        extractedDuties.push({
                            id: insertRes.rows[0].id,
                            department: fac.department || 'CSE',
                            exam_name: defaultExamName,
                            exam_date: detectedDate,
                            session: 'Exam Duty',
                            hall_no: 'Drawing Hall-1',
                            faculty_id: fac.id,
                            faculty_name: fac.full_name,
                            photo_url: photoUrl
                        });
                    }
                }
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                count: extractedDuties.length,
                message: extractedDuties.length > 0
                    ? `🎉 Successfully parsed exam schedule (${req.file.originalname})! ${extractedDuties.length} invigilation duties registered.`
                    : `📷 Image parsed, but no known faculty names were detected. You can add duties manually below.`,
                extractedDuties: extractedDuties,
                photoUrl: photoUrl
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error in POST /api/invigilation/upload-ocr:", err);
        res.status(500).json({ error: 'Failed to process exam schedule image: ' + err.message });
    }
});

// 3. ADMIN ONLY: Manual Quick Add (3 Fields: Faculty Name, Room Number, Date)
router.post('/', requireHOS, async (req, res) => {
    const { faculty_id, faculty_name, hall_no, exam_date, exam_name } = req.body;

    if (!exam_date) {
        return res.status(400).json({ error: 'Exam date is required' });
    }

    try {
        let assignedFacultyId = parseInt(faculty_id, 10) || null;
        let assignedName = faculty_name || '';

        if (!assignedFacultyId && assignedName) {
            const userRes = await pool.query('SELECT id, full_name, department FROM users WHERE full_name ILIKE $1 LIMIT 1', [`%${assignedName}%`]);
            if (userRes.rows.length > 0) {
                assignedFacultyId = userRes.rows[0].id;
                assignedName = userRes.rows[0].full_name;
            }
        }

        const room = hall_no || 'Drawing Hall-1';
        const title = exam_name || 'Semester Examination';
        const noteText = assignedName ? `Invigilator: ${assignedName}` : 'Exam Invigilation';

        const result = await pool.query(`
            INSERT INTO exam_invigilation (exam_name, exam_date, session, hall_no, faculty_id, department, notes)
            VALUES ($1, $2, 'Exam Duty', $3, $4, 'CSE', $5)
            RETURNING id
        `, [title, exam_date, room, assignedFacultyId, noteText]);

        res.json({
            success: true,
            message: 'Exam invigilation duty registered successfully!',
            id: result.rows[0].id
        });
    } catch (err) {
        console.error("Error in POST /api/invigilation:", err);
        res.status(500).json({ error: 'Database error scheduling invigilation: ' + err.message });
    }
});

// 4. ADMIN ONLY: Delete an individual exam duty
router.delete('/:id', requireHOS, async (req, res) => {
    try {
        await pool.query('DELETE FROM exam_invigilation WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Exam invigilation duty deleted successfully' });
    } catch (err) {
        console.error("Error in DELETE /api/invigilation:", err);
        res.status(500).json({ error: 'Database error deleting invigilation duty' });
    }
});

// 5. ADMIN ONLY: Clear all examination records
router.post('/clear-all', requireHOS, async (req, res) => {
    try {
        const delRes = await pool.query('DELETE FROM exam_invigilation');
        res.json({
            success: true,
            message: `Cleared all ${delRes.rowCount} examination schedule records.`
        });
    } catch (err) {
        console.error("Error in /api/invigilation/clear-all:", err);
        res.status(500).json({ error: 'Database error clearing exam records' });
    }
});

module.exports = router;
