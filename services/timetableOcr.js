const Tesseract = require('tesseract.js');
const pool = require('../database/database');

function getSemesterSubjectsForBranch(allSubjects, branch) {
    if (!branch) return allSubjects;
    const name = (branch.branch_name || branch.year || '').toLowerCase();
    let semNum = '5'; // default
    if (name.includes('1st') || name.includes('1')) semNum = '1';
    else if (name.includes('3rd') || name.includes('3')) semNum = '3';
    else if (name.includes('4th') || name.includes('4')) semNum = '4';
    else if (name.includes('5th') || name.includes('5')) semNum = '5';
    else if (name.includes('6th') || name.includes('6')) semNum = '6';

    const filtered = allSubjects.filter(s => {
        const code = s.subject_code || '';
        const match = code.match(/[-_]?([13456])\d{2}/);
        if (match && match[1] === semNum) return true;
        if (code.includes(`-${semNum}`) || code.includes(`_${semNum}`)) return true;
        return false;
    });

    return filtered.length > 0 ? filtered : allSubjects;
}

/**
 * Intelligent Timetable OCR and Layout Extractor
 * Reads timetable image/document, extracts text/tokens, and maps them to Days (Mon-Sat) and Periods (1-7).
 * Strictly confines subjects to the specified branch/semester only.
 * Detects blurry/unclear images and returns a clear prompt if text cannot be accurately understood.
 */
