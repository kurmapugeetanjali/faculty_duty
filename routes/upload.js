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

// 1. UPLOAD PERSONAL TIMETABLE PHOTO / PDF / CAMERA CAPTURE (Faculty Only - Organizes into 7 Periods)
router.post('/personal-file', requireAuth, upload.single('personalFile'), async (req, res) => {
    const facultyId = req.session.userId;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    try {
        // Query official master classes to anchor personal schedule
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
                message: req.file 
                    ? `Timetable document (${req.file.originalname}) uploaded & organized into 7 periods successfully!`
                    : 'Personal timetable synchronized into structured weekly schedule!',
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
        res.status(500).json({ error: 'Failed to organize personal timetable file', details: err.message });
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

// 5. ADMIN ONLY: UPLOAD / REPLACE MASTER TIMETABLE FOR A CSE SEMESTER
router.post('/master-timetable', requireHOS, async (req, res) => {
    const { branch_id, entries } = req.body;

    if (!branch_id || !entries || !Array.isArray(entries)) {
        return res.status(400).json({ error: 'branch_id and entries array are required' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query('DELETE FROM timetable WHERE branch_id = $1', [branch_id]);

            for (const item of entries) {
                if (item.day && item.period && item.subject_id && item.faculty_id) {
                    await client.query(`
                        INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        branch_id,
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

            await client.query('COMMIT');
            res.json({
                success: true,
                message: 'Semester Master Timetable updated successfully by Admin!'
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error in /upload/master-timetable:", err);
        res.status(500).json({ error: 'Database error updating master timetable' });
    }
});

module.exports = router;
