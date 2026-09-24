-- ==========================================================
-- F.A.S.T (Faculty Alternative Substitute Tracker)
-- Computer Science & Engineering (CSE) Department Schema
-- ==========================================================

-- Drop existing tables in correct dependency order
DROP TABLE IF EXISTS substitutions CASCADE;
DROP TABLE IF EXISTS exam_invigilation CASCADE;
DROP TABLE IF EXISTS faculty_personal_schedule CASCADE;
DROP TABLE IF EXISTS timetable CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users Table (CSE Faculty & HOD)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    faculty_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'CSE',
    designation TEXT DEFAULT 'Lecturer',
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('hos', 'faculty')) NOT NULL
);

-- 2. Branches / CSE Semesters (1st Year, 3rd Sem, 4th Sem, 5th Sem, 6th Sem)
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    department TEXT NOT NULL DEFAULT 'CSE',
    branch_name TEXT NOT NULL,
    year TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    hos_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Subjects Table (CSE Curriculum across all semesters)
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    subject_code TEXT UNIQUE NOT NULL,
    subject_name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'CSE'
);

-- 4. Official Master Timetable (Periods 1 to 7)
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

-- 5. Exam Invigilation Table (Photos/PDFs + Assigned Halls & Faculty)
CREATE TABLE exam_invigilation (
    id SERIAL PRIMARY KEY,
    department TEXT DEFAULT 'CSE',
    exam_name TEXT NOT NULL,
    exam_date TEXT NOT NULL, -- Format: YYYY-MM-DD
    session TEXT NOT NULL,   -- e.g. 'Morning (08:00 - 10:15)', 'Midday (10:30 - 01:30)'
    hall_no TEXT NOT NULL,
    faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Faculty Personal Timetable Table (Uploaded & Synced in background)
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

-- 1. CSE Faculty Members & HOD (Default Pass: password123)
INSERT INTO users (id, faculty_id, full_name, email, phone, department, designation, password_hash, role) VALUES
(1, 'HOD_CSE', 'Dr. K. Smitha', 'hod.cse@polytechnic.edu', '+91 98480 11223', 'CSE', 'Head of Department & Senior Lecturer', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'hos'),
(2, 'FAC001', 'Dr. V. Ravi Kumar', 'ravi.cse@polytechnic.edu', '+91 98481 22334', 'CSE', 'Senior Lecturer in Computer Engg', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(3, 'FAC002', 'Dr. S. Anitha', 'anitha.cse@polytechnic.edu', '+91 98482 33445', 'CSE', 'Lecturer in Computer Engg', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(4, 'FAC003', 'Prof. M. Kiran', 'kiran.cse@polytechnic.edu', '+91 98483 44556', 'CSE', 'Assistant Lecturer in CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(5, 'FAC004', 'Prof. P. Priya', 'priya.cse@polytechnic.edu', '+91 98484 55667', 'CSE', 'Assistant Lecturer in CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
(6, 'FAC005', 'Prof. G. Ramesh', 'ramesh.cse@polytechnic.edu', '+91 98485 66778', 'CSE', 'Assistant Lecturer in CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty');

SELECT setval('users_id_seq', 6);

-- 2. Clean CSE Semesters (No regulation tags)
INSERT INTO branches (id, department, branch_name, year, section, hos_id) VALUES
(1, 'CSE', 'CSE 1st Year', '1st Year', 'A', 1),
(2, 'CSE', 'CSE 3rd Sem', '3rd Semester', 'A', 1),
(3, 'CSE', 'CSE 4th Sem', '4th Semester', 'A', 1),
(4, 'CSE', 'CSE 5th Sem', '5th Semester', 'A', 1),
(5, 'CSE', 'CSE 6th Sem', '6th Semester', 'A', 1);

SELECT setval('branches_id_seq', 5);

-- 3. CSE Curriculum Subjects
INSERT INTO subjects (id, subject_code, subject_name, department) VALUES
-- 1st Year Subjects
(101, 'CM-101', 'English & Communication Skills', 'CSE'),
(102, 'CM-102', 'Engineering Mathematics - I', 'CSE'),
(103, 'CM-103', 'Engineering Physics', 'CSE'),
(104, 'CM-104', 'Engineering Chemistry', 'CSE'),
(105, 'CM-105', 'Computer Fundamentals & C Programming', 'CSE'),
(106, 'CM-106', 'Programming in C Lab', 'CSE'),

-- 3rd Sem Subjects
(301, 'CM-301', 'Engineering Mathematics - II', 'CSE'),
(302, 'CM-302', 'Data Structures through C', 'CSE'),
(303, 'CM-303', 'Digital Electronics & Computer Architecture', 'CSE'),
(304, 'CM-304', 'Database Management Systems (DBMS)', 'CSE'),
(305, 'CM-305', 'Data Structures Lab', 'CSE'),
(306, 'CM-306', 'DBMS & SQL Lab', 'CSE'),

-- 4th Sem Subjects
(401, 'CM-401', 'Operating Systems & Linux', 'CSE'),
(402, 'CM-402', 'Object Oriented Programming through Java', 'CSE'),
(403, 'CM-403', 'Computer Networks & Security', 'CSE'),
(404, 'CM-404', 'Web Technologies (HTML, CSS, JS)', 'CSE'),
(405, 'CM-405', 'Java Programming Lab', 'CSE'),
(406, 'CM-406', 'Web Development Lab', 'CSE'),

-- 5th Sem Subjects
(501, 'CS-501', 'Industrial Management & Entrepreneurship (IME)', 'CSE'),
(502, 'CS-502', 'Advanced Java & Web Technologies (AJWT)', 'CSE'),
(503, 'CS-503', 'Cloud Computing & Virtualization (CCV)', 'CSE'),
(504, 'CS-504', 'Python Programming & Data Science (PPDS)', 'CSE'),
(505, 'CS-505', 'Computer Hardware & Networking Lab (CHN Lab)', 'CSE'),
(506, 'CS-506', '5th Sem Major Project Work (MPW)', 'CSE'),

-- 6th Sem Subjects
(601, 'CS-601', 'Mobile Application Development (Android/Flutter)', 'CSE'),
(602, 'CS-602', 'Software Engineering & Agile Methodologies', 'CSE'),
(603, 'CS-603', 'Information Security & Cyber Forensics', 'CSE'),
(604, 'CS-604', 'AI & Machine Learning Essentials', 'CSE'),
(605, 'CS-605', 'Mobile App Development Lab', 'CSE'),
(606, 'CS-606', 'Final Capstone Project & Viva', 'CSE');

SELECT setval('subjects_id_seq', 606);

-- 4. MASTER TIMETABLES (PERIODS 1 TO 7)

-- ================= TIMETABLE: CSE 5th Sem (Branch ID 4) =================
INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) VALUES
-- Monday
(4, 'Monday', 1, '08:00', '08:45', 502, 2, 'Lab-2 (Software)'),  -- AJWT - Dr. Ravi
(4, 'Monday', 2, '08:45', '09:30', 504, 5, 'LH-101'),             -- PPDS - Prof. Priya
(4, 'Monday', 3, '09:30', '10:15', 503, 4, 'LH-101'),             -- CCV - Prof. Kiran
(4, 'Monday', 4, '10:30', '11:15', 501, 3, 'LH-101'),             -- IME - Dr. Anitha
(4, 'Monday', 5, '11:15', '12:00', 505, 6, 'Hardware Lab'),       -- CHN Lab - Prof. Ramesh
(4, 'Monday', 6, '12:00', '12:45', 506, 2, 'Project Lab'),        -- MPW - Dr. Ravi
(4, 'Monday', 7, '12:45', '01:30', 506, 2, 'Project Lab'),        -- MPW - Dr. Ravi

-- Tuesday
(4, 'Tuesday', 1, '08:00', '08:45', 501, 3, 'LH-101'),            -- IME - Dr. Anitha
(4, 'Tuesday', 2, '08:45', '09:30', 502, 2, 'LH-101'),            -- AJWT - Dr. Ravi
(4, 'Tuesday', 3, '09:30', '10:15', 504, 5, 'LH-101'),            -- PPDS - Prof. Priya
(4, 'Tuesday', 4, '10:30', '11:15', 503, 4, 'LH-101'),            -- CCV - Prof. Kiran
(4, 'Tuesday', 5, '11:15', '12:00', 506, 6, 'Project Lab'),       -- MPW - Prof. Ramesh
(4, 'Tuesday', 6, '12:00', '12:45', 505, 5, 'Hardware Lab'),       -- CHN Lab - Prof. Priya
(4, 'Tuesday', 7, '12:45', '01:30', 502, 2, 'LH-101'),            -- AJWT - Dr. Ravi

-- Wednesday
(4, 'Wednesday', 1, '08:00', '08:45', 503, 4, 'LH-101'),          -- CCV - Prof. Kiran
(4, 'Wednesday', 2, '08:45', '09:30', 501, 3, 'LH-101'),          -- IME - Dr. Anitha
(4, 'Wednesday', 3, '09:30', '10:15', 502, 2, 'LH-101'),          -- AJWT - Dr. Ravi
(4, 'Wednesday', 4, '10:30', '11:15', 504, 5, 'Lab-2'),            -- PPDS Lab - Prof. Priya
(4, 'Wednesday', 5, '11:15', '12:00', 504, 5, 'Lab-2'),            -- PPDS Lab - Prof. Priya
(4, 'Wednesday', 6, '12:00', '12:45', 506, 6, 'Project Lab'),      -- MPW - Prof. Ramesh
(4, 'Wednesday', 7, '12:45', '01:30', 506, 6, 'Project Lab'),      -- MPW - Prof. Ramesh

-- Thursday
(4, 'Thursday', 1, '08:00', '08:45', 504, 5, 'LH-101'),           -- PPDS - Prof. Priya
(4, 'Thursday', 2, '08:45', '09:30', 503, 4, 'LH-101'),           -- CCV - Prof. Kiran
(4, 'Thursday', 3, '09:30', '10:15', 501, 3, 'LH-101'),           -- IME - Dr. Anitha
(4, 'Thursday', 4, '10:30', '11:15', 502, 2, 'Lab-2'),            -- AJWT Lab - Dr. Ravi
(4, 'Thursday', 5, '11:15', '12:00', 502, 2, 'Lab-2'),            -- AJWT Lab - Dr. Ravi
(4, 'Thursday', 6, '12:00', '12:45', 505, 6, 'Hardware Lab'),      -- CHN Lab - Prof. Ramesh
(4, 'Thursday', 7, '12:45', '01:30', 503, 4, 'LH-101'),           -- CCV - Prof. Kiran

-- Friday
(4, 'Friday', 1, '08:00', '08:45', 502, 2, 'LH-101'),             -- AJWT - Dr. Ravi
(4, 'Friday', 2, '08:45', '09:30', 504, 5, 'LH-101'),             -- PPDS - Prof. Priya
(4, 'Friday', 3, '09:30', '10:15', 503, 4, 'LH-101'),             -- CCV - Prof. Kiran
(4, 'Friday', 4, '10:30', '11:15', 501, 3, 'LH-101'),             -- IME - Dr. Anitha
(4, 'Friday', 5, '11:15', '12:00', 506, 6, 'Project Lab'),        -- MPW - Prof. Ramesh
(4, 'Friday', 6, '12:00', '12:45', 506, 6, 'Project Lab'),        -- MPW - Prof. Ramesh
(4, 'Friday', 7, '12:45', '01:30', 501, 3, 'LH-101'),             -- IME - Dr. Anitha

-- Saturday
(4, 'Saturday', 1, '08:00', '08:45', 501, 3, 'LH-101'),           -- IME - Dr. Anitha
(4, 'Saturday', 2, '08:45', '09:30', 502, 2, 'LH-101'),           -- AJWT - Dr. Ravi
(4, 'Saturday', 3, '09:30', '10:15', 504, 5, 'LH-101'),           -- PPDS - Prof. Priya
(4, 'Saturday', 4, '10:30', '11:15', 503, 4, 'LH-101'),           -- CCV - Prof. Kiran
(4, 'Saturday', 5, '11:15', '12:00', 505, 6, 'Hardware Lab'),      -- CHN Lab - Prof. Ramesh
(4, 'Saturday', 6, '12:00', '12:45', 506, 2, 'Project Lab');       -- MPW - Dr. Ravi

-- ================= TIMETABLE: CSE 1st Year (Branch ID 1) =================
INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) VALUES
(1, 'Monday', 1, '09:30', '10:30', 105, 6, 'Room 101'),
(1, 'Monday', 2, '10:30', '11:30', 101, 3, 'Room 101'),
(1, 'Monday', 3, '11:30', '12:30', 102, 4, 'Room 101'),
(1, 'Monday', 4, '12:30', '01:30', 106, 6, 'C Lab'),
(1, 'Monday', 5, '01:30', '02:30', 106, 6, 'C Lab'),
(1, 'Tuesday', 1, '09:30', '10:30', 102, 4, 'Room 101'),
(1, 'Tuesday', 2, '10:30', '11:30', 105, 6, 'Room 101'),
(1, 'Tuesday', 3, '11:30', '12:30', 103, 5, 'Physics Lab'),
(1, 'Wednesday', 1, '09:30', '10:30', 101, 3, 'Room 101'),
(1, 'Wednesday', 2, '10:30', '11:30', 102, 4, 'Room 101'),
(1, 'Wednesday', 3, '11:30', '12:30', 105, 6, 'Room 101'),
(1, 'Thursday', 1, '09:30', '10:30', 103, 5, 'Room 101'),
(1, 'Thursday', 2, '10:30', '11:30', 104, 3, 'Room 101'),
(1, 'Friday', 1, '09:30', '10:30', 105, 6, 'Room 101'),
(1, 'Friday', 2, '10:30', '11:30', 102, 4, 'Room 101');

-- ================= TIMETABLE: CSE 3rd Sem (Branch ID 2) =================
INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) VALUES
(2, 'Monday', 1, '09:30', '10:30', 304, 3, 'LH-201'),
(2, 'Monday', 2, '10:30', '11:30', 302, 4, 'LH-201'),
(2, 'Monday', 3, '11:30', '12:30', 303, 2, 'LH-201'),
(2, 'Monday', 4, '12:30', '01:30', 306, 3, 'DBMS Lab'),
(2, 'Monday', 5, '01:30', '02:30', 306, 3, 'DBMS Lab'),
(2, 'Tuesday', 1, '09:30', '10:30', 302, 4, 'LH-201'),
(2, 'Tuesday', 2, '10:30', '11:30', 304, 3, 'LH-201'),
(2, 'Tuesday', 3, '11:30', '12:30', 301, 2, 'LH-201'),
(2, 'Wednesday', 1, '09:30', '10:30', 303, 2, 'LH-201'),
(2, 'Wednesday', 2, '10:30', '11:30', 302, 4, 'LH-201'),
(2, 'Thursday', 1, '09:30', '10:30', 304, 3, 'LH-201'),
(2, 'Thursday', 2, '10:30', '11:30', 305, 4, 'DS Lab'),
(2, 'Friday', 1, '09:30', '10:30', 302, 4, 'LH-201'),
(2, 'Friday', 2, '10:30', '11:30', 304, 3, 'LH-201');

-- ================= TIMETABLE: CSE 4th Sem (Branch ID 3) =================
INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) VALUES
(3, 'Monday', 1, '09:30', '10:30', 402, 5, 'LH-301'),
(3, 'Monday', 2, '10:30', '11:30', 401, 2, 'LH-301'),
(3, 'Monday', 3, '11:30', '12:30', 403, 6, 'LH-301'),
(3, 'Tuesday', 1, '09:30', '10:30', 404, 4, 'LH-301'),
(3, 'Tuesday', 2, '10:30', '11:30', 402, 5, 'LH-301'),
(3, 'Wednesday', 1, '09:30', '10:30', 401, 2, 'LH-301'),
(3, 'Wednesday', 2, '10:30', '11:30', 403, 6, 'LH-301'),
(3, 'Thursday', 1, '09:30', '10:30', 402, 5, 'LH-301'),
(3, 'Thursday', 2, '10:30', '11:30', 405, 5, 'Java Lab'),
(3, 'Friday', 1, '09:30', '10:30', 404, 4, 'LH-301'),
(3, 'Friday', 2, '10:30', '11:30', 406, 4, 'Web Lab');

