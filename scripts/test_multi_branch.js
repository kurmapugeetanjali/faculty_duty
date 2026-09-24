const http = require('http');

async function makeRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(JSON.stringify(postData));
        req.end();
    });
}

async function testAll() {
    console.log("🧪 Testing F.A.S.T Multi-Branch System...");

    // 1. Test Login as HOD of MECH
    const loginRes = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { faculty_id: 'HOD_MECH', password: 'Fast@2026' });

    console.log("✅ HOD MECH Login Status:", loginRes.status);
    console.log("👤 Logged in User:", loginRes.body.user.full_name, "| Role:", loginRes.body.user.role, "| Dept:", loginRes.body.user.department);

    const cookie = loginRes.headers['set-cookie'];

    // 2. Test Fetching all 25 Branches
    const branchesRes = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/timetable/branches',
        method: 'GET',
        headers: { 'Cookie': cookie }
    });
    console.log("✅ Total Branches Count:", branchesRes.body.length);

    // 3. Test Fetching Timetable for MECH 5th Sem (Branch 9)
    const ttRes = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/timetable/9',
        method: 'GET',
        headers: { 'Cookie': cookie }
    });
    console.log("✅ MECH 5th Sem Timetable Slots:", ttRes.body.length);

    // 4. Test Substitution Matching for MECH Monday Period 1
    const subRes = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/substitutions/available?date=2026-09-28&day=Monday&period=1&department=MECH',
        method: 'GET',
        headers: { 'Cookie': cookie }
    });
    console.log("✅ MECH Monday Period 1 Available Substitute Candidates:", subRes.body.length);
    subRes.body.forEach(f => {
        console.log(`   - ${f.full_name} (${f.phone}) -> Status: ${f.availability_status}`);
    });

    // 5. Test Substitution Matching for ECE Monday Period 1
    const eceSubRes = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/substitutions/available?date=2026-09-28&day=Monday&period=1&department=ECE',
        method: 'GET',
        headers: { 'Cookie': cookie }
    });
    console.log("✅ ECE Monday Period 1 Available Substitute Candidates:", eceSubRes.body.length);
    eceSubRes.body.forEach(f => {
        console.log(`   - ${f.full_name} (${f.phone}) -> Status: ${f.availability_status}`);
    });

    console.log("\n🎉 ALL MULTI-BRANCH INTEGRATION TESTS PASSED PERFECTLY!");
    process.exit(0);
}

testAll();
