const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

// Endpoint invoked by n8n Webhook or internal comparison runner
router.post('/compare-substitution', async (req, res) => {
    const { date, day, period, original_faculty_id } = req.body;

    if (!date || !day || !period) {
        return res.status(400).json({ error: 'date, day, and period are required' });
    }

    const currentPeriod = parseInt(period, 10);
    const examSessionPattern = currentPeriod <= 3 ? 'Morning%' : 'Afternoon%';
    const requesterId = original_faculty_id || 0;

    const pipelineTrace = [];
    const startTime = Date.now();

    try {
        // Step 1: Query Master Timetable Busy Faculty
        pipelineTrace.push({
            step: 1,
            name: "Master Schedule Scan",
            description: `Querying college master timetable for all faculty occupied on ${day} Period ${period}`,
            status: "running"
        });
        const masterBusyRes = await pool.query(
            `SELECT DISTINCT faculty_id FROM timetable WHERE day = $1 AND period = $2`,
            [day, currentPeriod]
        );
        const masterBusyIds = masterBusyRes.rows.map(r => r.faculty_id);
        pipelineTrace[0].status = "completed";
        pipelineTrace[0].result = `Found ${masterBusyIds.length} faculty members scheduled in master timetable.`;

        // Step 2: Personal Timetable Scan (Checking empty boxes and drawn lines)
        pipelineTrace.push({
            step: 2,
            name: "Personal Schedule & Drawn-Line Evaluation",
            description: `Checking individual teacher timetables: empty boxes and drawn lines (-, ---, NIL) are validated as free`,
            status: "running"
        });
        const personalBusyRes = await pool.query(
            `SELECT DISTINCT faculty_id FROM faculty_personal_schedule WHERE day = $1 AND period = $2 AND status IN ('busy', 'lab', 'meeting')`,
            [day, currentPeriod]
        );
        const personalBusyIds = personalBusyRes.rows.map(r => r.faculty_id);
        pipelineTrace[1].status = "completed";
        pipelineTrace[1].result = `${personalBusyIds.length} faculty have busy lab/meeting commitments; remaining have free slots / drawn lines.`;

        // Step 3: Exam Invigilation Conflict Cross-Check
        pipelineTrace.push({
            step: 3,
            name: "Exam Invigilation Roster Verification",
            description: `Cross-referencing upcoming exam invigilator rosters for ${date} (${examSessionPattern.replace('%', '')} session)`,
            status: "running"
        });
        const examBusyRes = await pool.query(
            `SELECT DISTINCT faculty_id FROM exam_invigilation WHERE exam_date = $1 AND faculty_id IS NOT NULL`,
            [date]
        );
        const examBusyIds = examBusyRes.rows.map(r => r.faculty_id);
        pipelineTrace[2].status = "completed";
        pipelineTrace[2].result = `${examBusyIds.length} faculty members are on exam invigilation duty during this date.`;

        // Step 4: Existing Substitutions Check
        pipelineTrace.push({
            step: 4,
            name: "Substitution Registry Filter",
            description: `Verifying faculty members are not already assigned as substitutes on ${date} Period ${period}`,
            status: "running"
        });
        const subBusyRes = await pool.query(
            `SELECT DISTINCT s.substitute_faculty_id FROM substitutions s JOIN timetable t ON s.timetable_id = t.id WHERE s.date = $1 AND t.period = $2 AND s.status != 'cancelled'`,
            [date, currentPeriod]
        );
        const subBusyIds = subBusyRes.rows.map(r => r.substitute_faculty_id);
        pipelineTrace[3].status = "completed";
        pipelineTrace[3].result = `${subBusyIds.length} faculty already acting as substitutes on this date/period.`;

        // Step 5: Candidate Compilation & Contact Information
        pipelineTrace.push({
            step: 5,
            name: "Available Faculty Resolution & Phone Directory Match",
            description: "Retrieving verified free faculty with official contact numbers, departments, and designations",
            status: "running"
        });

        // Combine all exclusion IDs
        const allExcludedIds = new Set([
            requesterId,
            ...masterBusyIds,
            ...personalBusyIds,
            ...examBusyIds,
            ...subBusyIds
        ]);

        const candidateRes = await pool.query(`
            SELECT id, faculty_id, full_name, email, phone, department, designation
            FROM users
            WHERE role = 'faculty' AND id != ALL($1::int[])
            ORDER BY full_name ASC
        `, [Array.from(allExcludedIds)]);

        pipelineTrace[4].status = "completed";
        pipelineTrace[4].result = `${candidateRes.rows.length} verified available faculty ready for selection.`;

        const executionDurationMs = Date.now() - startTime;

        res.json({
            success: true,
            engine: "n8n-compatible-scheduler-engine",
            executionTimeMs: executionDurationMs,
            criteria: {
                date,
                day,
                period: currentPeriod,
                session: examSessionPattern.replace('%', '')
            },
            pipelineTrace,
            availableFaculty: candidateRes.rows
        });
    } catch (err) {
        console.error("Error in n8n compare substitution:", err);
        res.status(500).json({ error: 'n8n background comparison failed', details: err.message });
    }
});

// Serve the n8n JSON workflow
router.get('/workflow-json', (req, res) => {
    const workflowPath = path.join(__dirname, '..', 'n8n_workflows', 'substitution_comparison_workflow.json');
    if (fs.existsSync(workflowPath)) {
        res.sendFile(workflowPath);
    } else {
        res.status(404).json({ error: 'Workflow file not found' });
    }
});

module.exports = router;
