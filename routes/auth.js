const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const pool = require('../database/database');
const { requireAuth } = require('../middleware/auth');

// =========================================================================
// SINGLE ACTIVE ADMIN TRACKER (Only ONE Admin is allowed institutional-wide)
// =========================================================================
let currentActiveAdmin = null; // { userId, faculty_id, full_name, email, sessionStartedAt }

// Helper to check if current user is the locked active admin
function getActiveAdmin() {
    return currentActiveAdmin;
}

function setActiveAdmin(user, email) {
    currentActiveAdmin = {
        userId: user.id,
        faculty_id: user.faculty_id,
        full_name: user.full_name,
        email: email || user.email,
        sessionStartedAt: new Date()
    };
    console.log(`👑 [ADMIN LOCKED] Active Admin is now: ${currentActiveAdmin.full_name} (ID: ${currentActiveAdmin.userId})`);
}

function clearActiveAdmin(userId) {
    if (currentActiveAdmin && (!userId || currentActiveAdmin.userId === userId)) {
        console.log(`👑 [ADMIN RELEASED] ${currentActiveAdmin.full_name} logged out or released Admin lock.`);
        currentActiveAdmin = null;
    }
}

// In-memory OTP storage for HOD Admin verification (Key: userId, Value: { code, email, expiresAt })
const hodOtpStore = new Map();

// Get all faculty for the login screen selection
router.get('/faculty-list', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, faculty_id, full_name, designation, department, role 
            FROM users 
            ORDER BY 
              CASE WHEN role = 'hos' THEN 0 ELSE 1 END,
              full_name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching faculty list:", err);
        res.status(500).json({ error: 'Failed to fetch faculty list' });
    }
});

function validatePasswordPolicy(password) {
    if (!password || password.trim().length === 0) {
        return 'Password is required.';
    }
    return null;
}

async function sendVerificationEmail(targetEmail, code, userName) {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_FROM || '"F.A.S.T Security" <no-reply@polytechnic.edu>',
                to: targetEmail,
                subject: '🔐 F.A.S.T - HOD Admin Verification Security Code',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h2 style="color: #4f46e5; margin: 0; font-size: 22px;">F.A.S.T • Multi-Department Portal</h2>
                            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Faculty Alternative Substitute Tracker</p>
                        </div>
                        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
                        <h3 style="color: #0f172a; margin-top: 0;">👑 HOD Admin Personal Verification</h3>
                        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                            Hello <strong>${userName || 'HOD / Faculty'}</strong>,<br/>
                            A request was made to activate exclusive <strong>HOD Admin Access</strong> to manage master timetables and exam duty schedules.
                        </p>
                        <div style="text-align: center; margin: 25px 0; background: linear-gradient(135deg, #f0fdf4, #eff6ff); border: 2px dashed #6366f1; border-radius: 14px; padding: 20px;">
                            <span style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #4b5563; display: block; margin-bottom: 8px;">Your 6-Digit Personal Verification Code:</span>
                            <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #3730a3; font-family: monospace;">${code}</span>
                            <span style="font-size: 12px; color: #dc2626; display: block; margin-top: 8px; font-weight: bold;">⏱️ Valid for 5 minutes • Single Admin Session</span>
                        </div>
                        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
                            Note: Only ONE Admin is permitted at a time. If you did not request this, please ignore this email.
                        </p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`[Email Sent] HOD Verification OTP successfully sent to personal email: ${targetEmail}`);
            return { sent: true, method: 'smtp' };
        } catch (err) {
            console.warn(`[SMTP Warning] Could not send via SMTP (${err.message}). Logging code to terminal.`);
        }
    }

    // Fallback development terminal display
    console.log(`\n======================================================`);
    console.log(`👑 [F.A.S.T - HOD ADMIN PERSONAL VERIFICATION CODE]`);
    console.log(`📧 Personal Email: ${targetEmail}`);
    console.log(`🔢 6-Digit Code:   ${code}`);
    console.log(`⏱️ Expiration:     5 minutes`);
    console.log(`======================================================\n`);
    return { sent: true, method: 'console' };
}

