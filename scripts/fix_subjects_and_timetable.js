const pool = require('../database/database');

async function fixDatabase() {
    try {
        console.log("=== Updating CSE Subjects in Database ===");
        await pool.query(`
            UPDATE subjects SET subject_code = 'CM-501', subject_name = 'Industrial Management & Entrepreneurship (IM&ED / IME)' WHERE id = 501;
            UPDATE subjects SET subject_code = 'CM-502', subject_name = 'Web Technologies (WT)' WHERE id = 502;
            UPDATE subjects SET subject_code = 'CM-503', subject_name = 'Big Data & Cloud Computing (BD & CC)' WHERE id = 503;
            UPDATE subjects SET subject_code = 'CM-504', subject_name = 'Python & Android Programming / IoT' WHERE id = 504;
            UPDATE subjects SET subject_code = 'CM-505', subject_name = 'Python Programming Lab' WHERE id = 505;
            UPDATE subjects SET subject_code = 'CM-506', subject_name = 'Major Project Work (MPW)' WHERE id = 506;
        `);

        // Also update 6th Sem subjects CM-601 to CM-606
        await pool.query(`
            UPDATE subjects SET subject_code = 'CM-601', subject_name = 'Mobile Application Development' WHERE id = 601;
            UPDATE subjects SET subject_code = 'CM-602', subject_name = 'Software Engineering & Agile' WHERE id = 602;
            UPDATE subjects SET subject_code = 'CM-603', subject_name = 'Information Security & Forensics' WHERE id = 603;
            UPDATE subjects SET subject_code = 'CM-604', subject_name = 'AI & Machine Learning' WHERE id = 604;
            UPDATE subjects SET subject_code = 'CM-605', subject_name = 'Mobile App Development Lab' WHERE id = 605;
            UPDATE subjects SET subject_code = 'CM-606', subject_name = 'Final Capstone Project' WHERE id = 606;
        `);

        console.log("=== Updating Faculty Records in Database ===");
        await pool.query(`
            UPDATE users SET full_name = 'Sri B. Gopala Rao', phone = '9493438305', designation = 'Lecturer in CSE' WHERE phone = '9493438305' OR faculty_id = 'FAC_8305';
            UPDATE users SET full_name = 'Sri Ch. Sai Kishore', phone = '7801056541', designation = 'Lecturer in CSE' WHERE phone = '7801056541' OR faculty_id = 'FAC_6541' OR full_name ILIKE '%kishore%';
            UPDATE users SET phone = '9392980517' WHERE full_name = 'Dr. S. Anitha';
        `);

        // Check if Sri B. Gopala Rao exists
        const gopalaRes = await pool.query(`SELECT * FROM users WHERE full_name ILIKE '%Gopala Rao%'`);
        let gopalaId = gopalaRes.rows[0]?.id;
        if (!gopalaId) {
            const insG = await pool.query(`
                INSERT INTO users (faculty_id, full_name, email, phone, department, role, password_hash, designation)
                VALUES ('FAC_8305', 'Sri B. Gopala Rao', 'b.gopala.rao@polytechnic.edu', '9493438305', 'CSE', 'faculty', '$2a$10$hzQ8.uNp5c6v6gXkyXvhoOBVeIY5wcfAFXa3iL83CzTJRXI2.tFNG', 'Lecturer in CSE')
                RETURNING id
            `);
            gopalaId = insG.rows[0].id;
        }

        // Check if Sri Ch. Sai Kishore exists
        const kishoreRes = await pool.query(`SELECT * FROM users WHERE full_name ILIKE '%Sai Kishore%'`);
        let kishoreId = kishoreRes.rows[0]?.id;
        if (!kishoreId) {
            const insK = await pool.query(`
                INSERT INTO users (faculty_id, full_name, email, phone, department, role, password_hash, designation)
                VALUES ('FAC_6541', 'Sri Ch. Sai Kishore', 'ch.sai.kishore@polytechnic.edu', '7801056541', 'CSE', 'faculty', '$2a$10$hzQ8.uNp5c6v6gXkyXvhoOBVeIY5wcfAFXa3iL83CzTJRXI2.tFNG', 'Lecturer in CSE')
                RETURNING id
            `);
            kishoreId = insK.rows[0].id;
        }

        // Get other faculty IDs
        const anithaRes = await pool.query(`SELECT id FROM users WHERE full_name ILIKE '%Anitha%' LIMIT 1`);
        const anithaId = anithaRes.rows[0]?.id || 3;

        const raviRes = await pool.query(`SELECT id FROM users WHERE full_name ILIKE '%Ravi Kumar%' LIMIT 1`);
        const raviId = raviRes.rows[0]?.id || 2;

        const rameshRes = await pool.query(`SELECT id FROM users WHERE full_name ILIKE '%Ramesh%' LIMIT 1`);
        const rameshId = rameshRes.rows[0]?.id || 6;

        console.log("Faculty IDs for 5th Sem mapping:", {
            gopalaId,
            kishoreId,
            anithaId,
            raviId,
            rameshId
        });

        // 3. Now let's populate branch 4 (CSE 5th Semester) with the EXACT timetable from the uploaded image
        console.log("=== Syncing Branch 4 (CSE 5th Sem) Timetable with Exact Uploaded Image ===");
        await pool.query('DELETE FROM timetable WHERE branch_id = 4');

        const periodTimes = {
            1: { start: '08:00', end: '08:45' },
            2: { start: '08:45', end: '09:30' },
            3: { start: '09:30', end: '10:15' },
            4: { start: '10:30', end: '11:15' },
            5: { start: '11:15', end: '12:00' },
            6: { start: '12:00', end: '12:45' },
            7: { start: '12:45', end: '01:30' }
        };

        const scheduleEntries = [
            // Monday
            { day: 'Monday', period: 1, sub: 504, fac: kishoreId, room: 'LH-101' }, // PYTHON PROG
            { day: 'Monday', period: 2, sub: 504, fac: kishoreId, room: 'LH-101' }, // ANDROID PROG
            { day: 'Monday', period: 3, sub: 503, fac: anithaId, room: 'LH-101' },  // BD & CC
            { day: 'Monday', period: 4, sub: 505, fac: kishoreId, room: 'Computer Lab' }, // PYTHON PROG LAB
            { day: 'Monday', period: 5, sub: 505, fac: kishoreId, room: 'Computer Lab' }, // PYTHON PROG LAB
            { day: 'Monday', period: 6, sub: 505, fac: kishoreId, room: 'Computer Lab' }, // PYTHON PROG LAB
            { day: 'Monday', period: 7, sub: 502, fac: raviId, room: 'LH-101' },    // WT

            // Tuesday
            { day: 'Tuesday', period: 1, sub: 503, fac: anithaId, room: 'LH-101' },  // BD & CC
            { day: 'Tuesday', period: 2, sub: 504, fac: kishoreId, room: 'LH-101' }, // IOT
            { day: 'Tuesday', period: 3, sub: 503, fac: anithaId, room: 'LH-101' },  // BD & CC
            { day: 'Tuesday', period: 4, sub: 504, fac: kishoreId, room: 'LH-101' }, // ANDROID PROG
            { day: 'Tuesday', period: 5, sub: 504, fac: kishoreId, room: 'LH-101' }, // PYTHON PROG
            { day: 'Tuesday', period: 6, sub: 502, fac: raviId, room: 'LH-101' },    // WT
            { day: 'Tuesday', period: 7, sub: 501, fac: gopalaId, room: 'LH-101' }, // IM&ED

            // Wednesday
            { day: 'Wednesday', period: 1, sub: 503, fac: anithaId, room: 'LH-101' },  // BD & CC
            { day: 'Wednesday', period: 2, sub: 504, fac: kishoreId, room: 'LH-101' }, // PYTHON PROG
            { day: 'Wednesday', period: 3, sub: 504, fac: kishoreId, room: 'LH-101' }, // ANDROID PROG
            { day: 'Wednesday', period: 4, sub: 502, fac: raviId, room: 'Web Lab' },  // WT LAB
            { day: 'Wednesday', period: 5, sub: 502, fac: raviId, room: 'Web Lab' },  // WT LAB
            { day: 'Wednesday', period: 6, sub: 502, fac: raviId, room: 'Web Lab' },  // WT LAB
            { day: 'Wednesday', period: 7, sub: 501, fac: gopalaId, room: 'LH-101' }, // IM&ED

            // Thursday
            { day: 'Thursday', period: 1, sub: 501, fac: gopalaId, room: 'LH-101' }, // IM&ED
            { day: 'Thursday', period: 2, sub: 504, fac: kishoreId, room: 'LH-101' }, // PYTHON PROG
            { day: 'Thursday', period: 3, sub: 503, fac: anithaId, room: 'LH-101' },  // BD & CC
            { day: 'Thursday', period: 4, sub: 504, fac: kishoreId, room: 'LH-101' }, // IOT
            { day: 'Thursday', period: 5, sub: 504, fac: kishoreId, room: 'LH-101' }, // ANDROID PROG
            { day: 'Thursday', period: 7, sub: 502, fac: raviId, room: 'LH-101' },    // WT

            // Friday
            { day: 'Friday', period: 1, sub: 501, fac: gopalaId, room: 'LH-101' }, // IM&ED
            { day: 'Friday', period: 2, sub: 502, fac: raviId, room: 'LH-101' },    // WT
            { day: 'Friday', period: 3, sub: 503, fac: anithaId, room: 'LH-101' },  // BD & CC
            { day: 'Friday', period: 4, sub: 504, fac: kishoreId, room: 'LH-101' }, // PYTHON PROG
            { day: 'Friday', period: 5, sub: 504, fac: kishoreId, room: 'LH-101' }, // IOT
            { day: 'Friday', period: 6, sub: 504, fac: kishoreId, room: 'LH-101' }, // ANDROID PROG
            { day: 'Friday', period: 7, sub: 501, fac: gopalaId, room: 'LH-101' }, // IM&ED

            // Saturday
            { day: 'Saturday', period: 1, sub: 504, fac: kishoreId, room: 'LH-101' }, // IOT
            { day: 'Saturday', period: 2, sub: 504, fac: kishoreId, room: 'LH-101' }, // IOT
            { day: 'Saturday', period: 3, sub: 504, fac: kishoreId, room: 'LH-101' }, // ANDROID PROG
            { day: 'Saturday', period: 4, sub: 504, fac: kishoreId, room: 'LH-101' }, // ANDROID PROG
            { day: 'Saturday', period: 5, sub: 505, fac: kishoreId, room: 'Computer Lab' }, // PYTHON PROG LAB
            { day: 'Saturday', period: 6, sub: 505, fac: kishoreId, room: 'Computer Lab' }, // PYTHON PROG LAB
            { day: 'Saturday', period: 7, sub: 505, fac: kishoreId, room: 'Computer Lab' }  // PYTHON PROG LAB
        ];

        for (const entry of scheduleEntries) {
            const time = periodTimes[entry.period];
            await pool.query(`
                INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [4, entry.day, entry.period, time.start, time.end, entry.sub, entry.fac, entry.room]);
        }

        console.log(`Successfully synced ${scheduleEntries.length} periods for CSE 5th Semester!`);

        process.exit(0);
    } catch (err) {
        console.error("Error updating database:", err);
        process.exit(1);
    }
}

fixDatabase();
