const pool = require('../database/database');

async function cleanDatabase() {
    try {
        console.log("Cleaning and standardizing CSE faculty users...");
        await pool.query(`
            UPDATE users SET phone = '9493438305', full_name = 'Sri B. Gopala Rao', designation = 'Lecturer in CSE' WHERE id = 29 OR full_name LIKE '%Gopala%';
            UPDATE users SET phone = '9392980517', full_name = 'Dr. V. Ravi Kumar', designation = 'Senior Lecturer in CSE' WHERE id = 2 OR full_name LIKE '%Ravi Kumar%';
            UPDATE users SET phone = '9848011223', full_name = 'Dr. S. Anitha', designation = 'Lecturer in CSE' WHERE id = 3 OR full_name LIKE '%Anitha%';
            UPDATE users SET phone = '7801056541', full_name = 'Sri Ch. Sai Kishore', designation = 'Lecturer in CSE' WHERE id = 30 OR id = 28 OR full_name LIKE '%Sai Kishore%';
            UPDATE users SET phone = '9848566778', full_name = 'Prof. G. Ramesh', designation = 'Assistant Lecturer in CSE' WHERE id = 6 OR full_name LIKE '%Ramesh%';
        `);

        // Fetch users
        const users = await pool.query("SELECT id, faculty_id, full_name, designation, phone, department FROM users WHERE department = 'CSE' ORDER BY id ASC");
        console.log("=== UPDATED CSE USERS ===");
        console.table(users.rows);

        // Fetch timetable entries
        const tt = await pool.query(`
            SELECT t.id, t.day, t.period, s.subject_code, s.subject_name, u.full_name as faculty_name, u.phone, t.room 
            FROM timetable t 
            JOIN subjects s ON t.subject_id = s.id 
            JOIN users u ON t.faculty_id = u.id 
            WHERE t.branch_id = 4 
            ORDER BY 
              CASE t.day 
                WHEN 'Monday' THEN 1 
                WHEN 'Tuesday' THEN 2 
                WHEN 'Wednesday' THEN 3 
                WHEN 'Thursday' THEN 4 
                WHEN 'Friday' THEN 5 
                WHEN 'Saturday' THEN 6 
              END, t.period ASC
        `);
        console.log("=== CURRENT TIMETABLE ENTRIES FOR BRANCH 4 (5th Sem) ===");
        console.table(tt.rows);
        console.log("Total slots in Branch 4:", tt.rows.length);

        process.exit(0);
    } catch (e) {
        console.error("Database update error:", e);
        process.exit(1);
    }
}

cleanDatabase();
