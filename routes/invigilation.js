const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// 1. GET all exam invigilations (Public to authenticated department faculty)
router.get('/', async (req, res) => {
    const { date, department } = req.query;
    try {
        let query = `
            SELECT ei.id, ei.exam_name, ei.exam_date, ei.session, ei.hall_no, ei.department, ei.notes, ei.photo_url, ei.created_at,
                   u.id AS faculty_id, u.full_name AS faculty_name, u.phone AS faculty_phone,
                   u.department AS faculty_dept, u.designation
            FROM exam_invigilation ei
            LEFT JOIN users u ON ei.faculty_id = u.id
        `;
        const conditions = [];
        const params = [];

        if (department) {
            params.push(department);
            conditions.push(`(ei.department = $${params.length} OR (ei.department IN ('CSE', 'CME') AND $${params.length} IN ('CSE', 'CME')))`);
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

// 2. ADMIN ONLY: Upload exam schedule image / PDF circular and assign invigilator
router.post('/upload-schedule', requireHOS, upload.single('examFile'), async (req, res) => {
    const { exam_name, exam_date, hall_no, faculty_id, faculty_name, notes } = req.body;

    if (!exam_name || !exam_date) {
        return res.status(400).json({ error: 'exam_name and exam_date are required' });
    }

    try {
        let assignedFacultyId = parseInt(faculty_id, 10) || null;
        let assignedName = faculty_name || '';

        // If faculty_name was passed but not id, lookup user
        if (!assignedFacultyId && assignedName) {
            const userRes = await pool.query('SELECT id, full_name FROM users WHERE full_name ILIKE $1 LIMIT 1', [`%${assignedName}%`]);
            if (userRes.rows.length > 0) {
                assignedFacultyId = userRes.rows[0].id;
                assignedName = userRes.rows[0].full_name;
            }
        }

        const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const noteText = notes || (assignedName ? `Assigned: ${assignedName}` : 'Uploaded from Exam Circular');

        const insertRes = await pool.query(`
            INSERT INTO exam_invigilation (department, exam_name, exam_date, session, hall_no, faculty_id, photo_url, notes)
            VALUES ('CSE', $1, $2, 'Exam Duty', $3, $4, $5, $6)
            RETURNING id
        `, [exam_name, exam_date, hall_no || 'Assigned Room', assignedFacultyId, photoUrl, noteText]);

        res.json({
            success: true,
            message: 'Exam duty schedule uploaded & registered successfully by Admin!',
            dutyId: insertRes.rows[0].id,
            photoUrl: photoUrl
        });
    } catch (err) {
        console.error("Error in POST /api/invigilation/upload-schedule:", err);
        res.status(500).json({ error: 'Failed to upload exam schedule', details: err.message });
    }
});

// 3. ADMIN ONLY: Quick add exam invigilation entry
router.post('/', requireHOS, async (req, res) => {
    const { exam_name, exam_date, hall_no, faculty_id, faculty_name, notes } = req.body;

    if (!exam_name || !exam_date) {
        return res.status(400).json({ error: 'exam_name and exam_date are required' });
    }

    try {
        let assignedFacultyId = parseInt(faculty_id, 10) || null;
        let assignedName = faculty_name || '';

        if (!assignedFacultyId && assignedName) {
            const userRes = await pool.query('SELECT id, full_name FROM users WHERE full_name ILIKE $1 LIMIT 1', [`%${assignedName}%`]);
            if (userRes.rows.length > 0) {
                assignedFacultyId = userRes.rows[0].id;
                assignedName = userRes.rows[0].full_name;
            }
        }

        const noteText = notes || (assignedName ? `Invigilator: ${assignedName}` : '');

        const result = await pool.query(`
            INSERT INTO exam_invigilation (exam_name, exam_date, session, hall_no, faculty_id, department, notes)
            VALUES ($1, $2, 'Exam Duty', $3, $4, 'CSE', $5) RETURNING id
        `, [exam_name, exam_date, hall_no || 'Drawing Hall', assignedFacultyId, noteText]);

        res.json({
            success: true,
            message: 'Exam invigilation scheduled successfully',
            id: result.rows[0].id
        });
    } catch (err) {
        console.error("Error in POST /api/invigilation:", err);
        res.status(500).json({ error: 'Database error scheduling invigilation' });
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

// 5. ADMIN ONLY: Clear all completed examinations
router.post('/clear-completed', requireHOS, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const delRes = await pool.query('DELETE FROM exam_invigilation WHERE exam_date < $1', [today]);
        res.json({
            success: true,
            message: `Cleared ${delRes.rowCount} completed past examination records.`
        });
    } catch (err) {
        console.error("Error clearing completed exams:", err);
        res.status(500).json({ error: 'Database error clearing exams' });
    }
});

module.exports = router;
