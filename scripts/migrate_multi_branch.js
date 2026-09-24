const pool = require('../database/database');

async function migrateMultiBranch() {
    console.log("🚀 Starting Multi-Branch Migration (CSE, MECH, EEE, ECE, CIVIL)...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Drop existing tables cleanly
        await client.query('DROP TABLE IF EXISTS substitutions CASCADE;');
        await client.query('DROP TABLE IF EXISTS exam_invigilation CASCADE;');
        await client.query('DROP TABLE IF EXISTS faculty_personal_schedule CASCADE;');
        await client.query('DROP TABLE IF EXISTS timetable CASCADE;');
        await client.query('DROP TABLE IF EXISTS subjects CASCADE;');
        await client.query('DROP TABLE IF EXISTS branches CASCADE;');
        await client.query('DROP TABLE IF EXISTS users CASCADE;');

        // 2. Recreate Tables
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                faculty_id TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT NOT NULL,
                department TEXT NOT NULL,
                designation TEXT DEFAULT 'Lecturer',
                password_hash TEXT NOT NULL,
                role TEXT CHECK(role IN ('hos', 'faculty')) NOT NULL
            );

            CREATE TABLE branches (
                id SERIAL PRIMARY KEY,
                department TEXT NOT NULL,
                branch_name TEXT NOT NULL,
                year TEXT NOT NULL,
                section TEXT NOT NULL DEFAULT 'A',
                hos_id INTEGER REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE subjects (
                id SERIAL PRIMARY KEY,
                subject_code TEXT UNIQUE NOT NULL,
                subject_name TEXT NOT NULL,
                department TEXT NOT NULL
            );

            CREATE TABLE timetable (
                id SERIAL PRIMARY KEY,
                branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
                day TEXT CHECK(day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')) NOT NULL,
                period INTEGER NOT NULL CHECK (period >= 1 AND period <= 7),
                start_time TEXT,
                end_time TEXT,
                subject_id INTEGER NOT NULL REFERENCES subjects(id),
                faculty_id INTEGER NOT NULL REFERENCES users(id),
                room TEXT
            );

            CREATE TABLE exam_invigilation (
                id SERIAL PRIMARY KEY,
                department TEXT NOT NULL,
                exam_name TEXT NOT NULL,
                exam_date TEXT NOT NULL,
                session TEXT NOT NULL,
                hall_no TEXT NOT NULL,
                faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                photo_url TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE faculty_personal_schedule (
                id SERIAL PRIMARY KEY,
                faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                day TEXT CHECK(day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')) NOT NULL,
                period INTEGER NOT NULL CHECK (period >= 1 AND period <= 7),
                status TEXT CHECK(status IN ('free', 'busy')) NOT NULL DEFAULT 'free',
                notes TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(faculty_id, day, period)
            );

            CREATE TABLE substitutions (
                id SERIAL PRIMARY KEY,
                timetable_id INTEGER NOT NULL REFERENCES timetable(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                original_faculty_id INTEGER NOT NULL REFERENCES users(id),
                substitute_faculty_id INTEGER NOT NULL REFERENCES users(id),
                reason TEXT NOT NULL,
                status TEXT CHECK(status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')) DEFAULT 'accepted',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Tables created successfully.");

        const defaultHash = '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2'; // Fast@2026

        // 3. Seed Users across all 5 Departments
        const usersList = [
            // CSE
            [1, 'HOD_CSE', 'Dr. K. Smitha', 'hod.cse@polytechnic.edu', '+91 98480 11223', 'CSE', 'Head of Department - CSE', defaultHash, 'hos'],
            [2, 'FAC001', 'Dr. V. Ravi Kumar', 'ravi.cse@polytechnic.edu', '+91 98481 22334', 'CSE', 'Senior Lecturer in CSE', defaultHash, 'faculty'],
            [3, 'FAC002', 'Dr. S. Anitha', 'anitha.cse@polytechnic.edu', '+91 98482 33445', 'CSE', 'Lecturer in CSE', defaultHash, 'faculty'],
            [4, 'FAC003', 'Prof. M. Kiran', 'kiran.cse@polytechnic.edu', '+91 98483 44556', 'CSE', 'Assistant Lecturer in CSE', defaultHash, 'faculty'],
            [5, 'FAC004', 'Prof. P. Priya', 'priya.cse@polytechnic.edu', '+91 98484 55667', 'CSE', 'Assistant Lecturer in CSE', defaultHash, 'faculty'],
            [6, 'FAC005', 'Prof. G. Ramesh', 'ramesh.cse@polytechnic.edu', '+91 98485 66778', 'CSE', 'Assistant Lecturer in CSE', defaultHash, 'faculty'],

            // MECH
            [7, 'HOD_MECH', 'Dr. A. Murali Krishna', 'hod.mech@polytechnic.edu', '+91 98486 77889', 'MECH', 'Head of Department - Mechanical', defaultHash, 'hos'],
            [8, 'MECH001', 'Prof. K. Suresh', 'suresh.mech@polytechnic.edu', '+91 98487 88990', 'MECH', 'Senior Lecturer in Mechanical', defaultHash, 'faculty'],
            [9, 'MECH002', 'Dr. T. Venkat', 'venkat.mech@polytechnic.edu', '+91 98488 99001', 'MECH', 'Lecturer in Mechanical', defaultHash, 'faculty'],
            [10, 'MECH003', 'Prof. R. Naresh', 'naresh.mech@polytechnic.edu', '+91 98489 00112', 'MECH', 'Assistant Lecturer in Mechanical', defaultHash, 'faculty'],
            [11, 'MECH004', 'Prof. S. Prasad', 'prasad.mech@polytechnic.edu', '+91 98480 22334', 'MECH', 'Assistant Lecturer in Mechanical', defaultHash, 'faculty'],

            // EEE
            [12, 'HOD_EEE', 'Dr. B. Suresh Kumar', 'hod.eee@polytechnic.edu', '+91 98481 33445', 'EEE', 'Head of Department - Electrical', defaultHash, 'hos'],
            [13, 'EEE001', 'Dr. M. Vijay', 'vijay.eee@polytechnic.edu', '+91 98482 44556', 'EEE', 'Senior Lecturer in Electrical', defaultHash, 'faculty'],
            [14, 'EEE002', 'Prof. K. Swathi', 'swathi.eee@polytechnic.edu', '+91 98483 55667', 'EEE', 'Lecturer in Electrical', defaultHash, 'faculty'],
            [15, 'EEE003', 'Prof. P. Naveen', 'naveen.eee@polytechnic.edu', '+91 98484 66778', 'EEE', 'Assistant Lecturer in Electrical', defaultHash, 'faculty'],
            [16, 'EEE004', 'Prof. D. Latha', 'latha.eee@polytechnic.edu', '+91 98485 77889', 'EEE', 'Assistant Lecturer in Electrical', defaultHash, 'faculty'],

            // ECE
            [17, 'HOD_ECE', 'Dr. P. Venkat Rao', 'hod.ece@polytechnic.edu', '+91 98486 88990', 'ECE', 'Head of Department - Electronics', defaultHash, 'hos'],
            [18, 'ECE001', 'Dr. G. Sandhya', 'sandhya.ece@polytechnic.edu', '+91 98487 99001', 'ECE', 'Senior Lecturer in Electronics', defaultHash, 'faculty'],
            [19, 'ECE002', 'Prof. K. Rajesh', 'rajesh.ece@polytechnic.edu', '+91 98488 00112', 'ECE', 'Lecturer in Electronics', defaultHash, 'faculty'],
            [20, 'ECE003', 'Prof. V. Teja', 'teja.ece@polytechnic.edu', '+91 98489 11223', 'ECE', 'Assistant Lecturer in Electronics', defaultHash, 'faculty'],
            [21, 'ECE004', 'Prof. S. Bhavani', 'bhavani.ece@polytechnic.edu', '+91 98480 33445', 'ECE', 'Assistant Lecturer in Electronics', defaultHash, 'faculty'],

            // CIVIL
            [22, 'HOD_CIVIL', 'Dr. N. Ramesh Babu', 'hod.civil@polytechnic.edu', '+91 98481 44556', 'CIVIL', 'Head of Department - Civil', defaultHash, 'hos'],
            [23, 'CIV001', 'Prof. C. Mahesh', 'mahesh.civil@polytechnic.edu', '+91 98482 55667', 'CIVIL', 'Senior Lecturer in Civil', defaultHash, 'faculty'],
            [24, 'CIV002', 'Dr. J. Haritha', 'haritha.civil@polytechnic.edu', '+91 98483 66778', 'CIVIL', 'Lecturer in Civil', defaultHash, 'faculty'],
            [25, 'CIV003', 'Prof. B. Ashok', 'ashok.civil@polytechnic.edu', '+91 98484 77889', 'CIVIL', 'Assistant Lecturer in Civil', defaultHash, 'faculty'],
            [26, 'CIV004', 'Prof. M. Kalyani', 'kalyani.civil@polytechnic.edu', '+91 98485 88990', 'CIVIL', 'Assistant Lecturer in Civil', defaultHash, 'faculty']
        ];

        for (const u of usersList) {
            await client.query(
                `INSERT INTO users (id, faculty_id, full_name, email, phone, department, designation, password_hash, role) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                u
            );
        }
        await client.query("SELECT setval('users_id_seq', 26);");
        console.log(`✅ Seeded ${usersList.length} faculty members and HODs across 5 branches.`);

        // 4. Seed Branches (5 Semesters each for 5 Departments = 25 Semesters)
        const departments = [
            { code: 'CSE', hosId: 1 },
            { code: 'MECH', hosId: 7 },
            { code: 'EEE', hosId: 12 },
            { code: 'ECE', hosId: 17 },
            { code: 'CIVIL', hosId: 22 }
        ];

        const semesters = [
            { name: '1st Year', year: '1st Year' },
            { name: '3rd Sem', year: '3rd Semester' },
            { name: '4th Sem', year: '4th Semester' },
            { name: '5th Sem', year: '5th Semester' },
            { name: '6th Sem', year: '6th Semester' }
        ];

        let branchId = 1;
        for (const dept of departments) {
            for (const sem of semesters) {
                await client.query(
                    `INSERT INTO branches (id, department, branch_name, year, section, hos_id) 
                     VALUES ($1, $2, $3, $4, 'A', $5)`,
                    [branchId, dept.code, `${dept.code} ${sem.name}`, sem.year, dept.hosId]
                );
                branchId++;
            }
        }
        await client.query("SELECT setval('branches_id_seq', 25);");
        console.log("✅ Seeded 25 branches.");

        // 5. Seed Subjects for all 5 Departments
        const subjectsData = [
            // CSE Subjects
            [101, 'CM-101', 'English & Communication Skills', 'CSE'],
            [102, 'CM-102', 'Engineering Mathematics - I', 'CSE'],
            [103, 'CM-103', 'Engineering Physics', 'CSE'],
            [104, 'CM-104', 'Engineering Chemistry', 'CSE'],
            [105, 'CM-105', 'Computer Fundamentals & C Programming', 'CSE'],
            [106, 'CM-106', 'Programming in C Lab', 'CSE'],
            [301, 'CM-301', 'Engineering Mathematics - II', 'CSE'],
            [302, 'CM-302', 'Data Structures through C', 'CSE'],
            [303, 'CM-303', 'Digital Electronics & Architecture', 'CSE'],
            [304, 'CM-304', 'Database Management Systems (DBMS)', 'CSE'],
            [305, 'CM-305', 'Data Structures Lab', 'CSE'],
            [306, 'CM-306', 'DBMS & SQL Lab', 'CSE'],
            [401, 'CM-401', 'Operating Systems & Linux', 'CSE'],
            [402, 'CM-402', 'Object Oriented Programming through Java', 'CSE'],
            [403, 'CM-403', 'Computer Networks & Security', 'CSE'],
            [404, 'CM-404', 'Web Technologies (HTML, CSS, JS)', 'CSE'],
            [405, 'CM-405', 'Java Programming Lab', 'CSE'],
            [406, 'CM-406', 'Web Development Lab', 'CSE'],
            [501, 'CS-501', 'Industrial Management & Entrepreneurship (IME)', 'CSE'],
            [502, 'CS-502', 'Advanced Java & Web Technologies (AJWT)', 'CSE'],
            [503, 'CS-503', 'Cloud Computing & Virtualization (CCV)', 'CSE'],
            [504, 'CS-504', 'Python Programming & Data Science (PPDS)', 'CSE'],
            [505, 'CS-505', 'Computer Hardware & Networking Lab', 'CSE'],
            [506, 'CS-506', '5th Sem Major Project Work', 'CSE'],
            [601, 'CS-601', 'Mobile Application Development', 'CSE'],
            [602, 'CS-602', 'Software Engineering & Agile', 'CSE'],
            [603, 'CS-603', 'Information Security & Forensics', 'CSE'],
            [604, 'CS-604', 'AI & Machine Learning', 'CSE'],
            [605, 'CS-605', 'Mobile App Development Lab', 'CSE'],
            [606, 'CS-606', 'Final Capstone Project', 'CSE'],

            // MECH Subjects
            [701, 'M-101', 'Basic Mechanical Engineering', 'MECH'],
            [702, 'M-102', 'Engineering Drawing & Graphics', 'MECH'],
            [703, 'M-301', 'Thermodynamics & Heat Engines', 'MECH'],
            [704, 'M-302', 'Manufacturing Technology - I', 'MECH'],
            [705, 'M-401', 'Fluid Mechanics & Hydraulic Machinery', 'MECH'],
            [706, 'M-402', 'Strength of Materials', 'MECH'],
            [707, 'M-501', 'Design of Machine Elements (DME)', 'MECH'],
            [708, 'M-502', 'Thermal Engineering & Power Plants', 'MECH'],
            [709, 'M-503', 'CAD/CAM & CNC Automation', 'MECH'],
            [710, 'M-504', 'Refrigeration & Air Conditioning', 'MECH'],
            [711, 'M-505', 'Thermal Engg Lab', 'MECH'],
            [712, 'M-506', 'CAD/CAM Lab & Project', 'MECH'],
            [713, 'M-601', 'Industrial Engineering & QC', 'MECH'],
            [714, 'M-602', 'Robotics & Automation', 'MECH'],

            // EEE Subjects
            [801, 'EE-101', 'Basic Electrical Engineering', 'EEE'],
            [802, 'EE-301', 'Electrical Circuits & Networks', 'EEE'],
            [803, 'EE-302', 'DC Machines & Transformers', 'EEE'],
            [804, 'EE-401', 'AC Machines & Generators', 'EEE'],
            [805, 'EE-402', 'Electrical Measurements', 'EEE'],
            [806, 'EE-501', 'Power Systems Generation & Transmission', 'EEE'],
            [807, 'EE-502', 'Power Electronics & Drives', 'EEE'],
            [808, 'EE-503', 'Microcontrollers & PLC', 'EEE'],
            [809, 'EE-504', 'Renewable Energy Sources', 'EEE'],
            [810, 'EE-505', 'Power Electronics Lab', 'EEE'],
            [811, 'EE-506', 'Electrical Simulation Lab', 'EEE'],
            [812, 'EE-601', 'Switchgear & Protection', 'EEE'],
            [813, 'EE-602', 'Electric Vehicles & Smart Grid', 'EEE'],

            // ECE Subjects
            [901, 'EC-101', 'Basic Electronics Engineering', 'ECE'],
            [902, 'EC-301', 'Electronic Devices & Circuits', 'ECE'],
            [903, 'EC-302', 'Analog & Digital Communication', 'ECE'],
            [904, 'EC-401', 'Linear Integrated Circuits & Op-Amps', 'ECE'],
            [905, 'EC-402', 'Microprocessors & Interfacing', 'ECE'],
            [906, 'EC-501', 'Embedded Systems & IoT', 'ECE'],
            [907, 'EC-502', 'VLSI Design & Verilog', 'ECE'],
            [908, 'EC-503', 'Microwave & Optical Comm', 'ECE'],
            [909, 'EC-504', 'Digital Signal Processing (DSP)', 'ECE'],
            [910, 'EC-505', 'Embedded & IoT Lab', 'ECE'],
            [911, 'EC-506', 'VLSI Simulation & Project', 'ECE'],
            [912, 'EC-601', 'Wireless & 5G Communications', 'ECE'],
            [913, 'EC-602', 'Automotive Electronics', 'ECE'],

            // CIVIL Subjects
            [1001, 'CE-101', 'Surveying & Levelling - I', 'CIVIL'],
            [1002, 'CE-301', 'Building Materials & Construction', 'CIVIL'],
            [1003, 'CE-302', 'Mechanics of Structures', 'CIVIL'],
            [1004, 'CE-401', 'Hydraulics & Water Resources', 'CIVIL'],
            [1005, 'CE-402', 'Advanced Surveying & GIS', 'CIVIL'],
            [1006, 'CE-501', 'Reinforced Concrete Structures (RCC)', 'CIVIL'],
            [1007, 'CE-502', 'Geotechnical & Soil Mechanics', 'CIVIL'],
            [1008, 'CE-503', 'Transportation & Highway Engg', 'CIVIL'],
            [1009, 'CE-504', 'Environmental Engineering', 'CIVIL'],
            [1010, 'CE-505', 'Civil CAD & Drafting Lab', 'CIVIL'],
            [1011, 'CE-506', 'Material Testing Lab', 'CIVIL'],
            [1012, 'CE-601', 'Construction Planning & Estimation', 'CIVIL'],
            [1013, 'CE-602', 'Steel Structural Design', 'CIVIL']
        ];

        for (const s of subjectsData) {
            await client.query(
                `INSERT INTO subjects (id, subject_code, subject_name, department) VALUES ($1, $2, $3, $4)`,
                s
            );
        }
        await client.query("SELECT setval('subjects_id_seq', 1013);");
        console.log(`✅ Seeded ${subjectsData.length} subjects.`);

        // 6. Seed Master Timetable (Fast Batch Insert)
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const periodTimes = [
            { p: 1, start: '08:00', end: '08:45' },
            { p: 2, start: '08:45', end: '09:30' },
            { p: 3, start: '09:30', end: '10:15' },
            { p: 4, start: '10:30', end: '11:15' },
            { p: 5, start: '11:15', end: '12:00' },
            { p: 6, start: '12:00', end: '12:45' },
            { p: 7, start: '12:45', end: '01:30' }
        ];

        const deptConfigs = {
            'CSE': { faculty: [2, 3, 4, 5, 6], subjects: [501, 502, 503, 504, 505, 506], roomPrefix: 'CSE-LH' },
            'MECH': { faculty: [8, 9, 10, 11, 7], subjects: [707, 708, 709, 710, 711, 712], roomPrefix: 'MECH-LH' },
            'EEE': { faculty: [13, 14, 15, 16, 12], subjects: [806, 807, 808, 809, 810, 811], roomPrefix: 'EEE-LH' },
            'ECE': { faculty: [18, 19, 20, 21, 17], subjects: [906, 907, 908, 909, 910, 911], roomPrefix: 'ECE-LH' },
            'CIVIL': { faculty: [23, 24, 25, 26, 22], subjects: [1006, 1007, 1008, 1009, 1010, 1011], roomPrefix: 'CIVIL-LH' }
        };

        const rows = [];
        let valIndex = 1;
        const placeholders = [];

        for (let bId = 1; bId <= 25; bId++) {
            let deptCode = 'CSE';
            if (bId > 5 && bId <= 10) deptCode = 'MECH';
            else if (bId > 10 && bId <= 15) deptCode = 'EEE';
            else if (bId > 15 && bId <= 20) deptCode = 'ECE';
            else if (bId > 20) deptCode = 'CIVIL';

            const cfg = deptConfigs[deptCode];
            let counter = (bId * 3);

            for (const d of days) {
                for (const pt of periodTimes) {
                    const subj = cfg.subjects[counter % cfg.subjects.length];
                    const fac = cfg.faculty[counter % cfg.faculty.length];
                    const room = `${cfg.roomPrefix}-${100 + (bId % 5) * 10 + (counter % 3)}`;

                    placeholders.push(`($${valIndex}, $${valIndex+1}, $${valIndex+2}, $${valIndex+3}, $${valIndex+4}, $${valIndex+5}, $${valIndex+6}, $${valIndex+7})`);
                    rows.push(bId, d, pt.p, pt.start, pt.end, subj, fac, room);
                    valIndex += 8;
                    counter++;
                }
            }
        }

        // Batch insert in chunks of 500
        const chunkSize = 200; // items (each item is 8 values)
        for (let i = 0; i < placeholders.length; i += chunkSize) {
            const chunkPlaceholders = placeholders.slice(i, i + chunkSize);
            const chunkRows = rows.slice(i * 8, (i + chunkSize) * 8);

            // Re-index placeholders for this chunk
            const reindexed = chunkPlaceholders.map((_, pIdx) => {
                const base = pIdx * 8 + 1;
                return `($${base}, $${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7})`;
            });

            await client.query(
                `INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) 
                 VALUES ${reindexed.join(', ')}`,
                chunkRows
            );
        }
        console.log("✅ Seeded weekly master timetables for all 25 branches & semesters in fast batches.");

        // 7. Seed Exam Invigilations for all 5 departments
        const invigilations = [
            [1, 'CSE', 'State Board Diploma Mid-I Examination', '2026-09-28', 'Morning (08:00 - 10:15)', 'Drawing Hall-1 (Main Block)', 3, '/uploads/invigilation_sample.png', 'Chief Invigilator - Dr. S. Anitha'],
            [2, 'CSE', 'Board Practical Examination (CHN & Hardware Lab)', '2026-09-29', 'Midday (10:30 - 01:30)', 'Hardware & Networking Lab', 5, '/uploads/invigilation_sample.png', 'Internal Examiner - Prof. P. Priya'],
            [3, 'MECH', 'Mechanical Engineering CAD & Thermal Lab Exam', '2026-09-28', 'Morning (08:00 - 10:15)', 'CAD/CAM Lab & Workshop', 9, '/uploads/invigilation_sample.png', 'Examiner - Dr. T. Venkat'],
            [4, 'EEE', 'Electrical Machines & Simulation Practical Exam', '2026-09-29', 'Morning (08:00 - 10:15)', 'Machines Lab Block-B', 14, '/uploads/invigilation_sample.png', 'Invigilator - Prof. K. Swathi'],
            [5, 'ECE', 'VLSI & IoT System Design Mid-Term Exam', '2026-09-28', 'Midday (10:30 - 01:30)', 'DSP & IoT Hall-3', 19, '/uploads/invigilation_sample.png', 'Invigilator - Prof. K. Rajesh'],
            [6, 'CIVIL', 'Surveying & Structural Engineering Exam', '2026-09-30', 'Morning (08:00 - 10:15)', 'Civil Drawing Hall-2', 24, '/uploads/invigilation_sample.png', 'Invigilator - Dr. J. Haritha']
        ];

        for (const inv of invigilations) {
            await client.query(
                `INSERT INTO exam_invigilation (id, department, exam_name, exam_date, session, hall_no, faculty_id, photo_url, notes) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                inv
            );
        }
        await client.query("SELECT setval('exam_invigilation_id_seq', 6);");
        console.log("✅ Seeded exam invigilations across all 5 departments.");

        await client.query('COMMIT');
        console.log("🎉 Multi-Branch Migration COMPLETED SUCCESSFULLY!");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Migration failed:", err);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrateMultiBranch();
