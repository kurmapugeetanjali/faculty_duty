require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log("Applying complete schema.sql...");
    const client = await pool.connect();
    try {
        const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf-8');
        await client.query(schema);
        console.log("✅ Schema, users, branches, subjects, and exam invigilations inserted.");

        // Insert timetable rows
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const periodTimes = [
            { p: 1, start: '08:00', end: '08:45' },
            { p: 2, start: '08:45', end: '09:30' },
            { p: 3, start: '09:30', end: '10:15' },
            { p: 4, start: '10:30', end: '11:15' },
            { p: 5, start: '11:15', end: '12:00' },
            { p: 6, start: '12:00', end: '12:45' },
            { p: 7, start: '12:45', end: '01:30' }
        ];

        const deptConfigs = {
            'CSE': { faculty: [2, 3, 4, 5, 6], subjects: [501, 502, 503, 504, 505, 506], roomPrefix: 'CSE-LH' },
            'MECH': { faculty: [8, 9, 10, 11, 7], subjects: [707, 708, 709, 710, 711, 712], roomPrefix: 'MECH-LH' },
            'EEE': { faculty: [13, 14, 15, 16, 12], subjects: [806, 807, 808, 809, 810, 811], roomPrefix: 'EEE-LH' },
            'ECE': { faculty: [18, 19, 20, 21, 17], subjects: [906, 907, 908, 909, 910, 911], roomPrefix: 'ECE-LH' },
            'CIVIL': { faculty: [23, 24, 25, 26, 22], subjects: [1006, 1007, 1008, 1009, 1010, 1011], roomPrefix: 'CIVIL-LH' }
        };

        const values = [];
        for (let bId = 1; bId <= 25; bId++) {
            let deptCode = 'CSE';
            if (bId > 5 && bId <= 10) deptCode = 'MECH';
            else if (bId > 10 && bId <= 15) deptCode = 'EEE';
            else if (bId > 15 && bId <= 20) deptCode = 'ECE';
            else if (bId > 20) deptCode = 'CIVIL';

            const cfg = deptConfigs[deptCode];
            let counter = (bId * 3);

            for (const d of days) {
                for (const pt of periodTimes) {
                    const subj = cfg.subjects[counter % cfg.subjects.length];
                    const fac = cfg.faculty[counter % cfg.faculty.length];
                    const room = `${cfg.roomPrefix}-${100 + (bId % 5) * 10 + (counter % 3)}`;
                    values.push(`(${bId}, '${d}', ${pt.p}, '${pt.start}', '${pt.end}', ${subj}, ${fac}, '${room}')`);
                    counter++;
                }
            }
        }

        const insertQuery = `INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) VALUES ${values.join(',\n')}`;
        await client.query(insertQuery);
        console.log(`✅ Inserted ${values.length} master timetable slots across all 25 semesters.`);

        console.log("🎉 Database Multi-Branch Setup Complete!");
    } catch (e) {
        console.error("Setup error:", e);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

run();
