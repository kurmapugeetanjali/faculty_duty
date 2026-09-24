const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { requireAuth } = require('../middleware/auth');

// Get available faculty list with Master TT, Personal Schedule & 3-Period Lab Block Binding
router.get('/available', async (req, res) => {
    const { date, day, period, original_faculty_id, department, branch_id } = req.query;

    if (!date || !day || !period) {
        return res.status(400).json({ error: 'date, day, and period query parameters are required' });
    }

    const currentPeriod = parseInt(period, 10);
    const requesterId = parseInt(original_faculty_id, 10) || (req.session && req.session.userId) || 0;
    const targetDept = department || 'CSE';
    const bId = branch_id ? parseInt(branch_id, 10) : 4;

    try {
        // 1. Check if this period is part of a multi-period / 3-period continuous lab session
        const currentSlotRes = await pool.query(`
            SELECT t.id, t.period, t.room, s.subject_code, s.subject_name, u.full_name as faculty_name, t.faculty_id
            FROM timetable t
            JOIN subjects s ON t.subject_id = s.id
            JOIN users u ON t.faculty_id = u.id
            WHERE t.branch_id = $1 AND t.day = $2 AND t.period = $3
        `, [bId, day, currentPeriod]);

        let isLabBlock = false;
        let labBlockPeriods = [currentPeriod];
        let labSubjectName = '';

        if (currentSlotRes.rows.length > 0) {
            const currentSlot = currentSlotRes.rows[0];
            labSubjectName = currentSlot.subject_name;
            const codeUpper = (currentSlot.subject_code || '').toUpperCase();
            const nameUpper = (currentSlot.subject_name || '').toUpperCase();
            const roomUpper = (currentSlot.room || '').toUpperCase();

            // Check if it's a lab or if adjacent periods have the exact same subject
            const isLab = codeUpper.includes('505') || nameUpper.includes('LAB') || roomUpper.includes('LAB') || codeUpper.includes('502');

            // Find all periods on this day with same subject_code / lab
            const allDayRes = await pool.query(`
                SELECT t.period, s.subject_code, s.subject_name
                FROM timetable t
                JOIN subjects s ON t.subject_id = s.id
                WHERE t.branch_id = $1 AND t.day = $2 AND (s.subject_code = $3 OR s.subject_name = $4)
                ORDER BY t.period ASC
            `, [bId, day, currentSlot.subject_code, currentSlot.subject_name]);

            const matchingPeriods = allDayRes.rows.map(r => r.period);
            if (matchingPeriods.length >= 2 && matchingPeriods.includes(currentPeriod)) {
                isLabBlock = true;
                labBlockPeriods = matchingPeriods;
            } else if (isLab && (currentPeriod === 4 || currentPeriod === 5 || currentPeriod === 6)) {
                isLabBlock = true;
                labBlockPeriods = [4, 5, 6];
            } else if (isLab && (currentPeriod === 5 || currentPeriod === 6 || currentPeriod === 7)) {
                isLabBlock = true;
                labBlockPeriods = [5, 6, 7];
            }
        }

        // 2. Query all eligible faculty in the department
        const facultyRes = await pool.query(`
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
                -- Periods candidate is teaching in master timetable on this day
                (
                    SELECT json_agg(t_busy.period)
                    FROM timetable t_busy
                    WHERE t_busy.faculty_id = u.id AND t_busy.day = $1
                ) AS master_busy_periods,
                -- Personal busy periods marked in faculty personal schedule
                (
                    SELECT json_agg(fps.period)
                    FROM faculty_personal_schedule fps
                    WHERE fps.faculty_id = u.id AND fps.day = $1 AND fps.status = 'busy'
                ) AS personal_busy_periods,
                -- Active substitutions
                (
                    SELECT COUNT(*)
                    FROM substitutions s
                    JOIN timetable t ON s.timetable_id = t.id
                    WHERE s.substitute_faculty_id = u.id AND s.date = $3 AND t.period = $2 AND s.status != 'cancelled'
                ) AS active_sub_count
            FROM users u
            WHERE (u.role = 'faculty' OR u.role = 'hos')
            AND (u.department = $5 OR $5 = 'ALL')
            AND u.id != $4
            ORDER BY u.full_name ASC
        `, [day, currentPeriod, date, requesterId, targetDept]);

        // 3. Process candidate availability against all target periods (1 slot or 3-period lab block)
        const processedFaculty = [];

        facultyRes.rows.forEach(fac => {
            const masterBusy = fac.master_busy_periods || [];
            const personalBusy = fac.personal_busy_periods || [];
            const hasExamDuty = fac.invigilation_info !== null;
            const hasSubDuty = parseInt(fac.active_sub_count, 10) > 0;

            // Check if candidate is teaching in master timetable during the selected period
            const isTeachingCurrent = masterBusy.includes(currentPeriod);
            
            // Check conflicts across the entire 3-period lab block (if applicable)
            const labConflicts = labBlockPeriods.filter(p => masterBusy.includes(p) || personalBusy.includes(p));
            const isCompletelyFreeForLab = (labConflicts.length === 0);

            // Determine status
            let availabilityStatus = 'available';
            let statusBadge = '🟢 Completely Free';
            let isSelectable = true;
            let note = isLabBlock
                ? `Free for full 3-period Lab session (Periods ${labBlockPeriods.join(', ')})`
                : 'Free period verified (Master Timetable & Personal Schedule Free)';

            if (isTeachingCurrent) {
                availabilityStatus = 'teaching_busy';
                statusBadge = '🔴 Teaching Master Class';
                isSelectable = false;
                note = `Assigned to lecture in Period ${currentPeriod} in Master Timetable`;
            } else if (hasExamDuty) {
                availabilityStatus = 'invigilation_busy';
                statusBadge = '⚠️ In Exam Invigilation';
                isSelectable = true;
                note = `Exam Duty: ${fac.invigilation_info.hall_no || 'Hall'} • ${fac.invigilation_info.session || 'Session'}`;
            } else if (hasSubDuty) {
                availabilityStatus = 'substitution_busy';
                statusBadge = '🔄 Already Substituting';
                isSelectable = false;
                note = 'Already acting as substitute for another class during this period';
            } else if (personalBusy.includes(currentPeriod)) {
                availabilityStatus = 'personal_busy';
                statusBadge = '🔴 Personal Busy';
                isSelectable = false;
                note = 'Marked busy in personal timetable';
            } else if (isLabBlock && !isCompletelyFreeForLab) {
                // Free in current period but busy in other periods of the 3-period lab block
                availabilityStatus = 'lab_partial_busy';
                statusBadge = `⚠️ Busy in Period ${labConflicts.join(', ')}`;
                isSelectable = false;
                note = `Has conflict in Period ${labConflicts.join(', ')} of this 3-period lab block`;
            }

            // Only return faculty who are not teaching in the current period (or include all with clear status)
            if (!isTeachingCurrent) {
                processedFaculty.push({
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
                    is_lab_block: isLabBlock,
                    lab_block_periods: labBlockPeriods,
                    is_completely_free_for_lab: isCompletelyFreeForLab,
                    note: note,
                    invigilation_info: fac.invigilation_info
                });
            }
        });

        // Sort: completely free first, then exam duty, then others
        processedFaculty.sort((a, b) => {
            if (a.availability_status === 'available' && b.availability_status !== 'available') return -1;
            if (b.availability_status === 'available' && a.availability_status !== 'available') return 1;
            if (a.availability_status === 'invigilation_busy' && b.availability_status !== 'invigilation_busy') return -1;
            if (b.availability_status === 'invigilation_busy' && a.availability_status !== 'invigilation_busy') return 1;
            return a.full_name.localeCompare(b.full_name);
        });

        res.json({
            success: true,
            is_lab_block: isLabBlock,
            lab_block_periods: labBlockPeriods,
            lab_subject_name: labSubjectName,
            faculty: processedFaculty
        });
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
            WHERE s.timetable_id = $1 AND s.date = $2 AND s.status != 'cancelled'
        `, [timetable_id, date]);

        if (checkRes.rows.length > 0) {
            return res.status(400).json({ error: 'A substitute is already assigned for this class period on this date.' });
        }

        const insertRes = await pool.query(`
            INSERT INTO substitutions (timetable_id, date, original_faculty_id, substitute_faculty_id, status, reason, notes)
            VALUES ($1, $2, $3, $4, 'pending', $5, $6)
            RETURNING *
        `, [timetable_id, date, original_faculty_id, substitute_faculty_id, reason, notes || '']);

        res.json({
            message: 'Substitute request submitted successfully! Notification sent to substitute faculty.',
            substitution: insertRes.rows[0]
        });
    } catch (err) {
        console.error("Error assigning substitute:", err);
        res.status(500).json({ error: 'Database error assigning substitute' });
    }
});

module.exports = router;
