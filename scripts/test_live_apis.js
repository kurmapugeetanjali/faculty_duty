async function run() {
    try {
        const metaRes = await fetch('http://localhost:3000/api/timetable/meta/options?department=CSE&branch_id=4');
        const meta = await metaRes.json();
        console.log("=== STRICT 5TH SEM SUBJECTS (NO UNKNOWN SUBJECTS) ===");
        meta.subjects.forEach(s => console.log(`  - [${s.subject_code}] ${s.subject_name}`));

        const subRes = await fetch('http://localhost:3000/api/substitutions/available?date=2026-09-24&day=Monday&period=4&branch_id=4');
        const sub = await subRes.json();
        console.log("\n=== SUBSTITUTION FOR MONDAY PERIOD 4 (3-PERIOD LAB BLOCK) ===");
        console.log("is_lab_block:", sub.is_lab_block);
        console.log("lab_block_periods:", sub.lab_block_periods);
        console.log("lab_subject_name:", sub.lab_subject_name);
        console.log("Total candidates:", sub.faculty ? sub.faculty.length : 0);
        if (sub.faculty) {
            sub.faculty.forEach(f => {
                console.log(`  * ${f.full_name} (${f.phone}) -> ${f.status_badge} | Available for full Lab: ${f.is_completely_free_for_lab}`);
            });
        }

        const ttRes = await fetch('http://localhost:3000/api/timetable/4');
        const tt = await ttRes.json();
        console.log("\n=== TIMETABLE SLOTS FOR BRANCH 4 (5th Sem) ===");
        console.log("Total periods:", tt.length);

        process.exit(0);
    } catch (e) {
        console.error("Test failed:", e);
        process.exit(1);
    }
}

run();