// =========================================================================
// 1. LOGIN & REGISTRATION API (With Multi-Department Support)
// =========================================================================
router.post('/login', async (req, res) => {
    const { faculty_id, password, phone } = req.body;
    
    if (!faculty_id || !password) {
        return res.status(400).json({ error: 'Faculty Name/ID and password are required.' });
    }

    try {
        const identifier = (faculty_id || '').trim();
        const cleanName = identifier.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim();

        const result = await pool.query(`
            SELECT * FROM users 
            WHERE faculty_id ILIKE $1 
               OR faculty_id ILIKE '%' || $1 || '%'
               OR full_name ILIKE $1 
               OR full_name ILIKE '%' || $1 || '%'
               OR full_name ILIKE '%' || $2 || '%'
               OR (LOWER($1) IN ('hod cse', 'cse hod', 'cse_hod', 'hod_cse') AND faculty_id = 'HOD_CSE')
               OR (LOWER($1) IN ('hod mech', 'mech hod', 'mech_hod', 'hod_mech') AND faculty_id = 'HOD_MECH')
               OR (LOWER($1) IN ('hod eee', 'eee hod', 'eee_hod', 'hod_eee') AND faculty_id = 'HOD_EEE')
               OR (LOWER($1) IN ('hod ece', 'ece hod', 'ece_hod', 'hod_ece') AND faculty_id = 'HOD_ECE')
               OR (LOWER($1) IN ('hod civil', 'civil hod', 'civil_hod', 'hod_civil') AND faculty_id = 'HOD_CIVIL')
               OR (LOWER($1) IN ('hod', 'admin', 'head') AND (role = 'hos' OR faculty_id = 'HOD_CSE'))
            ORDER BY 
               CASE WHEN faculty_id ILIKE $1 THEN 1 
                    WHEN full_name ILIKE $1 THEN 2 
                    WHEN full_name ILIKE '%' || $2 || '%' THEN 3
                    ELSE 4 END
            LIMIT 1
        `, [identifier, cleanName]);
        const user = result.rows[0];

        if (!user) {
            // First time login for a new faculty member -> Automatically register
            const newFullName = identifier.startsWith('Dr.') || identifier.startsWith('Prof.') ? identifier : `Prof. ${identifier}`;
            const countRes = await pool.query('SELECT COUNT(*) FROM users');
            const newIndex = parseInt(countRes.rows[0].count, 10) + 1;
            const newFacultyId = `FAC${String(newIndex).padStart(3, '0')}`;
            const hashed = bcrypt.hashSync(password, 10);
            const email = `${cleanName.toLowerCase().replace(/\s+/g, '')}@polytechnic.edu`;
            const facultyPhone = (phone || '9876543210').trim();

            const insertRes = await pool.query(`
                INSERT INTO users (faculty_id, full_name, email, phone, department, designation, password_hash, role)
                VALUES ($1, $2, $3, $4, 'CSE', 'Faculty', $5, 'faculty')
                RETURNING *
            `, [newFacultyId, newFullName, email, facultyPhone, hashed]);

            const newUser = insertRes.rows[0];
            req.session.userId = newUser.id;
            req.session.faculty_id = newUser.faculty_id;
            req.session.role = newUser.role;
            req.session.full_name = newUser.full_name;
            req.session.phone = newUser.phone;
            req.session.designation = newUser.designation;
            req.session.department = newUser.department;
            req.session.isHOD = false;
            req.session.isAdminElevated = false;

            return res.json({
                message: `Welcome, ${newUser.full_name}! Your faculty profile has been created and logged in.`,
                isNewFaculty: true,
                user: {
                    id: newUser.id,
                    faculty_id: newUser.faculty_id,
                    full_name: newUser.full_name,
                    phone: newUser.phone,
                    role: newUser.role,
                    designation: newUser.designation,
                    department: newUser.department,
                    isHOD: false,
                    isAdminElevated: false
                }
            });
        }

        // Verify password - flexible match for demo/live ease
        let passwordMatches = false;
        try {
            passwordMatches = bcrypt.compareSync(password, user.password_hash);
        } catch (e) {
            passwordMatches = false;
        }

        if (passwordMatches || password === 'Fast@2026' || password === 'password123' || password === 'admin123' || password === 'Pass@1') {
            const isHOD = user.role === 'hos' || user.faculty_id.startsWith('HOD_');

            // If phone was provided and different, update it
            if (phone && phone.trim().length >= 8 && phone !== user.phone) {
                try {
                    await pool.query('UPDATE users SET phone = $1 WHERE id = $2', [phone.trim(), user.id]);
                    user.phone = phone.trim();
                } catch (pe) {
                    console.warn("Could not update user phone:", pe.message);
                }
            }

            const isAdminElevated = isHOD;
            setActiveAdmin(user, user.email);

            req.session.userId = user.id;
            req.session.faculty_id = user.faculty_id;
            req.session.role = isHOD ? 'hos' : 'faculty';
            req.session.full_name = user.full_name;
            req.session.phone = user.phone;
            req.session.designation = user.designation;
            req.session.department = user.department;
            req.session.isHOD = isHOD;
            req.session.isAdminElevated = isAdminElevated;

            return res.json({
                message: 'Login successful',
                user: {
                    id: user.id,
                    faculty_id: user.faculty_id,
                    full_name: user.full_name,
                    phone: user.phone,
                    role: req.session.role,
                    designation: user.designation,
                    department: user.department,
                    isHOD: isHOD,
                    isAdminElevated: isAdminElevated
                }
            });
        } else {
            return res.status(401).json({ 
                error: `Incorrect password for "${user.full_name}". (Default password: Fast@2026)` 
            });
        }
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: 'Database error during login' });
    }
});

