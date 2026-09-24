require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function rebalanceTimetables() {
    console.log("Rebalancing timetables for realistic academic distribution with free periods...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM timetable');

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

        // 5 Departments with faculty and subjects
        const deptConfigs = {
            'CSE': { 
                branches: [1, 2, 3, 4, 5], 
                faculty: [2, 3, 4, 5, 6], // Ravi, Anitha, Kiran, Priya, Ramesh
                subjects: [501, 502, 503, 504, 505, 506], 
                roomPrefix: 'CSE-LH' 
            },
            'MECH': { 
                branches: [6, 7, 8, 9, 10], 
                faculty: [8, 9, 10, 11], // Suresh, Venkat, Naresh, Prasad (HOD 7 oversees)
                subjects: [707, 708, 709, 710, 711, 712], 
                roomPrefix: 'MECH-LH' 
            },
            'EEE': { 
                branches: [11, 12, 13, 14, 15], 
                faculty: [13, 14, 15, 16], // Vijay, Swathi, Naveen, Latha (HOD 12 oversees)
                subjects: [806, 807, 808, 809, 810, 811], 
                roomPrefix: 'EEE-LH' 
            },
            'ECE': { 
                branches: [16, 17, 18, 19, 20], 
                faculty: [18, 19, 20, 21], // Sandhya, Rajesh, Teja, Bhavani (HOD 17 oversees)
                subjects: [906, 907, 908, 909, 910, 911], 
                roomPrefix: 'ECE-LH' 
            },
            'CIVIL': { 
                branches: [21, 22, 23, 24, 25], 
                faculty: [23, 24, 25, 26], // Mahesh, Haritha, Ashok, Kalyani (HOD 22 oversees)
                subjects: [1006, 1007, 1008, 1009, 1010, 1011], 
                roomPrefix: 'CIVIL-LH' 
            }
        };

        const values = [];

        for (const [dept, cfg] of Object.entries(deptConfigs)) {
            const facCount = cfg.faculty.length;
            const subCount = cfg.subjects.length;

            for (let bIdx = 0; bIdx < cfg.branches.length; bIdx++) {
                const bId = cfg.branches[bIdx];

                for (let dIdx = 0; dIdx < days.length; dIdx++) {
                    const day = days[dIdx];

                    for (let pIdx = 0; pIdx < periodTimes.length; pIdx++) {
                        const pt = periodTimes[pIdx];

                        // Assign faculty in staggered pattern so 2-3 teachers in the dept are always free at each slot
                        const facOffset = (bIdx * 2 + dIdx + pIdx) % (facCount + 2);
                        
                        if (facOffset < facCount) {
                            const facId = cfg.faculty[facOffset];
                            const subjId = cfg.subjects[(bIdx + pIdx + dIdx) % subCount];
                            const room = `${cfg.roomPrefix}-${100 + (bIdx + 1) * 10}`;
                            values.push(`(${bId}, '${day}', ${pt.p}, '${pt.start}', '${pt.end}', ${subjId}, ${facId}, '${room}')`);
                        }
                    }
                }
            }
        }

        const insertQuery = `INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) VALUES ${values.join(',\n')}`;
        await client.query(insertQuery);
        console.log(`✅ Staggered timetable inserted: ${values.length} slots across 25 branches.`);

        await client.query('COMMIT');
        console.log("🎉 Rebalancing Complete!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Rebalance error:", e);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

rebalanceTimetables();
