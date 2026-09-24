const { parseTimetableImage } = require('../services/timetableOcr');
const path = require('path');

async function runTest() {
    const imgPath = path.join(__dirname, '..', 'uploads', 'faculty-tt-1790262552354-82990618.jpeg');
    console.log("=== TESTING OCR ON LATEST UPLOADED IMAGE ===");
    const res = await parseTimetableImage(imgPath, 'CSE', 4);
    
    console.log("Success:", res.success);
    console.log("Is Blurry:", res.isBlurryOrUnreadable);
    console.log("Total structured entries:", res.assignedCount);
    console.log("Detected Tokens:");
    res.detectedTokens.forEach(t => console.log("  *", t));
    
    console.log("\nKnown Subjects Strictly Scoped to 5th Sem:");
    res.knownSubjects.forEach(s => console.log(`  - [${s.subject_code}] ${s.subject_name}`));

    console.log("\nSample Structured Schedule:");
    ['Monday', 'Wednesday', 'Saturday'].forEach(d => {
        console.log(`\n--- ${d} ---`);
        for (let p = 1; p <= 7; p++) {
            const s = res.grid[d][p];
            console.log(`P${p}: ${s.subject_code || 'FREE'} - ${s.subject_name} | Faculty: ${s.faculty_name} | Room: ${s.room} | 3-Slot Lab: ${s.is_lab_block}`);
        }
    });

    process.exit(0);
}

runTest().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});
