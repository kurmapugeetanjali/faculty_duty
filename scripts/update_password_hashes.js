require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function updatePasswords() {
    const fastHash = bcrypt.hashSync('Fast@2026', 10);
    console.log("Setting Fast@2026 password hash for all faculty...");
    await pool.query('UPDATE users SET password_hash = $1', [fastHash]);
    console.log("✅ All user password hashes updated to Fast@2026 successfully.");
    await pool.end();
    process.exit(0);
}

updatePasswords();
