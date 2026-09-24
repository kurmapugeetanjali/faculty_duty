-- ==========================================================
-- F.A.S.T (Faculty Alternative Substitute Tracker)
-- Multi-Department Institutional Schema & Seed Data
-- Supporting: CSE, MECH, EEE, ECE, CIVIL (All 5 Semesters each)
-- ==========================================================

-- Drop existing tables in correct dependency order
DROP TABLE IF EXISTS substitutions CASCADE;
DROP TABLE IF EXISTS exam_invigilation CASCADE;
DROP TABLE IF EXISTS faculty_personal_schedule CASCADE;
DROP TABLE IF EXISTS timetable CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users Table (Faculty & HODs for all 5 Branches)
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

-- 2. Branches / Semesters (1st Year, 3rd Sem, 4th Sem, 5th Sem, 6th Sem for each Dept)
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    department TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    year TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    hos_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Subjects Table
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    subject_code TEXT UNIQUE NOT NULL,
    subject_name TEXT NOT NULL,
    department TEXT NOT NULL
);

-- 4. Official Master Timetable (Periods 1 to 7: 08:00 AM to 01:30 PM)
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

-- 5. Exam Invigilation Table
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

-- 6. Faculty Personal Timetable Table
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

-- 7. Active Substitutions Table
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

-- ================= SEED DATA =================

