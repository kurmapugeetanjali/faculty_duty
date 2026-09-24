const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { requireAuth, requireHOS } = require('../middleware/auth');

// Get all active departments in the polytechnic institution
router.get('/departments', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT department FROM branches ORDER BY department ASC');
        const data = result.rows.map(r => r.department);
        res.json(data);
    } catch (err) {
        console.error("Error fetching departments:", err);
        res.status(500).json({ error: 'Database error fetching departments' });
    }
});

// Get branches (optionally filtered by department)
router.get('/branches', async (req, res) => {
    const { department } = req.query;
    try {
        let query = 'SELECT id, branch_name, department, year, section FROM branches';
        const params = [];
        if (department && department !== 'ALL') {
            query += ' WHERE department = $1';
            params.push(department.toUpperCase());
        }
        query += ' ORDER BY id ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching branches:", err);
        res.status(500).json({ error: 'Database error fetching branches' });
    }
});

const { getSemesterSubjectsForBranch } = require('../services/timetableOcr');

// Get meta options (subjects and faculty) filtered by department and branch/semester
router.get('/meta/options', async (req, res) => {
    const { department, branch_id } = req.query;
    let dept = (department || 'CSE').toUpperCase();
    let targetBranch = null;

    try {
        if (branch_id) {
            const bRes = await pool.query('SELECT * FROM branches WHERE id = $1', [parseInt(branch_id, 10)]);
            if (bRes.rows.length > 0) {
                targetBranch = bRes.rows[0];
                dept = targetBranch.department;
            }
        }

        const subjectsRes = await pool.query(
            `SELECT id, subject_code, subject_name, department FROM subjects 
             WHERE department = $1 OR $1 = 'ALL'
             ORDER BY subject_code ASC`,
            [dept]
        );
        const facultyRes = await pool.query(
            `SELECT id, faculty_id, full_name, designation, phone FROM users 
             WHERE (role = 'faculty' OR role = 'hos') 
             AND (department = $1 OR $1 = 'ALL')
             ORDER BY full_name ASC`,
            [dept]
        );

        const filteredSubjects = targetBranch 
            ? getSemesterSubjectsForBranch(subjectsRes.rows, targetBranch)
            : subjectsRes.rows;

        res.json({
            subjects: filteredSubjects,
            faculty: facultyRes.rows
        });
    } catch (err) {
        console.error("Error fetching timetable meta options:", err);
        res.status(500).json({ error: 'Database error fetching meta options' });
    }
});

// Get timetable for a specific branch (Real-Time Live DB query)
router.get('/:branch_id', async (req, res) => {
    const branchId = req.params.branch_id;
    try {
        const result = await pool.query(`
            SELECT t.id, t.branch_id, t.day, t.period, t.start_time, t.end_time, t.room,
                   b.department, b.branch_name,
                   s.id AS subject_id, s.subject_code, s.subject_name,
                   u.id AS faculty_id, u.full_name AS faculty_name, u.phone AS faculty_phone
            FROM timetable t
            JOIN branches b ON t.branch_id = b.id
            JOIN subjects s ON t.subject_id = s.id
            JOIN users u ON t.faculty_id = u.id
            WHERE t.branch_id = $1
            ORDER BY 
              CASE t.day 
                WHEN 'Monday' THEN 1 
                WHEN 'Tuesday' THEN 2 
                WHEN 'Wednesday' THEN 3 
                WHEN 'Thursday' THEN 4 
                WHEN 'Friday' THEN 5 
                WHEN 'Saturday' THEN 6 
              END, t.period ASC
        `, [branchId]);
        
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching timetable:", err);
        res.status(500).json({ error: 'Database error fetching timetable' });
    }
});

// Add a new period to the master timetable (HOD only)
router.post('/', requireHOS, async (req, res) => {
    const { branch_id, day, period, start_time, end_time, subject_id, faculty_id, room } = req.body;
    
    if (!branch_id || !day || !period || !subject_id || !faculty_id) {
        return res.status(400).json({ error: 'branch_id, day, period, subject_id, and faculty_id are required' });
    }

    try {
        const existing = await pool.query(
            'SELECT id FROM timetable WHERE branch_id = $1 AND day = $2 AND period = $3',
            [branch_id, day, period]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: `Period ${period} on ${day} is already scheduled for this branch. Please edit or choose another period.` });
        }

        const periodTimes = {
            1: { s: '08:00', e: '08:45' },
            2: { s: '08:45', e: '09:30' },
            3: { s: '09:30', e: '10:15' },
            4: { s: '10:30', e: '11:15' },
            5: { s: '11:15', e: '12:00' },
            6: { s: '12:00', e: '12:45' },
            7: { s: '12:45', e: '01:30' }
        };
        const defaultStart = (periodTimes[period] && periodTimes[period].s) || '08:00';
        const defaultEnd = (periodTimes[period] && periodTimes[period].e) || '08:45';

        const result = await pool.query(`
            INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
        `, [branch_id, day, period, start_time || defaultStart, end_time || defaultEnd, subject_id, faculty_id, room || 'LH-101']);
        
        res.json({ message: 'Period added to master timetable successfully', id: result.rows[0].id });
    } catch (err) {
        console.error("Error adding timetable slot:", err);
        res.status(500).json({ error: 'Database error adding timetable period' });
    }
});

// Update a period in the master timetable (HOD only)
router.put('/:id', requireHOS, async (req, res) => {
    const { subject_id, faculty_id, room, start_time, end_time } = req.body;
    
    try {
        await pool.query(`
            UPDATE timetable 
            SET subject_id = COALESCE($1, subject_id), 
                faculty_id = COALESCE($2, faculty_id), 
                room = COALESCE($3, room),
                start_time = COALESCE($4, start_time),
                end_time = COALESCE($5, end_time)
            WHERE id = $6
        `, [subject_id, faculty_id, room, start_time, end_time, req.params.id]);
        
        res.json({ message: 'Period updated successfully in official timetable' });
    } catch (err) {
        console.error("Error updating timetable slot:", err);
        res.status(500).json({ error: 'Database error updating timetable period' });
    }
});

// Delete a period from the master timetable (HOD only)
router.delete('/:id', requireHOS, async (req, res) => {
    try {
        await pool.query('DELETE FROM timetable WHERE id = $1', [req.params.id]);
        res.json({ message: 'Period removed from master timetable' });
    } catch (err) {
        console.error("Error deleting timetable slot:", err);
        res.status(500).json({ error: 'Database error deleting timetable period' });
    }
});

module.exports = router;
