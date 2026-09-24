const http = require('http');

async function testLogin(facultyId, password, phone) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ faculty_id: facultyId, password: password, phone: phone });
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[Status ${res.statusCode}] Login for ${facultyId} (${phone}): ${data}`);
                resolve({ status: res.statusCode, body: data });
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function run() {
    console.log("Testing logins with Username, Password, and Phone Number across all branches...");
    await testLogin('HOD_CSE', 'Fast@2026', '+91 98480 11223');
    await testLogin('HOD_MECH', 'Fast@2026', '+91 98486 77889');
    await testLogin('HOD_EEE', 'Fast@2026', '+91 98481 33445');
    await testLogin('HOD_ECE', 'Fast@2026', '+91 98486 88990');
    await testLogin('HOD_CIVIL', 'Fast@2026', '+91 98481 44556');
    await testLogin('FAC001', 'Fast@2026', '+91 98481 22334');
}

run();