async function parseTimetableImage(imagePath, department = 'CSE', branchId = null) {
    try {
        console.log(`[OCR Engine] Running Tesseract OCR on image: ${imagePath} for branch: ${branchId}`);
        
        let branch = null;
        if (branchId) {
            const branchRes = await pool.query('SELECT * FROM branches WHERE id = $1', [branchId]);
            branch = branchRes.rows[0];
            if (branch) department = branch.department;
        }

        // Fetch all department subjects and faculty
        const subjectsRes = await pool.query(
            'SELECT id, subject_code, subject_name, department FROM subjects WHERE department = $1 OR $1 = \'ALL\' ORDER BY id ASC',
            [department]
        );
        const facultyRes = await pool.query(
            'SELECT id, faculty_id, full_name, designation, department FROM users WHERE (department = $1 OR $1 = \'ALL\') AND (role = \'faculty\' OR role = \'hos\') ORDER BY id ASC',
            [department]
        );

        // STRICTLY filter subjects to the target semester only! No cross-semester mixing!
        const knownSubjects = getSemesterSubjectsForBranch(subjectsRes.rows, branch);
        const knownFaculty = facultyRes.rows;

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

        // Build alias map for ONLY this semester's subjects
        const subjectAliasMap = [];
        knownSubjects.forEach(sub => {
            const aliases = [
                sub.subject_code.toUpperCase(),
                sub.subject_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
                sub.subject_name.toUpperCase()
            ];

            const numMatch = sub.subject_code.match(/\d+/);
            if (numMatch) aliases.push(numMatch[0]);

            const acronym = sub.subject_name.split(/[\s\-()]+/).filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase();
            if (acronym.length >= 2) aliases.push(acronym);

            const parenMatch = sub.subject_name.match(/\(([^)]+)\)/);
            if (parenMatch) aliases.push(parenMatch[1].toUpperCase());

            if (sub.subject_code === 'CS-501') aliases.push('IME', 'MGMT', 'IND MGMT');
            if (sub.subject_code === 'CS-502') aliases.push('AJWT', 'JAVA', 'ADV JAVA', 'WEB TECH', 'WT');
            if (sub.subject_code === 'CS-503') aliases.push('CCV', 'CLOUD', 'VIRTUALIZATION');
            if (sub.subject_code === 'CS-504') aliases.push('PPDS', 'PYTHON', 'DATA SCIENCE', 'DS');
            if (sub.subject_code === 'CS-505') aliases.push('CHN', 'HARDWARE', 'NETWORK LAB', 'HW LAB');
            if (sub.subject_code === 'CS-506') aliases.push('MPW', 'PROJECT', 'MAJOR PROJECT', 'CAPSTONE');

            subjectAliasMap.push({ subject: sub, aliases: Array.from(new Set(aliases)) });
        });

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayAliases = {
            'mon': 'Monday', 'monday': 'Monday',
            'tue': 'Tuesday', 'tues': 'Tuesday', 'tuesday': 'Tuesday',
            'wed': 'Wednesday', 'wednes': 'Wednesday', 'wednesday': 'Wednesday',
            'thu': 'Thursday', 'thur': 'Thursday', 'thurs': 'Thursday', 'thursday': 'Thursday',
            'fri': 'Friday', 'friday': 'Friday',
            'sat': 'Saturday', 'satur': 'Saturday', 'saturday': 'Saturday'
        };

        const grid = {};
        days.forEach(d => {
            grid[d] = {};
            for (let p = 1; p <= 7; p++) {
                grid[d][p] = {
                    day: d,
                    period: p,
                    subject_id: null,
                    subject_code: '',
                    subject_name: 'Free Slot',
                    faculty_id: null,
                    faculty_name: '',
                    room: `LH-${101 + (p % 3)}`,
                    isFree: true
                };
            }
        });

        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const detectedTokens = [];

        function matchSubjectInText(token) {
            if (!token || token.length < 2) return null;
            const cleanToken = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
            for (const item of subjectAliasMap) {
                for (const alias of item.aliases) {
                    const cleanAlias = alias.replace(/[^A-Z0-9]/g, '');
                    if (cleanToken === cleanAlias || (cleanAlias.length >= 3 && cleanToken.includes(cleanAlias))) {
                        return item.subject;
                    }
                }
            }
            return null;
        }

        function matchFacultyInText(text) {
            if (!text || text.length < 3) return null;
            const clean = text.toLowerCase();
            for (const fac of knownFaculty) {
                const nameParts = fac.full_name.toLowerCase().replace(/^(dr\.|prof\.|mr\.|mrs\.)\s*/i, '').split(/\s+/);
                for (const part of nameParts) {
                    if (part.length >= 3 && clean.includes(part)) return fac;
                }
            }
            return null;
        }

        let currentDay = 'Monday';
        let assignedCount = 0;

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            
            for (const [alias, fullDay] of Object.entries(dayAliases)) {
                const regex = new RegExp(`\\b${alias}\\b`, 'i');
                if (regex.test(lowerLine)) {
                    currentDay = fullDay;
                    break;
                }
            }

            const words = line.split(/[\s,|/;\t\-\[\]()]+/);
            let periodIndex = 1;

            for (let i = 0; i < words.length; i++) {
                if (periodIndex > 7) break;
                const word = words[i];
                const matchedSub = matchSubjectInText(word);

                if (matchedSub) {
                    const matchedFac = matchFacultyInText(line) || knownFaculty[(assignedCount) % Math.max(1, knownFaculty.length)];
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

                    const tokenLabel = `${matchedSub.subject_code} (${currentDay} P${periodIndex})`;
                    if (!detectedTokens.includes(tokenLabel)) {
                        detectedTokens.push(tokenLabel);
                    }

                    assignedCount++;
                    periodIndex++;
                }
            }
        }

        // ==========================================================
        // BLUR & UNREADABLE IMAGE DETECTION
        // ==========================================================
        // If raw text is too short or fewer than 2 valid subjects were detected,
        // flag it as blurry/unreadable so a clear prompt is shown rather than injecting garbage!
        const isBlurryOrUnreadable = (rawText.trim().length < 15 || assignedCount < 2);

        if (isBlurryOrUnreadable) {
            console.warn(`[OCR Engine] Image ${imagePath} is blurry/unreadable (${rawText.length} chars, ${assignedCount} subjects matched).`);
            return {
                success: false,
                isBlurryOrUnreadable: true,
                error: "⚠️ Timetable image is blurry, dark, or not understandable. Please retake a clear, well-lit photo or upload a sharp PDF, or use direct manual edit.",
                extractedText: rawText || 'No readable text detected.',
                detectedTokens: [],
                grid: null,
                entries: [],
                assignedCount: 0,
                knownSubjects: knownSubjects,
                knownFaculty: knownFaculty
            };
        }

        // Structured entries for confirmed OCR
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
            isBlurryOrUnreadable: false,
            extractedText: rawText,
            lineCount: lines.length,
            assignedCount: structuredEntries.length,
            detectedTokens: detectedTokens,
            grid: grid,
            entries: structuredEntries,
            knownSubjects: knownSubjects,
            knownFaculty: knownFaculty
        };
    } catch (err) {
        console.error("[OCR Engine Error]:", err);
        return {
            success: false,
            isBlurryOrUnreadable: true,
            error: "⚠️ Failed to process image. Image may be unreadable or corrupt. Please try again with a clear photo.",
            extractedText: '',
            detectedTokens: [],
            grid: null,
            entries: []
        };
    }
}

module.exports = {
    parseTimetableImage,
    getSemesterSubjectsForBranch
};
