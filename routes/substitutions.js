const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { requireAuth } = require('../middleware/auth');

// Get available faculty list with Master TT, Personal Schedule & Simplified Invigilation Name Matching
router.get('/available', async (req, res) => {
    const { date, day, period, original_faculty_id, department } = req.query;

    if (!date || !day || !period) {
        return res.status(400).json({ error: 'date, day, and period query parameters are required' });
    }

    const currentPeriod = parseInt(period, 10);
    const requesterId = parseInt(original_faculty_id, 10) || (req.session && req.session.userId) || 0;
    const targetDept = department || 'CSE';

    try {
        // Query faculty in target department who are NOT teaching in master timetable during this slot
        const query = `
            SELECT 
                u.id, 
                u.faculty_id, 
                u.full_name, 
                u.phone, 
                u.department, 
                u.designation,
                (
                    SELECT COUNT(*) 
                    FROM timetable t2 
                    WHERE t2.faculty_id = u.id AND t2.day = $1
                ) AS classes_today,
                -- Check if faculty name or ID exists in exam_invigilation for this date
                (
                    SELECT json_build_object(
                        'exam_name', ei.exam_name,
                        'hall_no', COALESCE(ei.hall_no, 'Assigned Hall'),
                        'session', COALESCE(ei.session, 'Exam Session')
                    )
                    FROM exam_invigilation ei
                    WHERE (ei.faculty_id = u.id OR LOWER(ei.notes) LIKE '%' || LOWER(u.full_name) || '%' OR LOWER(ei.notes) LIKE '%' || LOWER(u.faculty_id) || '%')
                    AND (ei.exam_date = $3 OR to_char(ei.exam_date::date, 'FMDay') = $1)
                    LIMIT 1
                ) AS invigilation_info,
                -- Check if faculty has custom personal schedule marked for this day & period
                (
                    SELECT fps.status
                    FROM faculty_personal_schedule fps
                    WHERE fps.faculty_id = u.id AND fps.day = $1 AND fps.period = $2
                    LIMIT 1
                ) AS personal_status,
                (
                    SELECT fps.notes
                    FROM faculty_personal_schedule fps
                    WHERE fps.faculty_id = u.id AND fps.day = $1 AND fps.period = $2
                    LIMIT 1
                ) AS personal_notes,
                -- Check if faculty is already acting as substitute in another class
                (
                    SELECT COUNT(*)
                    FROM substitutions s
                    JOIN timetable t ON s.timetable_id = t.id
                    WHERE s.substitute_faculty_id = u.id AND s.date = $3 AND t.period = $2 AND s.status != 'cancelled'
                ) AS active_sub_count
            FROM users u
            WHERE (u.role = 'faculty' OR u.role = 'hos')
            AND (u.department = $5 OR (u.department IN ('CSE', 'CME') AND $5 IN ('CSE', 'CME')))
            AND u.id != $4
            -- Must NOT be teaching in any class/branch in the master timetable at this day & period
            AND u.id NOT IN (
                SELECT faculty_id 
                FROM timetable 
                WHERE day = $1 AND period = $2
            )
            ORDER BY 
               CASE WHEN (
                   SELECT ei.id FROM exam_invigilation ei 
                   WHERE (ei.faculty_id = u.id OR LOWER(ei.notes) LIKE '%' || LOWER(u.full_name) || '%') 
                   AND (ei.exam_date = $3 OR to_char(ei.exam_date::date, 'FMDay') = $1) LIMIT 1
               ) IS NOT NULL THEN 1 ELSE 0 END,
               u.full_name ASC;
        `;

        const result = await pool.query(query, [day, currentPeriod, date, requesterId, targetDept]);

        // Process status: All available faculty are displayed
        const processedFaculty = result.rows.map(fac => {
            const hasExamDuty = fac.invigilation_info !== null;
            const hasSubDuty = parseInt(fac.active_sub_count, 10) > 0;
            const isPersonalBusy = fac.personal_status === 'busy';

            let availabilityStatus = 'available';
            let statusBadge = '🟢 Completely Free';
            let isSelectable = true;
            let note = 'Free period verified (Master Timetable & Personal Schedule Free)';

            if (hasExamDuty) {
                availabilityStatus = 'invigilation_busy';
                statusBadge = '⚠️ In Exam Invigilation';
                isSelectable = true; // Displayed and selectable if faculty is chosen
                note = `Assigned to ${fac.invigilation_info.exam_name} on ${date}`;
            } else if (hasSubDuty) {
                availabilityStatus = 'substitution_busy';
                statusBadge = '🔄 Already Substituting';
                isSelectable = false;
                note = 'Already acting as substitute for another lecture during this period';
            } else if (isPersonalBusy) {
                availabilityStatus = 'personal_busy';
                statusBadge = '🔴 Personal Busy';
                isSelectable = false;
                note = fac.personal_notes || 'Marked busy in personal timetable';
            }

            return {
                id: fac.id,
                faculty_id: fac.faculty_id,
                full_name: fac.full_name,
                phone: fac.phone,
                department: fac.department,
                designation: fac.designation,
                classes_today: parseInt(fac.classes_today, 10),
                availability_status: availabilityStatus,
                status_badge: statusBadge,
                is_selectable: isSelectable,
                has_exam_duty: hasExamDuty,
                note: note,
                invigilation_info: fac.invigilation_info
            };
        });

        res.json(processedFaculty);
    } catch (err) {
        console.error("Error in /substitutions/available:", err);
        res.status(500).json({ error: 'Database error checking availability', details: err.message });
    }
});

