const pool = require('../database/database');

async function migrate() {
    console.log("Migrating database to single CME department with all semesters and 7 periods...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Update users department to 'CME'
        await client.query(`
            UPDATE users SET department = 'CME' 
            WHERE faculty_id IN ('HOD_CSE', 'FAC001', 'FAC002', 'FAC003', 'FAC004', 'FAC005');
        `);

        // 2. Clear old branches and insert CME semesters
        // Keep branch IDs or clean branches
        await client.query('DELETE FROM timetable');
        await client.query('DELETE FROM substitutions');
        await client.query('DELETE FROM exam_invigilation');
        await client.query('DELETE FROM branches');

        const branchInserts = await client.query(`
            INSERT INTO branches (id, department, branch_name, year, section) VALUES
            (1, 'CME', 'CME - 5th Semester', '5th Semester (C-20)', 'A'),
            (2, 'CME', 'CME - 1st Year', '1st Year (C-20)', 'A'),
            (3, 'CME', 'CME - 3rd Semester', '3rd Semester (C-20)', 'A'),
            (4, 'CME', 'CME - 4th Semester', '4th Semester (C-20)', 'A'),
            (5, 'CME', 'CME - 6th Semester', '6th Semester (C-20)', 'A')
            RETURNING id, branch_name;
        `);
        console.log("Inserted CME branches:", branchInserts.rows);

        // 3. Insert or update CME curriculum subjects
        await client.query('DELETE FROM subjects');
        await client.query(`
            INSERT INTO subjects (id, subject_code, subject_name, department) VALUES
            -- 1st Year
            (101, 'CM-101', 'English & Communication Skills', 'CME'),
            (102, 'CM-102', 'Engineering Mathematics - I', 'CME'),
            (103, 'CM-103', 'Engineering Physics', 'CME'),
            (104, 'CM-104', 'Engineering Chemistry', 'CME'),
            (105, 'CM-105', 'Computer Fundamentals & C Programming', 'CME'),
            (106, 'CM-106', 'Programming in C Lab', 'CME'),

            -- 3rd Sem
            (301, 'CM-301', 'Engineering Mathematics - II', 'CME'),
            (302, 'CM-302', 'Data Structures through C', 'CME'),
            (303, 'CM-303', 'Digital Electronics & Computer Architecture', 'CME'),
            (304, 'CM-304', 'Database Management Systems (DBMS)', 'CME'),
            (305, 'CM-305', 'Data Structures Lab', 'CME'),
            (306, 'CM-306', 'DBMS & SQL Lab', 'CME'),

            -- 4th Sem
            (401, 'CM-401', 'Operating Systems & Linux', 'CME'),
            (402, 'CM-402', 'Object Oriented Programming through Java', 'CME'),
            (403, 'CM-403', 'Computer Networks & Security', 'CME'),
            (404, 'CM-404', 'Web Technologies (HTML, CSS, JS)', 'CME'),
            (405, 'CM-405', 'Java Programming Lab', 'CME'),
            (406, 'CM-406', 'Web Development Lab', 'CME'),

            -- 5th Sem
            (501, 'CM-501', 'Industrial Management & Entrepreneurship (IME)', 'CME'),
            (502, 'CM-502', 'Advanced Java & Web Technologies (AJWT)', 'CME'),
            (503, 'CM-503', 'Cloud Computing & Virtualization (CCV)', 'CME'),
            (504, 'CM-504', 'Python Programming & Data Science (PPDS)', 'CME'),
            (505, 'CM-505', 'Computer Hardware & Networking Lab (CHN)', 'CME'),
            (506, 'CM-506', 'Major Project Work & Seminar (MPW)', 'CME'),

            -- 6th Sem
            (601, 'CM-601', 'Industrial Training & Internship', 'CME'),
            (602, 'CM-602', 'Cyber Security & Ethical Hacking', 'CME'),
            (603, 'CM-603', 'Mobile Application Development (Android)', 'CME'),
            (604, 'CM-604', 'Internet of Things (IoT) & Embedded Systems', 'CME'),
            (605, 'CM-605', 'Mobile Apps & IoT Lab', 'CME'),
            (606, 'CM-606', 'Major Industry Project Phase-II', 'CME');
        `);
        console.log("Inserted CME subjects across all semesters.");

        // 4. Timetable slots with 7 PERIODS PER DAY
        // Period 1: 09:30 - 10:20
        // Period 2: 10:20 - 11:10
        // Period 3: 11:10 - 12:00
        // Period 4: 12:00 - 12:50
        // LUNCH:   12:50 - 01:40
        // Period 5: 01:40 - 02:30
        // Period 6: 02:30 - 03:20
        // Period 7: 03:20 - 04:10
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        // Populate Branch 1 (5th Sem)
        const sem5Schedule = [
            // Monday
            { day: 'Monday', period: 1, subject: 502, fac: 2, room: 'Room 201' },
            { day: 'Monday', period: 2, subject: 501, fac: 3, room: 'Room 201' },
            { day: 'Monday', period: 3, subject: 503, fac: 4, room: 'Room 201' },
            { day: 'Monday', period: 4, subject: 504, fac: 5, room: 'Room 201' },
            { day: 'Monday', period: 5, subject: 505, fac: 6, room: 'Hardware Lab' },
            { day: 'Monday', period: 6, subject: 505, fac: 6, room: 'Hardware Lab' },
            { day: 'Monday', period: 7, subject: 506, fac: 2, room: 'Room 201' },

            // Tuesday
            { day: 'Tuesday', period: 1, subject: 501, fac: 3, room: 'Room 201' },
            { day: 'Tuesday', period: 2, subject: 502, fac: 2, room: 'Room 201' },
            { day: 'Tuesday', period: 3, subject: 504, fac: 5, room: 'Room 201' },
            { day: 'Tuesday', period: 4, subject: 503, fac: 4, room: 'Room 201' },
            { day: 'Tuesday', period: 5, subject: 506, fac: 6, room: 'Project Lab' },
            { day: 'Tuesday', period: 6, subject: 506, fac: 6, room: 'Project Lab' },
            // Period 7 free

            // Wednesday
            { day: 'Wednesday', period: 1, subject: 503, fac: 4, room: 'Room 201' },
            { day: 'Wednesday', period: 2, subject: 501, fac: 3, room: 'Room 201' },
            { day: 'Wednesday', period: 3, subject: 502, fac: 2, room: 'Room 201' },
            { day: 'Wednesday', period: 4, subject: 504, fac: 5, room: 'Room 201' },
            { day: 'Wednesday', period: 5, subject: 505, fac: 6, room: 'Lab 2' },
            { day: 'Wednesday', period: 6, subject: 502, fac: 2, room: 'Room 201' },
            { day: 'Wednesday', period: 7, subject: 501, fac: 3, room: 'Room 201' },

            // Thursday
            { day: 'Thursday', period: 1, subject: 504, fac: 5, room: 'Room 201' },
            { day: 'Thursday', period: 2, subject: 506, fac: 6, room: 'Room 201' },
            { day: 'Thursday', period: 3, subject: 501, fac: 3, room: 'Room 201' },
            { day: 'Thursday', period: 4, subject: 503, fac: 4, room: 'Room 201' },
            { day: 'Thursday', period: 5, subject: 502, fac: 2, room: 'Room 201' },
            { day: 'Thursday', period: 6, subject: 504, fac: 5, room: 'Room 201' },
            // Period 7 free

            // Friday
            { day: 'Friday', period: 1, subject: 502, fac: 2, room: 'Room 201' },
            { day: 'Friday', period: 2, subject: 503, fac: 4, room: 'Room 201' },
            { day: 'Friday', period: 3, subject: 504, fac: 5, room: 'Room 201' },
            { day: 'Friday', period: 4, subject: 501, fac: 3, room: 'Room 201' },
            { day: 'Friday', period: 5, subject: 506, fac: 6, room: 'Project Lab' },
            { day: 'Friday', period: 6, subject: 505, fac: 6, room: 'Lab 1' },
            { day: 'Friday', period: 7, subject: 503, fac: 4, room: 'Room 201' },

            // Saturday
            { day: 'Saturday', period: 1, subject: 506, fac: 2, room: 'Room 201' },
            { day: 'Saturday', period: 2, subject: 505, fac: 6, room: 'Lab 1' },
            { day: 'Saturday', period: 3, subject: 501, fac: 3, room: 'Room 201' },
            { day: 'Saturday', period: 4, subject: 502, fac: 2, room: 'Room 201' }
        ];

        const periodTimes = {
            1: { s: '09:30', e: '10:20' },
            2: { s: '10:20', e: '11:10' },
            3: { s: '11:10', e: '12:00' },
            4: { s: '12:00', e: '12:50' },
            5: { s: '01:40', e: '02:30' },
            6: { s: '02:30', e: '03:20' },
            7: { s: '03:20', e: '04:10' }
        };

        for (const slot of sem5Schedule) {
            await client.query(`
                INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [1, slot.day, slot.period, periodTimes[slot.period].s, periodTimes[slot.period].e, slot.subject, slot.fac, slot.room]);
        }

        // Populate Branch 3 (3rd Sem)
        const sem3Schedule = [
            { day: 'Monday', period: 1, subject: 301, fac: 3, room: 'Room 102' },
            { day: 'Monday', period: 2, subject: 302, fac: 4, room: 'Room 102' },
            { day: 'Monday', period: 3, subject: 303, fac: 5, room: 'Room 102' },
            { day: 'Monday', period: 4, subject: 304, fac: 6, room: 'Room 102' },
            { day: 'Monday', period: 5, subject: 305, fac: 4, room: 'DS Lab' },
            { day: 'Monday', period: 6, subject: 305, fac: 4, room: 'DS Lab' },
            { day: 'Tuesday', period: 1, subject: 302, fac: 4, room: 'Room 102' },
            { day: 'Tuesday', period: 2, subject: 303, fac: 5, room: 'Room 102' },
            { day: 'Tuesday', period: 3, subject: 304, fac: 6, room: 'Room 102' },
            { day: 'Wednesday', period: 1, subject: 301, fac: 3, room: 'Room 102' },
            { day: 'Wednesday', period: 2, subject: 304, fac: 6, room: 'Room 102' },
            { day: 'Thursday', period: 1, subject: 303, fac: 5, room: 'Room 102' },
            { day: 'Friday', period: 1, subject: 302, fac: 4, room: 'Room 102' }
        ];
        for (const slot of sem3Schedule) {
            await client.query(`
                INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [3, slot.day, slot.period, periodTimes[slot.period].s, periodTimes[slot.period].e, slot.subject, slot.fac, slot.room]);
        }

        // Populate Branch 2 (1st Year)
        const yr1Schedule = [
            { day: 'Monday', period: 1, subject: 101, fac: 5, room: 'Room 001' },
            { day: 'Monday', period: 2, subject: 102, fac: 6, room: 'Room 001' },
            { day: 'Monday', period: 3, subject: 105, fac: 2, room: 'Room 001' },
            { day: 'Tuesday', period: 1, subject: 105, fac: 2, room: 'Room 001' },
            { day: 'Wednesday', period: 1, subject: 103, fac: 3, room: 'Room 001' }
        ];
        for (const slot of yr1Schedule) {
            await client.query(`
                INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [2, slot.day, slot.period, periodTimes[slot.period].s, periodTimes[slot.period].e, slot.subject, slot.fac, slot.room]);
        }

        // 5. Exam invigilation for CME
        await client.query(`
            INSERT INTO exam_invigilation (department, exam_name, exam_date, session, hall_no, faculty_id, notes)
            VALUES 
            ('CME', 'State Board Diploma Mid-I Examination', '2026-09-28', 'Morning (09:30 - 12:30)', 'Drawing Hall-1 (Main Block)', 3, 'Chief Invigilator - Morning Session'),
            ('CME', 'Board Practical Examination (CHN Lab)', '2026-09-29', 'Afternoon (01:30 - 04:30)', 'Hardware Lab', 5, 'Internal Lab Examiner');
        `);

        await client.query('COMMIT');
        console.log("CME Migration completed successfully!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Migration error:", e);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
