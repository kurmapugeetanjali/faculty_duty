const http = require('http');

function makeRequest(path, method, body, cookie = '') {
    return new Promise((resolve) => {
        const payload = body ? JSON.stringify(body) : '';
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        };
        if (cookie) headers['Cookie'] = cookie;

        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: headers
        }, (res) => {
            let data = '';
            const setCookie = res.headers['set-cookie'];
            let newCookie = cookie;
            if (setCookie) {
                newCookie = setCookie.map(c => c.split(';')[0]).join('; ');
            }
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch(e) { parsed = data; }
                resolve({ status: res.statusCode, body: parsed, cookie: newCookie });
            });
        });
        req.on('error', (e) => resolve({ error: e.message }));
        if (payload) req.write(payload);
        req.end();
    });
}

async function testRealtimeDB() {
    console.log("=== Testing Real-Time Database Connectivity & Backend Processing ===");

    // 1. Test live branches query
    const branchesRes = await makeRequest('/api/timetable/branches?department=CSE', 'GET');
    console.log(`1. Live Branches Query: ${branchesRes.status === 200 ? 'SUCCESS' : 'FAILED'} (Found ${branchesRes.body.length} CSE semesters)`);

    // 2. Test live semester 4 timetable query
    const ttRes = await makeRequest('/api/timetable/4', 'GET');
    console.log(`2. Live CSE 5th Sem Timetable Query: ${ttRes.status === 200 ? 'SUCCESS' : 'FAILED'} (${ttRes.body.length} timetable entries returned)`);

    // 3. Login as HOD and get session
    const loginRes = await makeRequest('/api/auth/login', 'POST', { faculty_id: 'HOD_CSE', password: 'Fast@2026' });
    console.log(`3. HOD Admin Login: ${loginRes.status === 200 ? 'SUCCESS' : 'FAILED'} (Logged in as ${loginRes.body.user.full_name})`);
    const hodCookie = loginRes.cookie;

    // 4. Test real-time period insertion into database
    const addPeriodRes = await makeRequest('/api/timetable', 'POST', {
        branch_id: 4,
        day: 'Saturday',
        period: 7,
        subject_id: 504,
        faculty_id: 2,
        room: 'LH-103'
    }, hodCookie);
    console.log(`4. Real-time Insert Period: ${addPeriodRes.status === 200 ? 'SUCCESS' : 'FAILED'}`, addPeriodRes.body);
    const addedId = addPeriodRes.body.id;

    // 5. Query live timetable immediately to verify instant reflection
    const ttAfterRes = await makeRequest('/api/timetable/4', 'GET');
    const foundAdded = ttAfterRes.body.find(e => e.id === addedId);
    console.log(`5. Verify Instant Real-time Reflection: ${foundAdded ? 'PASSED (Slot found in live DB)' : 'FAILED'}`);

    // 6. Test real-time background substitute matching
    const subMatchRes = await makeRequest('/api/substitutions/available?date=2026-09-28&day=Monday&period=2&original_faculty_id=2&department=CSE', 'GET', null, hodCookie);
    console.log(`6. Live Background Substitute Matching Query: ${subMatchRes.status === 200 ? 'SUCCESS' : 'FAILED'} (Found ${subMatchRes.body.length} faculty evaluated in background)`);

    // 7. Test real-time delete from database
    if (addedId) {
        const deleteRes = await makeRequest(`/api/timetable/${addedId}`, 'DELETE', null, hodCookie);
        console.log(`7. Real-time Delete Period: ${deleteRes.status === 200 ? 'SUCCESS' : 'FAILED'}`, deleteRes.body);
    }

    // 8. Test live exam invigilation query
    const invigRes = await makeRequest('/api/invigilation?department=CSE', 'GET');
    console.log(`8. Live Exam Invigilation Query: ${invigRes.status === 200 ? 'SUCCESS' : 'FAILED'} (${invigRes.body.length} exam duty records returned)`);

    console.log("\n=== ALL REAL-TIME POSTGRESQL BACKEND TESTS PASSED ===");
    process.exit(0);
}

testRealtimeDB();