-- 1. Faculty Members & HODs for all 5 Departments (Default Pass: Fast@2026)
INSERT INTO users (id, faculty_id, full_name, email, phone, department, designation, password_hash, role) VALUES
-- CSE
(1, 'HOD_CSE', 'Dr. K. Smitha', 'hod.cse@polytechnic.edu', '+91 98480 11223', 'CSE', 'Head of Department - CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'hos'),
(2, 'FAC001', 'Dr. V. Ravi Kumar', 'ravi.cse@polytechnic.edu', '+91 98481 22334', 'CSE', 'Senior Lecturer in CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(3, 'FAC002', 'Dr. S. Anitha', 'anitha.cse@polytechnic.edu', '+91 98482 33445', 'CSE', 'Lecturer in CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(4, 'FAC003', 'Prof. M. Kiran', 'kiran.cse@polytechnic.edu', '+91 98483 44556', 'CSE', 'Assistant Lecturer in CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(5, 'FAC004', 'Prof. P. Priya', 'priya.cse@polytechnic.edu', '+91 98484 55667', 'CSE', 'Assistant Lecturer in CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(6, 'FAC005', 'Prof. G. Ramesh', 'ramesh.cse@polytechnic.edu', '+91 98485 66778', 'CSE', 'Assistant Lecturer in CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),

-- MECH
(7, 'HOD_MECH', 'Dr. A. Murali Krishna', 'hod.mech@polytechnic.edu', '+91 98486 77889', 'MECH', 'Head of Department - Mechanical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'hos'),
(8, 'MECH001', 'Prof. K. Suresh', 'suresh.mech@polytechnic.edu', '+91 98487 88990', 'MECH', 'Senior Lecturer in Mechanical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(9, 'MECH002', 'Dr. T. Venkat', 'venkat.mech@polytechnic.edu', '+91 98488 99001', 'MECH', 'Lecturer in Mechanical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(10, 'MECH003', 'Prof. R. Naresh', 'naresh.mech@polytechnic.edu', '+91 98489 00112', 'MECH', 'Assistant Lecturer in Mechanical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(11, 'MECH004', 'Prof. S. Prasad', 'prasad.mech@polytechnic.edu', '+91 98480 22334', 'MECH', 'Assistant Lecturer in Mechanical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),

-- EEE
(12, 'HOD_EEE', 'Dr. B. Suresh Kumar', 'hod.eee@polytechnic.edu', '+91 98481 33445', 'EEE', 'Head of Department - Electrical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'hos'),
(13, 'EEE001', 'Dr. M. Vijay', 'vijay.eee@polytechnic.edu', '+91 98482 44556', 'EEE', 'Senior Lecturer in Electrical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(14, 'EEE002', 'Prof. K. Swathi', 'swathi.eee@polytechnic.edu', '+91 98483 55667', 'EEE', 'Lecturer in Electrical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(15, 'EEE003', 'Prof. P. Naveen', 'naveen.eee@polytechnic.edu', '+91 98484 66778', 'EEE', 'Assistant Lecturer in Electrical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(16, 'EEE004', 'Prof. D. Latha', 'latha.eee@polytechnic.edu', '+91 98485 77889', 'EEE', 'Assistant Lecturer in Electrical', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),

-- ECE
(17, 'HOD_ECE', 'Dr. P. Venkat Rao', 'hod.ece@polytechnic.edu', '+91 98486 88990', 'ECE', 'Head of Department - Electronics', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'hos'),
(18, 'ECE001', 'Dr. G. Sandhya', 'sandhya.ece@polytechnic.edu', '+91 98487 99001', 'ECE', 'Senior Lecturer in Electronics', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(19, 'ECE002', 'Prof. K. Rajesh', 'rajesh.ece@polytechnic.edu', '+91 98488 00112', 'ECE', 'Lecturer in Electronics', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(20, 'ECE003', 'Prof. V. Teja', 'teja.ece@polytechnic.edu', '+91 98489 11223', 'ECE', 'Assistant Lecturer in Electronics', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(21, 'ECE004', 'Prof. S. Bhavani', 'bhavani.ece@polytechnic.edu', '+91 98480 33445', 'ECE', 'Assistant Lecturer in Electronics', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),

-- CIVIL
(22, 'HOD_CIVIL', 'Dr. N. Ramesh Babu', 'hod.civil@polytechnic.edu', '+91 98481 44556', 'CIVIL', 'Head of Department - Civil', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'hos'),
(23, 'CIV001', 'Prof. C. Mahesh', 'mahesh.civil@polytechnic.edu', '+91 98482 55667', 'CIVIL', 'Senior Lecturer in Civil', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(24, 'CIV002', 'Dr. J. Haritha', 'haritha.civil@polytechnic.edu', '+91 98483 66778', 'CIVIL', 'Lecturer in Civil', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(25, 'CIV003', 'Prof. B. Ashok', 'ashok.civil@polytechnic.edu', '+91 98484 77889', 'CIVIL', 'Assistant Lecturer in Civil', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(26, 'CIV004', 'Prof. M. Kalyani', 'kalyani.civil@polytechnic.edu', '+91 98485 88990', 'CIVIL', 'Assistant Lecturer in Civil', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty');

SELECT setval('users_id_seq', 26);

-- 2. Branches (25 Semesters: 5 for each Dept)
INSERT INTO branches (id, department, branch_name, year, section, hos_id) VALUES
-- CSE
(1, 'CSE', 'CSE 1st Year', '1st Year', 'A', 1),
(2, 'CSE', 'CSE 3rd Sem', '3rd Semester', 'A', 1),
(3, 'CSE', 'CSE 4th Sem', '4th Semester', 'A', 1),
(4, 'CSE', 'CSE 5th Sem', '5th Semester', 'A', 1),
(5, 'CSE', 'CSE 6th Sem', '6th Semester', 'A', 1),

-- MECH
(6, 'MECH', 'MECH 1st Year', '1st Year', 'A', 7),
(7, 'MECH', 'MECH 3rd Sem', '3rd Semester', 'A', 7),
(8, 'MECH', 'MECH 4th Sem', '4th Semester', 'A', 7),
(9, 'MECH', 'MECH 5th Sem', '5th Semester', 'A', 7),
(10, 'MECH', 'MECH 6th Sem', '6th Semester', 'A', 7),

-- EEE
(11, 'EEE', 'EEE 1st Year', '1st Year', 'A', 12),
(12, 'EEE', 'EEE 3rd Sem', '3rd Semester', 'A', 12),
(13, 'EEE', 'EEE 4th Sem', '4th Semester', 'A', 12),
(14, 'EEE', 'EEE 5th Sem', '5th Semester', 'A', 12),
(15, 'EEE', 'EEE 6th Sem', '6th Semester', 'A', 12),

-- ECE
(16, 'ECE', 'ECE 1st Year', '1st Year', 'A', 17),
(17, 'ECE', 'ECE 3rd Sem', '3rd Semester', 'A', 17),
(18, 'ECE', 'ECE 4th Sem', '4th Semester', 'A', 17),
(19, 'ECE', 'ECE 5th Sem', '5th Semester', 'A', 17),
(20, 'ECE', 'ECE 6th Sem', '6th Semester', 'A', 17),

-- CIVIL
(21, 'CIVIL', 'CIVIL 1st Year', '1st Year', 'A', 22),
(22, 'CIVIL', 'CIVIL 3rd Sem', '3rd Semester', 'A', 22),
(23, 'CIVIL', 'CIVIL 4th Sem', '4th Semester', 'A', 22),
(24, 'CIVIL', 'CIVIL 5th Sem', '5th Semester', 'A', 22),
(25, 'CIVIL', 'CIVIL 6th Sem', '6th Semester', 'A', 22);

SELECT setval('branches_id_seq', 25);

-- 3. Subjects Table
INSERT INTO subjects (id, subject_code, subject_name, department) VALUES
-- CSE
(101, 'CM-101', 'English & Communication Skills', 'CSE'),
(102, 'CM-102', 'Engineering Mathematics - I', 'CSE'),
(103, 'CM-103', 'Engineering Physics', 'CSE'),
(104, 'CM-104', 'Engineering Chemistry', 'CSE'),
(105, 'CM-105', 'Computer Fundamentals & C Programming', 'CSE'),
(106, 'CM-106', 'Programming in C Lab', 'CSE'),
(301, 'CM-301', 'Engineering Mathematics - II', 'CSE'),
(302, 'CM-302', 'Data Structures through C', 'CSE'),
(303, 'CM-303', 'Digital Electronics & Architecture', 'CSE'),
(304, 'CM-304', 'Database Management Systems (DBMS)', 'CSE'),
(305, 'CM-305', 'Data Structures Lab', 'CSE'),
(306, 'CM-306', 'DBMS & SQL Lab', 'CSE'),
(401, 'CM-401', 'Operating Systems & Linux', 'CSE'),
(402, 'CM-402', 'Object Oriented Programming through Java', 'CSE'),
(403, 'CM-403', 'Computer Networks & Security', 'CSE'),
(404, 'CM-404', 'Web Technologies (HTML, CSS, JS)', 'CSE'),
(405, 'CM-405', 'Java Programming Lab', 'CSE'),
(406, 'CM-406', 'Web Development Lab', 'CSE'),
(501, 'CS-501', 'Industrial Management & Entrepreneurship (IME)', 'CSE'),
(502, 'CS-502', 'Advanced Java & Web Technologies (AJWT)', 'CSE'),
(503, 'CS-503', 'Cloud Computing & Virtualization (CCV)', 'CSE'),
(504, 'CS-504', 'Python Programming & Data Science (PPDS)', 'CSE'),
(505, 'CS-505', 'Computer Hardware & Networking Lab', 'CSE'),
(506, 'CS-506', '5th Sem Major Project Work', 'CSE'),
(601, 'CS-601', 'Mobile Application Development', 'CSE'),
(602, 'CS-602', 'Software Engineering & Agile', 'CSE'),
(603, 'CS-603', 'Information Security & Forensics', 'CSE'),
(604, 'CS-604', 'AI & Machine Learning', 'CSE'),
(605, 'CS-605', 'Mobile App Development Lab', 'CSE'),
(606, 'CS-606', 'Final Capstone Project', 'CSE'),

-- MECH
(701, 'M-101', 'Basic Mechanical Engineering', 'MECH'),
(702, 'M-102', 'Engineering Drawing & Graphics', 'MECH'),
(703, 'M-301', 'Thermodynamics & Heat Engines', 'MECH'),
(704, 'M-302', 'Manufacturing Technology - I', 'MECH'),
(705, 'M-401', 'Fluid Mechanics & Hydraulic Machinery', 'MECH'),
(706, 'M-402', 'Strength of Materials', 'MECH'),
(707, 'M-501', 'Design of Machine Elements (DME)', 'MECH'),
(708, 'M-502', 'Thermal Engineering & Power Plants', 'MECH'),
(709, 'M-503', 'CAD/CAM & CNC Automation', 'MECH'),
(710, 'M-504', 'Refrigeration & Air Conditioning', 'MECH'),
(711, 'M-505', 'Thermal Engg Lab', 'MECH'),
(712, 'M-506', 'CAD/CAM Lab & Project', 'MECH'),
(713, 'M-601', 'Industrial Engineering & QC', 'MECH'),
(714, 'M-602', 'Robotics & Automation', 'MECH'),

-- EEE
(801, 'EE-101', 'Basic Electrical Engineering', 'EEE'),
(802, 'EE-301', 'Electrical Circuits & Networks', 'EEE'),
(803, 'EE-302', 'DC Machines & Transformers', 'EEE'),
(804, 'EE-401', 'AC Machines & Generators', 'EEE'),
(805, 'EE-402', 'Electrical Measurements', 'EEE'),
(806, 'EE-501', 'Power Systems Generation & Transmission', 'EEE'),
(807, 'EE-502', 'Power Electronics & Drives', 'EEE'),
(808, 'EE-503', 'Microcontrollers & PLC', 'EEE'),
(809, 'EE-504', 'Renewable Energy Sources', 'EEE'),
(810, 'EE-505', 'Power Electronics Lab', 'EEE'),
(811, 'EE-506', 'Electrical Simulation Lab', 'EEE'),
(812, 'EE-601', 'Switchgear & Protection', 'EEE'),
(813, 'EE-602', 'Electric Vehicles & Smart Grid', 'EEE'),

-- ECE
(901, 'EC-101', 'Basic Electronics Engineering', 'ECE'),
(902, 'EC-301', 'Electronic Devices & Circuits', 'ECE'),
(903, 'EC-302', 'Analog & Digital Communication', 'ECE'),
(904, 'EC-401', 'Linear Integrated Circuits & Op-Amps', 'ECE'),
(905, 'EC-402', 'Microprocessors & Interfacing', 'ECE'),
(906, 'EC-501', 'Embedded Systems & IoT', 'ECE'),
(907, 'EC-502', 'VLSI Design & Verilog', 'ECE'),
(908, 'EC-503', 'Microwave & Optical Comm', 'ECE'),
(909, 'EC-504', 'Digital Signal Processing (DSP)', 'ECE'),
(910, 'EC-505', 'Embedded & IoT Lab', 'ECE'),
(911, 'EC-506', 'VLSI Simulation & Project', 'ECE'),
(912, 'EC-601', 'Wireless & 5G Communications', 'ECE'),
(913, 'EC-602', 'Automotive Electronics', 'ECE'),

-- CIVIL
(1001, 'CE-101', 'Surveying & Levelling - I', 'CIVIL'),
(1002, 'CE-301', 'Building Materials & Construction', 'CIVIL'),
(1003, 'CE-302', 'Mechanics of Structures', 'CIVIL'),
(1004, 'CE-401', 'Hydraulics & Water Resources', 'CIVIL'),
(1005, 'CE-402', 'Advanced Surveying & GIS', 'CIVIL'),
(1006, 'CE-501', 'Reinforced Concrete Structures (RCC)', 'CIVIL'),
(1007, 'CE-502', 'Geotechnical & Soil Mechanics', 'CIVIL'),
(1008, 'CE-503', 'Transportation & Highway Engg', 'CIVIL'),
(1009, 'CE-504', 'Environmental Engineering', 'CIVIL'),
(1010, 'CE-505', 'Civil CAD & Drafting Lab', 'CIVIL'),
(1011, 'CE-506', 'Material Testing Lab', 'CIVIL'),
(1012, 'CE-601', 'Construction Planning & Estimation', 'CIVIL'),
(1013, 'CE-602', 'Steel Structural Design', 'CIVIL');

SELECT setval('subjects_id_seq', 1013);

-- 4. Seed Exam Invigilations for all 5 departments
INSERT INTO exam_invigilation (id, department, exam_name, exam_date, session, hall_no, faculty_id, photo_url, notes) VALUES
(1, 'CSE', 'State Board Diploma Mid-I Examination', '2026-09-28', 'Morning (08:00 - 10:15)', 'Drawing Hall-1 (Main Block)', 3, '/uploads/invigilation_sample.png', 'Chief Invigilator - Dr. S. Anitha'),
(2, 'CSE', 'Board Practical Examination (CHN & Hardware Lab)', '2026-09-29', 'Midday (10:30 - 01:30)', 'Hardware & Networking Lab', 5, '/uploads/invigilation_sample.png', 'Internal Examiner - Prof. P. Priya'),
(3, 'MECH', 'Mechanical Engineering CAD & Thermal Lab Exam', '2026-09-28', 'Morning (08:00 - 10:15)', 'CAD/CAM Lab & Workshop', 9, '/uploads/invigilation_sample.png', 'Examiner - Dr. T. Venkat'),
(4, 'EEE', 'Electrical Machines & Simulation Practical Exam', '2026-09-29', 'Morning (08:00 - 10:15)', 'Machines Lab Block-B', 14, '/uploads/invigilation_sample.png', 'Invigilator - Prof. K. Swathi'),
(5, 'ECE', 'VLSI & IoT System Design Mid-Term Exam', '2026-09-28', 'Midday (10:30 - 01:30)', 'DSP & IoT Hall-3', 19, '/uploads/invigilation_sample.png', 'Invigilator - Prof. K. Rajesh'),
(6, 'CIVIL', 'Surveying & Structural Engineering Exam', '2026-09-30', 'Morning (08:00 - 10:15)', 'Civil Drawing Hall-2', 24, '/uploads/invigilation_sample.png', 'Invigilator - Dr. J. Haritha');

SELECT setval('exam_invigilation_id_seq', 6);
