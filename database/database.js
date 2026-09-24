require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configure the database connection using the environment variable with high performance settings
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Required for Neon
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

// Handle idle client socket disconnections gracefully to prevent process crashes
pool.on('error', (err, client) => {
    console.warn('PostgreSQL idle client disconnected or encountered error (handled):', err.message);
});

// Keep-alive heartbeat ping to prevent Neon compute from sleeping
setInterval(async () => {
    try {
        await pool.query('SELECT 1');
    } catch (e) {
        // Silently catch keep-alive error
    }
}, 45 * 1000);

const schemaPath = path.join(__dirname, 'schema.sql');

// Initialize database with schema
async function initDB() {
    if (!process.env.DATABASE_URL) {
        console.warn("WARNING: DATABASE_URL is not set in .env file.");
        return;
    }

    try {
        const client = await pool.connect();
        
        // Check if the exam_invigilation table exists
        const res = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'exam_invigilation'
            );
        `);
        
        if (!res.rows[0].exists) {
            console.log("Upgrading Postgres database with latest schema, invigilation, and personal timetable tables...");
            const schema = fs.readFileSync(schemaPath, 'utf-8');
            await client.query(schema);
            console.log("Database initialized successfully with fresh tables and demo data.");
        } else {
            console.log("Postgres database tables already exist and ready.");
        }
        
        client.release();
    } catch (err) {
        console.error("Error initializing database:", err);
    }
}

initDB();

module.exports = pool;