// Assign a substitute faculty member
router.post('/assign', requireAuth, async (req, res) => {
    const { timetable_id, date, substitute_faculty_id, reason, notes } = req.body;
    const original_faculty_id = req.session.userId;

    if (!timetable_id || !date || !substitute_faculty_id || !reason) {
        return res.status(400).json({ error: 'timetable_id, date, substitute_faculty_id, and reason are required' });
    }

    try {
        const checkRes = await pool.query(`
            SELECT s.id 
            FROM substitutions s
            JOIN timetable t ON s.timetable_id = t.id
            WHERE s.date = $1 
              AND s.substitute_faculty_id = $2 
              AND t.period = (SELECT period FROM timetable WHERE id = $3)
              AND s.status != 'cancelled'
        `, [date, substitute_faculty_id, timetable_id]);

        if (checkRes.rows.length > 0) {
            return res.status(400).json({ error: 'This faculty member is already booked as a substitute for another class at this time.' });
        }

        const insertRes = await pool.query(`
            INSERT INTO substitutions (timetable_id, date, original_faculty_id, substitute_faculty_id, reason, status)
            VALUES ($1, $2, $3, $4, $5, 'accepted')
            RETURNING id
        `, [timetable_id, date, original_faculty_id, substitute_faculty_id, reason]);

        res.json({
            message: 'Substitute assigned and recorded successfully!',
            substitutionId: insertRes.rows[0].id
        });
    } catch (err) {
        console.error("Error assigning substitute:", err);
        res.status(500).json({ error: 'Failed to assign substitute' });
    }
});

// Get substitution history
router.get('/history', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.id, s.date, s.reason, s.status, s.created_at,
                   t.day, t.period, t.start_time, t.end_time, t.room,
                   sub.subject_code, sub.subject_name,
                   b.branch_name, b.department,
                   orig.full_name AS original_faculty_name, orig.phone AS original_faculty_phone,
                   subst.full_name AS substitute_faculty_name, subst.phone AS substitute_faculty_phone
            FROM substitutions s
            JOIN timetable t ON s.timetable_id = t.id
            JOIN subjects sub ON t.subject_id = sub.id
            JOIN branches b ON t.branch_id = b.id
            JOIN users orig ON s.original_faculty_id = orig.id
            JOIN users subst ON s.substitute_faculty_id = subst.id
            ORDER BY s.date DESC, t.period ASC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching substitution history:", err);
        res.status(500).json({ error: 'Database error fetching history' });
    }
});

module.exports = router;
