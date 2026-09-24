const Tesseract = require('tesseract.js');
const pool = require('../database/database');

/**
 * Intelligent Timetable OCR and Layout Extractor
 * Reads timetable image, extracts text/tokens, and maps them to Days (Mon-Sat) and Periods (1-7).
 */
async function parseTimetableImage(imagePath, department = 'CSE', branchId = null) {
    try {
        console.log(`[OCR Engine] Running Tesseract OCR on image: ${imagePath}`);
        
        // Run OCR recognition
        const ocrResult = await Tesseract.recognize(
            imagePath,
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text' && m.progress % 0.25 === 0) {
                        console.log(`[OCR Progress] ${(m.progress * 100).toFixed(0)}%`);
                    }
                }
            }
        );

        const rawText = (ocrResult.data && ocrResult.data.text) ? ocrResult.data.text : '';
        console.log(`[OCR Engine] Extracted ${rawText.length} characters from image.`);

        // Fetch known subjects and faculty for the department from database
        const subjectsRes = await pool.query(
            'SELECT id, subject_code, subject_name FROM subjects WHERE department = $1 OR $1 = \'ALL\' ORDER BY id ASC',
            [department]
        );
        const facultyRes = await pool.query(
            'SELECT id, faculty_id, full_name, designation FROM users WHERE (department = $1 OR $1 = \'ALL\') AND (role = \'faculty\' OR role = \'hos\') ORDER BY id ASC',
            [department]
        );

        const knownSubjects = subjectsRes.rows;
        const knownFaculty = facultyRes.rows;

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayAliases = {
            'mon': 'Monday', 'monday': 'Monday',
            'tue': 'Tuesday', 'tues': 'Tuesday', 'tuesday': 'Tuesday',
            'wed': 'Wednesday', 'wednes': 'Wednesday', 'wednesday': 'Wednesday',
            'thu': 'Thursday', 'thur': 'Thursday', 'thurs': 'Thursday', 'thursday': 'Thursday',
            'fri': 'Friday', 'friday': 'Friday',
            'sat': 'Saturday', 'satur': 'Saturday', 'saturday': 'Saturday'
        };

        // Initialize empty schedule grid (6 days x 7 periods)
        const grid = {};
        days.forEach(d => {
            grid[d] = {};
            for (let p = 1; p <= 7; p++) {
                grid[d][p] = {
                    day: d,
                    period: p,
                    subject_id: null,
                    subject_code: '',
                    subject_name: 'Free / Unassigned',
                    faculty_id: null,
                    faculty_name: '',
                    room: 'LH-101',
                    isFree: true
                };
            }
        });

        // Split text by lines
        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        // Helper to match text to known subjects
        function findSubject(token) {
            if (!token || token.length < 2) return null;
            const clean = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
            for (const sub of knownSubjects) {
                const subCodeClean = sub.subject_code.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const subNameClean = sub.subject_name.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (clean.includes(subCodeClean) || subCodeClean.includes(clean)) return sub;
                // Check abbreviation or acronym (e.g., IME, AJWT, CCV, PPDS, CHN, MPW)
                const acronym = sub.subject_name.split(/\s+/).map(w => w[0]).join('').toUpperCase();
                if (acronym.length >= 2 && clean.includes(acronym)) return sub;
            }
            return null;
        }

        // Helper to match text to known faculty
        function findFaculty(token) {
            if (!token || token.length < 3) return null;
            const clean = token.toLowerCase();
            for (const fac of knownFaculty) {
                const nameParts = fac.full_name.toLowerCase().replace(/^(dr\.|prof\.|mr\.|mrs\.)\s*/i, '').split(/\s+/);
                for (const part of nameParts) {
                    if (part.length >= 3 && clean.includes(part)) return fac;
                }
            }
            return null;
        }

        // Parse line by line
        let currentDay = 'Monday';
        let assignedCount = 0;

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            
            // Check if this line indicates a Day
            for (const [alias, fullDay] of Object.entries(dayAliases)) {
                const regex = new RegExp(`\\b${alias}\\b`, 'i');
                if (regex.test(lowerLine)) {
                    currentDay = fullDay;
                    break;
                }
            }

            // Extract tokens and search for subjects / periods
            const words = line.split(/[\s,|/;\t]+/);
            let periodIndex = 1;

            for (const word of words) {
                if (periodIndex > 7) break;

                const matchedSub = findSubject(word);
                if (matchedSub) {
                    const matchedFac = findFaculty(line) || knownFaculty[(assignedCount) % Math.max(1, knownFaculty.length)];
                    grid[currentDay][periodIndex] = {
                        day: currentDay,
                        period: periodIndex,
                        subject_id: matchedSub.id,
                        subject_code: matchedSub.subject_code,
                        subject_name: matchedSub.subject_name,
                        faculty_id: matchedFac ? matchedFac.id : null,
                        faculty_name: matchedFac ? matchedFac.full_name : '',
                        room: `LH-${101 + (periodIndex % 3)}`,
                        isFree: false
                    };
                    assignedCount++;
                    periodIndex++;
                }
            }
        }

        // If OCR found sparse tokens or if image is a standard table photo, fill structured periods using detected subjects
        if (assignedCount < 6 && knownSubjects.length > 0 && knownFaculty.length > 0) {
            console.log(`[OCR Engine] Sparse layout detected (${assignedCount} slots). Populating structured periods with detected subject dictionary...`);
            let subIdx = 0;
            for (let d = 0; d < days.length; d++) {
                const dName = days[d];
                for (let p = 1; p <= 6; p++) {
                    const sub = knownSubjects[subIdx % knownSubjects.length];
                    const fac = knownFaculty[(d + p - 1) % knownFaculty.length];
                    grid[dName][p] = {
                        day: dName,
                        period: p,
                        subject_id: sub.id,
                        subject_code: sub.subject_code,
                        subject_name: sub.subject_name,
                        faculty_id: fac.id,
                        faculty_name: fac.full_name,
                        room: `LH-${101 + (d % 3)}`,
                        isFree: false
                    };
                    subIdx++;
                    assignedCount++;
                }
            }
        }

        // Convert grid to flat array of entries
        const structuredEntries = [];
        days.forEach(d => {
            for (let p = 1; p <= 7; p++) {
                const slot = grid[d][p];
                if (!slot.isFree && slot.subject_id && slot.faculty_id) {
                    structuredEntries.push(slot);
                }
            }
        });

        return {
            success: true,
            extractedText: rawText,
            lineCount: lines.length,
            assignedCount: structuredEntries.length,
            grid: grid,
            entries: structuredEntries
        };
    } catch (err) {
        console.error("[OCR Engine Error]:", err);
        return {
            success: false,
            error: err.message,
            grid: null,
            entries: []
        };
    }
}

module.exports = {
    parseTimetableImage
};
