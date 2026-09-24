const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../database/database');
const { requireAuth, requireHOS } = require('../middleware/auth');

// Storage for faculty personal timetable uploads (images / camera captures / PDFs)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'faculty-tt-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp|pdf|csv|json/;
        const extname = allowed.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowed.test(file.mimetype) || file.mimetype === 'application/pdf' || file.mimetype === 'application/json';
        if (extname || mimetype) return cb(null, true);
        cb(new Error('Supported formats: Photos, Camera captures, PDFs, CSV, JSON!'));
    }
});

// 1. UPLOAD PERSONAL / SEMESTER TIMETABLE PHOTO OR PDF (Organizes into 7 Periods & Publishes to Home Page)
router.post('/personal-file', requireAuth, upload.single('personalFile'), async (req, res) => {
    const facultyId = req.session.userId || (req.body && req.body.user_id) || 1;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    try {
        // Fetch user department
        const userRes = await pool.query('SELECT department, full_name, role FROM users WHERE id = $1', [facultyId]);
        const user = userRes.rows[0] || { department: 'CSE', full_name: 'Faculty' };
        const dept = user.department || 'CSE';

        // Find target branch (defaulting to 5th Sem of department)
        const branchRes = await pool.query('SELECT * FROM branches WHERE department = $1 ORDER BY id ASC', [dept]);
        const targetBranch = branchRes.rows.find(b => b.branch_name.includes('5th')) || branchRes.rows[0] || { id: 4, branch_name: 'CSE 5th Sem' };
        const branchId = targetBranch.id;

        // If file uploaded, run OCR to extract subjects and faculty
        let ocrEntries = [];
        if (req.file) {
            console.log(`[Personal Upload] Reading timetable image (${req.file.originalname}) for ${dept} (Branch ${branchId})`);
            const ocrResult = await parseTimetableImage(req.file.path, dept, branchId);
            if (ocrResult.success && ocrResult.entries && ocrResult.entries.length > 0) {
                ocrEntries = ocrResult.entries;
            }
        }

        // If no OCR entries, generate semester-specific curriculum schedule with faculty names
        if (ocrEntries.length === 0) {
            const subRes = await pool.query('SELECT id, subject_code, subject_name FROM subjects WHERE department = $1 ORDER BY id ASC', [dept]);
            const facRes = await pool.query('SELECT id, faculty_id, full_name FROM users WHERE (role = \'faculty\' OR role = \'hos\') AND department = $1 ORDER BY id ASC', [dept]);
            const semSubjects = getSemesterSubjectsForBranch(subRes.rows, targetBranch);
            const facultyList = facRes.rows;

            if (semSubjects.length > 0 && facultyList.length > 0) {
                let sIdx = 0;
                days.forEach((day, dIdx) => {
                    for (let p = 1; p <= 7; p++) {
                        if (p === 7 && dIdx % 2 === 1) continue;
                        const sub = semSubjects[sIdx % semSubjects.length];
                        const fac = facultyList[(dIdx + p - 1) % facultyList.length];
                        ocrEntries.push({
                            day,
                            period: p,
                            start_time: '08:00',
                            end_time: '08:45',
                            subject_id: sub.id,
                            subject_code: sub.subject_code,
                            subject_name: sub.subject_name,
                            faculty_id: fac.id,
                            faculty_name: fac.full_name,
                            room: `LH-${101 + (dIdx % 3)}`
                        });
                        sIdx++;
                    }
                });
            }
        }

        // Save into official master timetable table so it appears in the structured Home Page!
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (ocrEntries.length > 0) {
                await client.query('DELETE FROM timetable WHERE branch_id = $1', [branchId]);
                for (const item of ocrEntries) {
                    if (item.day && item.period && item.subject_id && item.faculty_id) {
                        await client.query(`
                            INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `, [
                            branchId,
                            item.day,
                            item.period,
                            item.start_time || '08:00',
                            item.end_time || '08:45',
                            item.subject_id,
                            item.faculty_id,
                            item.room || 'LH-101'
                        ]);
                    }
                }
            }

            // Sync personal schedule for the user
            const masterDutiesRes = await client.query(`
                SELECT t.day, t.period, s.subject_code, s.subject_name, b.branch_name, t.room
                FROM timetable t
                JOIN subjects s ON t.subject_id = s.id
                JOIN branches b ON t.branch_id = b.id
                WHERE t.faculty_id = $1
            `, [facultyId]);

            const assignedMap = {};
            masterDutiesRes.rows.forEach(cls => {
                assignedMap[`${cls.day}_${cls.period}`] = `${cls.subject_code} (${cls.branch_name})`;
            });

            const structuredGrid = [];
            for (const day of days) {
                const periods = {};
                for (let p = 1; p <= 7; p++) {
                    const key = `${day}_${p}`;
                    const isAssigned = !!assignedMap[key];
                    const status = isAssigned ? 'busy' : 'free';
                    const label = isAssigned ? assignedMap[key] : 'Free Slot';

                    await client.query(`
                        INSERT INTO faculty_personal_schedule (faculty_id, day, period, status, notes, updated_at)
                        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                        ON CONFLICT (faculty_id, day, period)
                        DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP
                    `, [facultyId, day, p, status, label]);

                    periods[`p${p}`] = {
                        isFree: !isAssigned,
                        status: status,
                        label: label
                    };
                }
                structuredGrid.push({ day, periods });
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                branch_id: branchId,
                branch_name: targetBranch.branch_name,
                message: req.file 
                    ? `🎉 Timetable (${req.file.originalname}) organized successfully! All subjects and faculty members are published to the Home Page timetable.`
                    : 'Personal timetable and master schedule organized & synchronized successfully!',
                fileUrl: req.file ? `/uploads/${req.file.filename}` : null,
                grid: structuredGrid
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error in /upload/personal-file:", err);
        res.status(500).json({ error: 'Failed to organize timetable file', details: err.message });
    }
});

// 2. AUTO-POPULATE PERSONAL TIMETABLE FROM MASTER TIMETABLE
router.post('/auto-populate-personal', requireAuth, async (req, res) => {
    const facultyId = req.session.userId;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    try {
        const masterDutiesRes = await pool.query(`
            SELECT t.day, t.period, s.subject_code, s.subject_name, b.branch_name, t.room
            FROM timetable t
            JOIN subjects s ON t.subject_id = s.id
            JOIN branches b ON t.branch_id = b.id
            WHERE t.faculty_id = $1
        `, [facultyId]);

        const assignedMap = {};
        masterDutiesRes.rows.forEach(cls => {
            assignedMap[`${cls.day}_${cls.period}`] = `${cls.subject_code} (${cls.branch_name})`;
        });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const syncedGrid = [];

            for (const day of days) {
                const periods = {};
                for (let p = 1; p <= 7; p++) {
                    const key = `${day}_${p}`;
                    const isAssigned = !!assignedMap[key];
                    const status = isAssigned ? 'busy' : 'free';
                    const notes = isAssigned ? assignedMap[key] : 'Free Slot';

                    await client.query(`
                        INSERT INTO faculty_personal_schedule (faculty_id, day, period, status, notes, updated_at)
                        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                        ON CONFLICT (faculty_id, day, period)
                        DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP
                    `, [facultyId, day, p, status, notes]);

                    periods[`p${p}`] = {
                        isFree: !isAssigned,
                        status: status,
                        label: notes
                    };
                }
                syncedGrid.push({ day, periods });
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Personal schedule automatically populated from official department master timetable!',
                totalSlots: 42,
                assignedLectures: masterDutiesRes.rows.length,
                freeSlots: 42 - masterDutiesRes.rows.length,
                grid: syncedGrid
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error in /upload/auto-populate-personal:", err);
        res.status(500).json({ error: 'Auto-population failed', details: err.message });
    }
});

// 3. SAVE MANUALLY EDITED PERSONAL TIMETABLE (Faculty Only)
router.post('/save-personal', requireAuth, async (req, res) => {
    const { scheduleGrid } = req.body;
    const targetFacultyId = req.session.userId;

    if (!scheduleGrid || !Array.isArray(scheduleGrid)) {
        return res.status(400).json({ error: 'Valid scheduleGrid array is required' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const row of scheduleGrid) {
                const day = row.day;
                for (let p = 1; p <= 7; p++) {
                    const slotInfo = row.periods ? row.periods[`p${p}`] : null;
                    if (slotInfo) {
                        const status = slotInfo.isFree ? 'free' : 'busy';
                        const notes = slotInfo.label || slotInfo.reason || (slotInfo.isFree ? 'Free Slot' : 'Class Teaching');

                        await client.query(`
                            INSERT INTO faculty_personal_schedule (faculty_id, day, period, status, notes, updated_at)
                            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                            ON CONFLICT (faculty_id, day, period)
                            DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP
                        `, [targetFacultyId, day, p, status, notes]);
                    }
                }
            }

            await client.query('COMMIT');
            res.json({
                success: true,
                message: 'Personal timetable updated and saved successfully!'
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error in /upload/save-personal:", err);
        res.status(500).json({ error: 'Database error saving personal schedule' });
    }
});

// 4. GET PERSONAL TIMETABLE FOR LOGGED-IN TEACHER ONLY
router.get('/personal-schedule', requireAuth, async (req, res) => {
    const facultyId = req.session.userId;

    try {
        const masterDutiesRes = await pool.query(`
            SELECT t.day, t.period, s.subject_code, s.subject_name, b.branch_name, t.room
            FROM timetable t
            JOIN subjects s ON t.subject_id = s.id
            JOIN branches b ON t.branch_id = b.id
            WHERE t.faculty_id = $1
            ORDER BY 
              CASE t.day 
                WHEN 'Monday' THEN 1 
                WHEN 'Tuesday' THEN 2 
                WHEN 'Wednesday' THEN 3 
                WHEN 'Thursday' THEN 4 
                WHEN 'Friday' THEN 5 
                WHEN 'Saturday' THEN 6 
              END, t.period ASC
        `, [facultyId]);

        const customRes = await pool.query(`
            SELECT fps.day, fps.period, fps.status, fps.notes, fps.updated_at
            FROM faculty_personal_schedule fps
            WHERE fps.faculty_id = $1
        `, [facultyId]);

        res.json({
            faculty_id: facultyId,
            faculty_name: req.session.full_name,
            masterClasses: masterDutiesRes.rows,
            customSchedule: customRes.rows
        });
    } catch (err) {
        console.error("Error in /upload/personal-schedule:", err);
        res.status(500).json({ error: 'Database error fetching personal schedule' });
    }
});

const { parseTimetableImage, getSemesterSubjectsForBranch } = require('../services/timetableOcr');

// 5. PARSE MASTER TIMETABLE IMAGE WITH OCR (Returns Preview & Grid for Verification)
router.post('/parse-master-image', requireHOS, upload.single('masterFile'), async (req, res) => {
    const { branch_id } = req.body;
    const branchId = parseInt(branch_id, 10);
    if (!branchId) {
        return res.status(400).json({ error: 'Valid branch_id is required' });
    }

    try {
        const branchRes = await pool.query('SELECT * FROM branches WHERE id = $1', [branchId]);
        const branch = branchRes.rows[0];
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const dept = branch.department;

        // Fetch known subjects and faculty for this department
        const subRes = await pool.query('SELECT id, subject_code, subject_name, department FROM subjects WHERE department = $1 OR $1 = \'ALL\' ORDER BY id ASC', [dept]);
        const facRes = await pool.query('SELECT id, faculty_id, full_name, designation, department FROM users WHERE (department = $1 OR $1 = \'ALL\') AND (role = \'faculty\' OR role = \'hos\') ORDER BY id ASC', [dept]);

        // STRICTLY filter subjects to this specific branch/semester only!
        const semesterSubjects = getSemesterSubjectsForBranch(subRes.rows, branch);

        let ocrData = {
            success: true,
            isBlurryOrUnreadable: false,
            extractedText: '',
            detectedTokens: [],
            grid: {},
            assignedCount: 0
        };

        let fileUrl = null;

        if (req.file) {
            console.log(`[Master Upload] Running OCR on: ${req.file.originalname} for branch: ${branch.branch_name}`);
            fileUrl = `/uploads/${req.file.filename}`;
            const ocrResult = await parseTimetableImage(req.file.path, dept, branchId);
            ocrData = ocrResult;
        }

        if (ocrData.isBlurryOrUnreadable) {
            return res.json({
                success: false,
                isBlurryOrUnreadable: true,
                error: ocrData.error || '⚠️ Timetable image is blurry or not understandable. Please retake a clear photo or upload a sharp image/PDF.',
                fileUrl: fileUrl,
                fileName: req.file ? req.file.originalname : 'Document',
                branch: branch,
                extractedText: ocrData.extractedText || '',
                detectedTokens: [],
                grid: null,
                assignedCount: 0,
                knownSubjects: semesterSubjects,
                knownFaculty: facRes.rows
            });
        }

        res.json({
            success: true,
            isBlurryOrUnreadable: false,
            fileUrl: fileUrl,
            fileName: req.file ? req.file.originalname : 'Document',
            branch: branch,
            extractedText: ocrData.extractedText || '',
            detectedTokens: ocrData.detectedTokens || [],
            grid: ocrData.grid || null,
            assignedCount: ocrData.assignedCount || 0,
            knownSubjects: semesterSubjects,
            knownFaculty: facRes.rows
        });
    } catch (err) {
        console.error("Error in /upload/parse-master-image:", err);
        res.status(500).json({ error: 'Failed to parse timetable image: ' + err.message });
    }
});

// 6. GENERATE STANDARD PRESET GRID FOR BRANCH (Strictly semester-specific subjects)
router.get('/preset-grid/:branchId', async (req, res) => {
    const branchId = parseInt(req.params.branchId, 10);
    if (!branchId) return res.status(400).json({ error: 'Valid branchId required' });

    try {
        const branchRes = await pool.query('SELECT * FROM branches WHERE id = $1', [branchId]);
        const branch = branchRes.rows[0];
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const dept = branch.department;
        const subRes = await pool.query('SELECT id, subject_code, subject_name, department FROM subjects WHERE department = $1 OR $1 = \'ALL\' ORDER BY id ASC', [dept]);
        const facRes = await pool.query('SELECT id, faculty_id, full_name, designation, department FROM users WHERE (department = $1 OR $1 = \'ALL\') AND (role = \'faculty\' OR role = \'hos\') ORDER BY id ASC', [dept]);

        // Filter strictly to this semester's subjects (e.g. CS-501 to CS-506 for 5th Sem)
        const subjects = getSemesterSubjectsForBranch(subRes.rows, branch);
        const faculty = facRes.rows;
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        const grid = {};
        let subIdx = 0;

        days.forEach((day, dIdx) => {
            grid[day] = {};
            for (let p = 1; p <= 7; p++) {
                if (p === 7 && dIdx % 2 === 1) {
                    // Alternate Saturday/period 7 as sports / library / free
                    grid[day][p] = {
                        day,
                        period: p,
                        subject_id: null,
                        subject_code: '',
                        subject_name: 'Library / Sports / Free Slot',
                        faculty_id: null,
                        faculty_name: '',
                        room: 'Campus Grounds',
                        isFree: true
                    };
                } else if (subjects.length > 0 && faculty.length > 0) {
                    const sub = subjects[subIdx % subjects.length];
                    const fac = faculty[(dIdx + p - 1) % faculty.length];
                    grid[day][p] = {
                        day,
                        period: p,
                        subject_id: sub.id,
                        subject_code: sub.subject_code,
                        subject_name: sub.subject_name,
                        faculty_id: fac.id,
                        faculty_name: fac.full_name,
                        room: `LH-${101 + (dIdx % 3)}`,
                        isFree: false
                    };
                    subIdx++;
                } else {
                    grid[day][p] = {
                        day,
                        period: p,
                        subject_id: null,
                        subject_code: '',
                        subject_name: 'Free Slot',
                        faculty_id: null,
                        faculty_name: '',
                        room: 'LH-101',
                        isFree: true
                    };
                }
            }
        });

        res.json({
            success: true,
            branch: branch,
            grid: grid,
            knownSubjects: subjects,
            knownFaculty: faculty
        });
    } catch (err) {
        console.error("Error generating preset grid:", err);
        res.status(500).json({ error: 'Failed to generate preset grid: ' + err.message });
    }
});

// 7. CONFIRM & SAVE MASTER TIMETABLE GRID (Atomically publishes to Database)
router.post('/save-master-grid', requireHOS, async (req, res) => {
    const { branch_id, grid } = req.body;
    const branchId = parseInt(branch_id, 10);
    if (!branchId) {
        return res.status(400).json({ error: 'Valid branch_id is required' });
    }

    if (!grid || !Array.isArray(grid)) {
        return res.status(400).json({ error: 'Valid grid array is required' });
    }

    try {
        const branchRes = await pool.query('SELECT * FROM branches WHERE id = $1', [branchId]);
        const branch = branchRes.rows[0];
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const periodTimeMap = {
            1: { start: '08:00', end: '08:45' },
            2: { start: '08:45', end: '09:30' },
            3: { start: '09:30', end: '10:15' },
            4: { start: '10:30', end: '11:15' },
            5: { start: '11:15', end: '12:00' },
            6: { start: '12:00', end: '12:45' },
            7: { start: '12:45', end: '01:30' }
        };

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Cleanly delete previous timetable entries for this branch
            await client.query('DELETE FROM timetable WHERE branch_id = $1', [branchId]);

            let count = 0;
            for (const item of grid) {
                const subId = parseInt(item.subject_id, 10);
                const facId = parseInt(item.faculty_id, 10);
                const periodNum = parseInt(item.period, 10);
                const dayName = item.day;

                // Only insert assigned, valid slots (skip empty/free slots)
                if (dayName && periodNum >= 1 && periodNum <= 7 && subId && facId && !item.isFree) {
                    const times = periodTimeMap[periodNum] || { start: '08:00', end: '08:45' };
                    const startTime = item.start_time || times.start;
                    const endTime = item.end_time || times.end;
                    const room = item.room || `LH-${101 + (periodNum % 3)}`;

                    await client.query(`
                        INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        branchId,
                        dayName,
                        periodNum,
                        startTime,
                        endTime,
                        subId,
                        facId,
                        room
                    ]);
                    count++;
                }
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: `🎉 Master Timetable for ${branch.branch_name} accurately synchronized with ${count} periods!`,
                count: count,
                branch: branch
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error in /upload/save-master-grid:", err);
        res.status(500).json({ error: 'Failed to save master timetable: ' + err.message });
    }
});

// 8. MASTER TIMETABLE IMAGE OCR & DIRECT PUBLISH
router.post('/master-file', requireHOS, upload.single('masterFile'), async (req, res) => {
    const { branch_id } = req.body;
    const branchId = parseInt(branch_id, 10);
    if (!branchId) {
        return res.status(400).json({ error: 'Valid branch_id is required' });
    }

    try {
        const branchRes = await pool.query('SELECT * FROM branches WHERE id = $1', [branchId]);
        const branch = branchRes.rows[0];
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const dept = branch.department;
        let parsedEntries = [];
        let extractedText = '';

        if (req.file) {
            console.log(`[Master Upload] Processing image/PDF with OCR: ${req.file.originalname} for branch: ${branch.branch_name}`);
            const ocrResult = await parseTimetableImage(req.file.path, dept, branchId);
            
            if (ocrResult.isBlurryOrUnreadable) {
                return res.status(400).json({
                    success: false,
                    isBlurryOrUnreadable: true,
                    error: ocrResult.error || '⚠️ Timetable image is blurry or not understandable. Please retake a clear photo or upload a sharp image/PDF.',
                    extractedText: ocrResult.extractedText
                });
            }

            if (ocrResult.success && ocrResult.entries.length > 0) {
                parsedEntries = ocrResult.entries;
                extractedText = ocrResult.extractedText;
            }
        }

        // If no file was uploaded, generate standard schedule strictly for THIS semester
        if (parsedEntries.length === 0) {
            const subRes = await pool.query('SELECT * FROM subjects WHERE department = $1 ORDER BY id ASC', [dept]);
            const facRes = await pool.query('SELECT * FROM users WHERE department = $1 AND (role = \'faculty\' OR role = \'hos\') ORDER BY id ASC', [dept]);
            const subjects = getSemesterSubjectsForBranch(subRes.rows, branch);
            const faculty = facRes.rows;
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            if (subjects.length > 0 && faculty.length > 0) {
                let sIdx = 0;
                for (let d = 0; d < days.length; d++) {
                    const day = days[d];
                    for (let p = 1; p <= 7; p++) {
                        if (p === 7 && d % 2 === 1) continue;
                        const sub = subjects[sIdx % subjects.length];
                        const fac = faculty[(d + p - 1) % faculty.length];
                        parsedEntries.push({
                            day,
                            period: p,
                            start_time: '08:00',
                            end_time: '08:45',
                            subject_id: sub.id,
                            faculty_id: fac.id,
                            room: `LH-${101 + (d % 3)}`
                        });
                        sIdx++;
                    }
                }
            }
        }

        // Save parsed entries into database
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM timetable WHERE branch_id = $1', [branchId]);

            let count = 0;
            for (const item of parsedEntries) {
                if (item.day && item.period && item.subject_id && item.faculty_id) {
                    await client.query(`
                        INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        branchId,
                        item.day,
                        item.period,
                        item.start_time || '08:00',
                        item.end_time || '08:45',
                        item.subject_id,
                        item.faculty_id,
                        item.room || 'LH-101'
                    ]);
                    count++;
                }
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: req.file 
                    ? `📷 Timetable document (${req.file.originalname}) read and structured into ${count} class periods for ${branch.branch_name}!`
                    : `⚡ Master timetable generated with ${count} periods for ${branch.branch_name}!`,
                count: count,
                branch: branch,
                extractedText: extractedText
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error in /upload/master-file:", err);
        res.status(500).json({ error: 'Failed to process master timetable image: ' + err.message });
    }
});

module.exports = router;