-- ================= TIMETABLE: CSE 6th Sem (Branch ID 5) =================
INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) VALUES
(5, 'Monday', 1, '09:30', '10:30', 601, 4, 'LH-401'),
(5, 'Monday', 2, '10:30', '11:30', 602, 3, 'LH-401'),
(5, 'Monday', 3, '11:30', '12:30', 603, 2, 'LH-401'),
(5, 'Monday', 4, '12:30', '01:30', 605, 4, 'App Lab'),
(5, 'Tuesday', 1, '09:30', '10:30', 604, 5, 'LH-401'),
(5, 'Tuesday', 2, '10:30', '11:30', 601, 4, 'LH-401'),
(5, 'Wednesday', 1, '09:30', '10:30', 602, 3, 'LH-401'),
(5, 'Wednesday', 2, '10:30', '11:30', 604, 5, 'LH-401'),
(5, 'Thursday', 1, '09:30', '10:30', 603, 2, 'LH-401'),
(5, 'Thursday', 2, '10:30', '11:30', 606, 6, 'Project Hall'),
(5, 'Friday', 1, '09:30', '10:30', 601, 4, 'LH-401'),
(5, 'Friday', 2, '10:30', '11:30', 606, 6, 'Project Hall');

-- 5. Exam Invigilation Schedule
INSERT INTO exam_invigilation (id, department, exam_name, exam_date, session, hall_no, faculty_id, photo_url, notes) VALUES
(1, 'CSE', 'State Board Diploma Mid-I Examination', '2026-09-28', 'Morning (08:00 - 10:15)', 'Drawing Hall-1 (Main Block)', 3, '/uploads/invigilation_sample.png', 'Chief Invigilator - Dr. S. Anitha'),
(2, 'CSE', 'Board Practical Examination (CHN & Hardware Lab)', '2026-09-29', 'Midday (10:30 - 01:30)', 'Hardware & Networking Lab', 5, '/uploads/invigilation_sample.png', 'Internal Examiner - Prof. P. Priya'),
(3, 'CSE', 'Semester End Theory Examination', '2026-10-05', 'Morning (08:00 - 10:15)', 'LH-101 & LH-102', 2, '/uploads/invigilation_sample.png', 'Superintendent - Dr. V. Ravi Kumar');