// =========================================================================
// 2. SEND HOD VERIFICATION CODE TO PERSONAL EMAIL
// =========================================================================
router.post('/send-hod-otp', requireAuth, async (req, res) => {
    try {
        const { personalEmail, email } = req.body;
        const targetEmail = (personalEmail || email || '').trim().toLowerCase();
        const userId = req.session.userId;

        // Check single active admin lock
        if (currentActiveAdmin && currentActiveAdmin.userId !== userId) {
            return res.status(403).json({ 
                error: `Admin access is currently locked! Only ONE Admin is allowed at a time, and ${currentActiveAdmin.full_name} is currently logged in as Admin. Please wait until they log out.` 
            });
        }

        if (!targetEmail) {
            return res.status(400).json({ error: 'Please enter your personal email address to receive the verification code.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(targetEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address (e.g. name@gmail.com or name@institution.edu).' });
        }

        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'User session not found.' });
        }

        // Generate 6-digit OTP
        const otpCode = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        hodOtpStore.set(String(userId), {
            code: otpCode,
            email: targetEmail,
            expiresAt: expiresAt
        });

        // Send Email
        await sendVerificationEmail(targetEmail, otpCode, user.full_name);

        return res.json({
            success: true,
            message: `Verification code sent to personal email: ${targetEmail}`,
            email: targetEmail,
            codePreview: otpCode, // Provided for instant testing preview
            expiresInSeconds: 300
        });
    } catch (err) {
        console.error("Error sending HOD OTP:", err);
        return res.status(500).json({ error: 'Failed to generate and send verification code.' });
    }
});

// =========================================================================
// 3. VERIFY HOD OTP AND LOCK SINGLE ACTIVE ADMIN ROLE
// =========================================================================
router.post('/verify-hod-otp', requireAuth, async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.session.userId;

        // Check single active admin lock
        if (currentActiveAdmin && currentActiveAdmin.userId !== userId) {
            return res.status(403).json({ 
                error: `Admin access is already occupied by ${currentActiveAdmin.full_name}. Only ONE Admin is allowed at a time. Please wait until they log out.` 
            });
        }

        if (!code || String(code).trim().length === 0) {
            return res.status(400).json({ error: 'Please enter the 6-digit verification code.' });
        }

        const cleanCode = String(code).trim();
        const stored = hodOtpStore.get(String(userId));

        const isValidCode = (stored && stored.code === cleanCode && Date.now() <= stored.expiresAt) 
            || cleanCode === '999999'; // Master test bypass code

        if (!isValidCode) {
            if (stored && Date.now() > stored.expiresAt) {
                hodOtpStore.delete(String(userId));
                return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
            }
            return res.status(400).json({ error: 'Invalid verification code. Please check your personal email and try again.' });
        }

        // Successfully verified
        const userEmail = stored ? stored.email : null;
        hodOtpStore.delete(String(userId));

        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        // Lock Single Active Admin
        setActiveAdmin(user, userEmail);

        req.session.isAdminElevated = true;
        req.session.role = 'hos';

        return res.json({
            success: true,
            message: '👑 HOD Identity Verified! Exclusive single-admin privileges successfully activated.',
            user: {
                id: user.id,
                faculty_id: user.faculty_id,
                full_name: user.full_name,
                role: 'hos',
                designation: user.designation,
                department: user.department,
                isHOD: true,
                isAdminElevated: true
            }
        });
    } catch (err) {
        console.error("Error verifying HOD OTP:", err);
        return res.status(500).json({ error: 'Failed to verify OTP code.' });
    }
});

// =========================================================================
// 4. LOGOUT (Releases Single Active Admin Lock)
// =========================================================================
router.post('/logout', (req, res) => {
    const userId = req.session ? req.session.userId : null;
    clearActiveAdmin(userId);
    req.session.destroy();
    res.json({ message: 'Logged out successfully. Admin lock released.' });
});

// =========================================================================
// 5. CURRENT USER INFO API
// =========================================================================
router.get('/me', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const isElevated = !!req.session.isAdminElevated || !!req.session.isHOD || req.session.role === 'hos';

    res.json({
        id: req.session.userId,
        faculty_id: req.session.faculty_id,
        role: isElevated ? 'hos' : req.session.role,
        full_name: req.session.full_name,
        phone: req.session.phone || '+91 98480 11223',
        designation: req.session.designation,
        department: req.session.department,
        isHOD: !!req.session.isHOD || isElevated,
        isAdminElevated: isElevated,
        activeAdminInfo: currentActiveAdmin ? {
            name: currentActiveAdmin.full_name,
            userId: currentActiveAdmin.userId,
            isSelf: currentActiveAdmin.userId === req.session.userId
        } : null
    });
});

module.exports = router;
