require('dotenv').config();
const pool = require('../database/database');

async function inspectDB() {
    console.log("=== Inspecting PostgreSQL Database Connectivity & Data ===");
    try {
        const tables = ['users', 'branches', 'subjects', 'timetable', 'faculty_personal_schedule', 'exam_invigilation', 'substitutions'];
        for (const t of tables) {
            const res = await pool.query(`SELECT COUNT(*) FROM ${t}`);
            console.log(`Table '${t}': ${res.rows[0].count} records`);
        }

        // Show semesters in branches
        const branches = await pool.query(`SELECT id, branch_name, department, year FROM branches ORDER BY id`);
        console.log("\nBranches/Semesters:", branches.rows);

        // Show Users
        const users = await pool.query(`SELECT id, faculty_id, full_name, email, role FROM users ORDER BY id`);
        console.log("\nUsers in DB:", users.rows);

        // Show Timetable count per branch
        const ttCounts = await pool.query(`
            SELECT b.id, b.branch_name, COUNT(t.id) as period_count 
            FROM branches b 
            LEFT JOIN timetable t ON b.id = t.branch_id 
            GROUP BY b.id, b.branch_name 
            ORDER BY b.id
        `);
        console.log("\nTimetable Period Count per Semester:", ttCounts.rows);

        // Show Exam Invigilations
        const invig = await pool.query(`SELECT COUNT(*) FROM exam_invigilation`);
        console.log(`\nExam Invigilations count: ${invig.rows[0].count}`);

        // Show Faculty Personal Schedules
        const personal = await pool.query(`SELECT COUNT(*) FROM faculty_personal_schedule`);
        console.log(`\nPersonal Schedules count: ${personal.rows[0].count}`);

        process.exit(0);
    } catch (e) {
        console.error("Database Inspection Error:", e);
        process.exit(1);
    }
}

inspectDB();