SELECT setval('exam_invigilation_id_seq', 3);

-- 6. Initial Faculty Personal Timetables (Stored in DB in Background for all 7 periods)
INSERT INTO faculty_personal_schedule (faculty_id, day, period, status, notes) VALUES
(2, 'Monday', 2, 'free', 'Free Slot (Personal Schedule Free)'),
(2, 'Monday', 3, 'free', 'Drawn Line (---) Free'),
(2, 'Monday', 4, 'free', 'Free Slot (Empty Box)'),
(2, 'Monday', 5, 'free', 'Free Slot (Line Drawn /)'),
(3, 'Monday', 1, 'free', 'Free Period (Drawn Line ---)'),
(3, 'Monday', 2, 'free', 'Free Slot (Empty Box)'),
(3, 'Monday', 3, 'free', 'Free Slot (NIL Line)'),
(3, 'Monday', 5, 'free', 'Free Slot (Empty Box)'),
(3, 'Monday', 6, 'free', 'Free Slot (---)'),
(4, 'Monday', 1, 'free', 'Free Slot (Empty Box)'),
(4, 'Monday', 2, 'free', 'Free Slot (Line Drawn ---)'),
(4, 'Monday', 4, 'free', 'Free Slot (Empty Box)'),
(4, 'Monday', 5, 'free', 'Free Slot (---)'),
(5, 'Monday', 3, 'free', 'Free Slot (Empty Box)'),
(5, 'Monday', 4, 'free', 'Free Slot (Empty Box)'),
(5, 'Monday', 5, 'free', 'Free Slot (---)'),
(6, 'Monday', 1, 'free', 'Free Slot (Line Drawn ---)'),
(6, 'Monday', 2, 'free', 'Free Slot (Empty Box)'),
(6, 'Monday', 3, 'free', 'Free Slot (Empty Box)'),
(6, 'Monday', 4, 'free', 'Free Slot (---)');
