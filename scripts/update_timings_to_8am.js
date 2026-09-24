const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function updateTimings() {
    const client = await pool.connect();
    try {
        console.log("Starting update to college timings: 8:00 AM - 1:30 PM (Break: 10:15 - 10:30 AM)...");
        await client.query('BEGIN');

        // 1. Update timetable start and end times for all 7 periods
        const periodTimes = [
            { period: 1, start: '08:00', end: '08:45' },
            { period: 2, start: '08:45', end: '09:30' },
            { period: 3, start: '09:30', end: '10:15' },
            { period: 4, start: '10:30', end: '11:15' },
            { period: 5, start: '11:15', end: '12:00' },
            { period: 6, start: '12:00', end: '12:45' },
            { period: 7, start: '12:45', end: '01:30' }
        ];

        for (const pt of periodTimes) {
            await client.query(
                'UPDATE timetable SET start_time = $1, end_time = $2 WHERE period = $3',
                [pt.start, pt.end, pt.period]
            );
        }
        console.log("Updated timetable period timings (1 to 7).");

        // 2. Drop any old CHECK constraint on exam_invigilation session and add flexible one
        await client.query(`
            ALTER TABLE exam_invigilation DROP CONSTRAINT IF EXISTS exam_invigilation_session_check;
        `);

        // 3. Update existing exam invigilation sessions to new timings
        await client.query(`
            UPDATE exam_invigilation 
            SET session = 'Morning (08:00 - 10:15)' 
            WHERE session LIKE 'Morning%';
        `);

        await client.query(`
            UPDATE exam_invigilation 
            SET session = 'Midday (10:30 - 01:30)' 
            WHERE session LIKE 'Afternoon%' OR session LIKE 'Midday%';
        `);
        console.log("Updated exam invigilation session records.");

        await client.query('COMMIT');
        console.log("Successfully updated all database timings to 8:00 AM - 1:30 PM!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", e);
    } finally {
        client.release();
        await pool.end();
    }
}

updateTimings();
