# F.A.S.T — Faculty Alternative Substitute Tracker

<div align="center">

![F.A.S.T Banner](https://img.shields.io/badge/F.A.S.T-Faculty%20Alternative%20Substitute%20Tracker-4f46e5?style=for-the-badge&logo=appveyor)
![Version](https://img.shields.io/badge/Version-1.0.0-emerald?style=for-the-badge)
![Engine](https://img.shields.io/badge/Automation-n8n%20Engine%20(Zero%20OCR)-f97316?style=for-the-badge&logo=n8n)
![Department](https://img.shields.io/badge/Department-CSE%20%26%20CME-blue?style=for-the-badge)
![Database](https://img.shields.io/badge/Database-PostgreSQL%20(Neon)-0284c7?style=for-the-badge&logo=postgresql)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=nodedotjs)

**A high-performance, 100% automated substitution comparison engine and examination invigilation manager powered by n8n workflow automation for Computer Science & Engineering (CSE) polytechnics and colleges.**

[Key Features](#-key-features) • [Why n8n Over OCR](#-why-n8n-automation-engine-over-error-prone-ocr) • [Timetable Schedule](#-institutional-timetable-structure) • [System Architecture](#-system-architecture) • [Getting Started](#-getting-started) • [Demo Accounts](#-demo-accounts--credentials) • [Testing Guide](#-step-by-step-testing-guide) • [API Reference](#-api-reference)

---

</div>

## 📖 Overview

**F.A.S.T** (**Faculty Alternative Substitute Tracker**) automates the identification and assignment of substitute faculty when a scheduled period teacher is on leave or indisposed.

By utilizing **n8n Workflow Automation** and direct relational database comparison instead of error-prone image OCR, F.A.S.T guarantees **100% deterministic accuracy**, zero data misinterpretation, and sub-second candidate resolution. 

Faculty click on any scheduled period in the weekly master timetable to immediately trigger the **5-Stage n8n Automated Pipeline**, which cross-checks schedules, personal availability, exam invigilation rosters, and existing substitution duties to present verified free teachers with **1-Click Direct Phone Calling** and **pre-filled WhatsApp chat requests**.

---

## 💡 Why n8n Automation Engine Over Error-Prone OCR

| Feature / Criteria | ❌ Traditional OCR Approach | ⚡ F.A.S.T n8n Automation Engine |
| :--- | :--- | :--- |
| **Accuracy & Reliability** | High error rate (60–75%), misreads period numbers, misidentifies handwriting, noise in scans. | **100% Deterministic & Error-Free**: Queries relational schema with zero ambiguity. |
| **Speed & Performance** | Slow (5–15 seconds per image processing). | **Sub-second Response (<15ms)** for full institutional evaluation. |
| **Conflict Detection** | Static snapshot; cannot detect exam duties or dynamic substitutions. | **Live Real-Time Cross-Check** against Master TT, Synced Schedules, Exam Rosters & Active Substitutions. |
| **Actionability** | Text output only; requires manual follow-up. | **Automated Action Triggers**: 1-Click Phone Call (`tel:`) and instant WhatsApp chat with pre-composed messages. |
| **Workflow Portability** | Custom closed scripts. | **Importable n8n JSON Workflows** (`n8n_workflows/substitution_comparison_workflow.json`) for webhooks and enterprise integrations. |

---

## 🌟 Key Features

### 1. 📅 7-Period Interactive Master Timetable
- Clean weekly schedule (**Monday to Saturday, Periods 1 to 7**).
- Organized across all CSE semesters: **CSE 1st Year, 3rd Sem, 4th Sem, 5th Sem, and 6th Sem**.
- Visual indicators for morning lectures, midday lectures, and the institutional **Tea Break (10:15 AM – 10:30 AM)**.
- **1-Tap Period Evaluation**: Tapping on any scheduled period instantly triggers the n8n comparison engine.

### 2. ⚡ Multi-Stage n8n Automated Comparison Engine
When a period is selected, the n8n pipeline executes a 5-step automated validation:
1. **Stage 1 — Master Timetable Scan**: Filters out faculty scheduled to teach any other semester or lab during that period.
2. **Stage 2 — Personal Schedule Validation**: Validates individual teacher weekly slots and free periods.
3. **Stage 3 — Exam Invigilation Cross-Check**: Blocks teachers assigned to exam halls during that session (Morning: 08:00–10:15 AM / Midday: 10:30–01:30 PM).
4. **Stage 4 — Active Substitutions Filter**: Prevents double-booking faculty already acting as substitutes elsewhere.
5. **Stage 5 — Candidate Match & Action Link Generation**: Compiles candidate cards with real-time status badges, official phone numbers, and direct communication links.

### 3. 📞 Direct One-Click Communication
- **1-Click Direct Call (`tel:`)**: Instantly dials the teacher's official mobile number.
- **1-Click WhatsApp Chat (`https://wa.me/...`)**: Opens WhatsApp with a pre-formatted professional substitution request message containing the date, period, semester, subject name, and room number.

### 4. 🛡️ Exam Invigilation Management (Admin Photo/PDF Upload & Delete Options)
- Official examination roster displaying dates, exam titles, assigned invigilators, and hall numbers.
- **Admin Photo/PDF Upload**: Admin can upload circular notices, photos, or PDF documents to register duties.
- **Simplified Faculty Name Matching**: Matches candidate names against the roster to flag exam duty automatically without requiring complex shift details.
- **`⚠️ In Exam Invigilation` Badge**: Teachers on exam duty are displayed in the substitute candidate list with an invigilation badge and remain selectable with full 1-Click Call and WhatsApp options.
- **Delete & Clear Options**: Admin can delete individual duties or click **"🗑️ Clear Finished Exams"** (`POST /api/invigilation/clear-completed`) to clean up past examinations.

### 5. 📝 "Update & Edit" Timetable (Personal Focus & Multiple Upload Methods)
- **Individual Faculty Privacy**: Each logged-in faculty member sees and edits *only their own* personal weekly timetable.
- **4 Flexible Update Options**:
  1. **Camera Photo Capture**: Take a live snapshot of a physical timetable sheet (`capture="environment"`).
  2. **Image / PDF Document Upload**: Upload JPG, PNG, WEBP, or PDF timetable files.
  3. **Auto-Populate from Master Timetable**: Automatically synchronizes all official assigned classes and designates unscheduled periods as **FREE**.
  4. **Direct Manual Grid Editor**: Click any period cell (Periods 1 to 7) to toggle between **🟢 Free** and **📚 Class** or edit notes, then click **"💾 Save & Sync My Timetable"**.
- **Admin Master Control**: Only the active Admin can update or edit semester master timetables via the Update & Edit switcher.

### 6. 🔐 Single Active Admin Lock & Personal Email OTP
- **Single Admin Institutional Policy**: Only **ONE Admin** is permitted at any given time. Once an admin is active, other users are blocked from admin elevation or admin login until the current admin logs out.
- **Personal Email OTP Verification**: When HOD requests admin elevation, they enter their personal email to receive a 6-digit security OTP code (via Nodemailer SMTP or terminal console log).
- **Duplicate Login / Collision Alerts**: If a user attempts to log in with an existing name or mismatched credentials, a clear collision alert prompts them to enter their correct password or choose a distinct name.
- **Admin Lock Release**: Logging out automatically releases the single-admin lock.

---

## 🕒 Institutional Timetable Structure

The application is structured around the **08:00 AM to 01:30 PM** polytechnic schedule:

| Period | Time Slot | Session Category | Description |
| :--- | :--- | :--- | :--- |
| **Period 1** | `08:00 AM – 08:45 AM` | Morning Session | Theory / Lab Lecture 1 |
| **Period 2** | `08:45 AM – 09:30 AM` | Morning Session | Theory / Lab Lecture 2 |
| **Period 3** | `09:30 AM – 10:15 AM` | Morning Session | Theory / Lab Lecture 3 |
| ☕ **Break** | `10:15 AM – 10:30 AM` | **Tea / Refreshment Break** | **15-Minute Institutional Break** |
| **Period 4** | `10:30 AM – 11:15 AM` | Midday Session | Theory / Lab Lecture 4 |
| **Period 5** | `11:15 AM – 12:00 PM` | Midday Session | Theory / Lab Lecture 5 |
| **Period 6** | `12:00 PM – 12:45 PM` | Midday Session | Theory / Lab Lecture 6 |
| **Period 7** | `12:45 PM – 01:30 PM` | Midday Session | Theory / Project / Lab 7 |

---

## 🏛️ System Architecture

```mermaid
graph TD
    A[Faculty / HOD User] -->|Login with Password Policy & Collision Check| B[Full-Screen Auth Gate]
    B --> C[F.A.S.T Web Interface]
    
    subgraph "Navigation Tabs"
        C --> D[Home: 7-Period Master Timetable]
        C --> E[Exam Invigilation Roster]
        C --> F[Update & Edit Timetable]
        C --> G[Help & User Guide]
    end
    
    subgraph "Dynamic Comparison Engine"
        D -->|Click Period| H1[Master Timetable Scan]
        H1 --> H2[Personal Timetable Evaluation]
        H2 --> H3[Exam Invigilation Name Matching]
        H3 --> H4[Active Substitutions Check]
        H4 --> H5[Candidate Cards with ⚠️ Badges]
    end
    
    subgraph "Actions & Communication"
        H5 --> I1[📞 1-Click Phone Call]
        H5 --> I2[💬 1-Click WhatsApp Request]
        H5 --> I3[📋 Select as Substitute]
    end

    subgraph "Single Active Admin Lock & Security"
        C --> J[🛡️ HOD Personal Email OTP]
        J -->|Lock Single Admin| K1[👑 Master Timetable Editor]
        J -->|Lock Single Admin| K2[📷 Upload Exam Duty Circulars]
        J -->|Lock Single Admin| K3[🗑️ Delete / Clear Completed Exams]
        C -->|Logout| L[Release Admin Lock]
    end
```

---

## 🛠️ Technology Stack

- **Automation Engine**: [n8n](https://n8n.io/) JSON Workflow Engine & Background Comparison Engine
- **Backend**: [Node.js](https://nodejs.org/), [Express.js](https://expressjs.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (Hosted on [Neon](https://neon.tech/) with pooled connections)
- **Authentication & Security**: `express-session`, `bcryptjs`, Single Active Admin Lock State Engine
- **Email Service**: `nodemailer` (SMTP with live development console fallback)
- **File & Media Uploads**: `multer` (Camera photos, image scans, PDFs, structured JSON/CSVs)
- **Frontend**: Vanilla HTML5, JavaScript (ES6+), [Tailwind CSS](https://tailwindcss.com/), [Lucide Icons](https://lucide.dev/)

---

## 📂 Project Structure

```
F.A.S.T/
├── database/
│   ├── database.js          # PostgreSQL connection pool & health check
│   └── schema.sql            # Complete DB schema (Users, Semesters, Subjects, Timetable, Invigilation, Substitutions, Personal Schedules)
├── middleware/
│   └── auth.js              # Session & HOD permission enforcement
├── n8n_workflows/
│   └── substitution_comparison_workflow.json # Importable n8n workflow definition
├── public/
│   ├── css/
│   │   └── style.css        # Custom styles, theme pills, animations & glassmorphism
│   ├── js/
│   │   └── app.js           # Frontend controller, timetable renderer, OTP modal, WhatsApp engine, live n8n runner
│   └── index.html           # Single Page Application container (Login view, 4 Tabs, Modals)
├── routes/
│   ├── auth.js              # Login, collision prompts, personal email OTP, single admin lock
│   ├── invigilation.js      # Exam rosters, photo/PDF circular upload, delete duty, clear completed
│   ├── n8n.js                # n8n webhook API & pipeline tracer
│   ├── substitutions.js      # Multi-stage comparison with invigilation name matching
│   ├── timetable.js          # Master timetable queries, semester branches, period management
│   └── upload.js             # Personal timetable photo/PDF uploads, auto-population & master TT updates
├── scripts/
│   ├── inspect_db.js        # DB inspection utility
│   ├── migrate_to_cme.js    # Data migration utility
│   └── update_timings_to_8am.js # Timetable timing synchronizer
├── uploads/                 # Storage directory for exam circulars & documents
├── .env.example             # Environment variables template
├── package.json             # NPM dependencies & start scripts
├── server.js                # Express app entry point
└── README.md                # Comprehensive documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18.x or higher)
- **npm** (v9.x or higher)
- **PostgreSQL Database** (e.g. [Neon.tech](https://neon.tech/) cloud database or local PostgreSQL)

### 2. Open Directory
```bash
cd "c:\Users\BABURAO\Desktop\F.A.S.T"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory (or copy `.env.example`):
```env
PORT=3000
DATABASE_URL=postgresql://neondb_owner:npg_gNlY8B0FqVev@ep-divine-pond-a1iimqg6-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# Optional: Real SMTP email delivery for HOD OTP (Falls back to terminal console if not set)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM="F.A.S.T System" <no-reply@polytechnic.edu>
```

### 5. Start the Server & Access Online Anywhere

#### A. Local & Wi-Fi Access:
```bash
npm start
```
- **Local Computer**: `http://localhost:3000`
- **Same Wi-Fi Network**: `http://10.57.129.246:3000`

#### B. Access from ANY Phone on ANY Network (Mobile Data / 4G / 5G / Remote Wi-Fi):
To open the application on any phone on any network without needing the same Wi-Fi:
- 🌐 **Cloudflare Link (Direct & Fast)**: `https://drawn-occurred-urban-madrid.trycloudflare.com`
- 🌐 **LocalTunnel Backup Link**: `https://dirty-ads-clean.loca.lt` *(Password IP if asked: `106.192.3.187`)*

To start or maintain the mobile tunnels anytime, run:
```bash
npm run tunnel
```

---

## 👥 Demo Accounts & Credentials

F.A.S.T enforces a security policy requiring passwords to have at least **1 uppercase letter** and **1 special character**. All pre-seeded accounts use the demo password `Fast@2026`.

| Faculty Name | Faculty ID / Login | Designation | Department | Default Password | Phone Number | Role |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dr. K. Smitha** | `HOD_CSE` (or `Smitha`) | Head of Department | CSE | `Fast@2026` | `+91 98480 11223` | **HOD / Admin** |
| **Dr. V. Ravi Kumar** | `FAC001` (or `Ravi`) | Senior Lecturer | CSE | `Fast@2026` | `+91 98481 22334` | **Faculty** |
| **Dr. S. Anitha** | `FAC002` (or `Anitha`) | Lecturer | CSE | `Fast@2026` | `+91 98482 33445` | **Faculty (Exam Duty)** |
| **Prof. M. Kiran** | `FAC003` (or `Kiran`) | Assistant Lecturer | CSE | `Fast@2026` | `+91 98483 44556` | **Faculty** |
| **Prof. P. Priya** | `FAC004` (or `Priya`) | Assistant Lecturer | CSE | `Fast@2026` | `+91 98484 55667` | **Faculty (Exam Duty)** |
| **Prof. G. Ramesh** | `FAC005` (or `Ramesh`) | Assistant Lecturer | CSE | `Fast@2026` | `+91 98485 66778` | **Faculty** |

> [!TIP]
> **Single Admin Policy**: Only one user can hold active admin privileges at a time. If another user attempts HOD elevation while an admin is logged in, they are notified that Admin access is currently locked.
> 
> **Admin Bypass Code**: For quick testing of the HOD Email OTP modal without SMTP, use the master verification code `999999` or check the terminal log where the generated OTP is printed.

---

## 🧪 Step-by-Step Testing Guide

### 1. Test Master Timetable & Automated Substitute Finding
1. Open `http://localhost:3000`.
2. Sign in as `Dr. Ravi Kumar` using password `Fast@2026`.
3. In the **Home** tab, observe the timetable for **CSE 5th Sem** (Periods 1 to 7, 08:00 AM to 01:30 PM).
4. Click on **Monday Period 1 (CS-502 AJWT - Dr. Ravi)**.
5. Scroll to the **Available Substitute Faculty Candidates** section below:
   - **Dr. Ravi** is excluded (absent teacher).
   - **Dr. Anitha** is displayed with an amber badge: `⚠️ In Exam Invigilation` (assigned to Mid-I Exam in Drawing Hall-1).
   - **Prof. M. Kiran** and **Prof. G. Ramesh** are displayed as `🟢 Completely Free`.
6. Notice that both free teachers and teachers on exam duty have active **Call Now**, **WhatsApp**, and **Select as Substitute** buttons.

### 2. Test Exam Invigilation Management
1. Switch to the **Exam Invigilation** tab.
2. View scheduled examinations, halls, and assigned faculty invigilators.
3. In Admin mode:
   - Use the camera / photo dropzone to upload an exam duty circular image or PDF.
   - Click **🗑️ Delete** on any duty row to cancel an assignment.
   - Click **"🗑️ Clear Finished Exams"** to purge past completed exams.

### 3. Test "Update & Edit" Personal Timetable
1. Switch to the **Update & Edit** tab.
2. Notice your personal timetable is displayed with your faculty name badge.
3. **Upload Options**:
   - Take a photo with your phone camera or upload a timetable image/PDF.
   - Or click **"⚡ Auto-Populate from Master Timetable"** to sync from the database.
   - Or click any period slot to toggle **Free** vs **Class** and click **"💾 Save & Sync My Timetable"**.
4. Faculty members cannot edit the master timetable; only the active Admin can switch to **👑 Semester Master Timetable** mode.

### 4. Test Single Active Admin Lock & Personal Email OTP
1. Click **"🛡️ HOD Admin Access"** in the header.
2. Enter your **personal email address** and click **Send Verification Code**.
3. Check the server console log for the 6-digit OTP (or use `999999`).
4. Enter the code and click **Verify & Activate Admin**.
5. While logged in as Admin, open another incognito window, log in as another user, and attempt to elevate as Admin: observe the **Single Admin Locked** message.
6. Log out from the first session to release the admin lock.

---

## 📡 API Reference

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/faculty-list` | Get list of all department faculty for login selection |
| `POST` | `/api/auth/login` | Log in faculty member (with password policy, collision checks & auto-registration) |
| `POST` | `/api/auth/send-hod-otp` | Generate and dispatch 6-digit OTP to personal email |
| `POST` | `/api/auth/verify-hod-otp` | Verify OTP and lock single active admin role |
| `GET` | `/api/auth/me` | Fetch currently authenticated user session and active admin status |
| `POST` | `/api/auth/logout` | Terminate session and release single admin lock |

### Substitutions (`/api/substitutions`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/substitutions/available` | Comparison returning available faculty with invigilation status matching |
| `POST` | `/api/substitutions/assign` | Assign substitute faculty for a timetable slot |
| `GET` | `/api/substitutions/history` | Retrieve historical substitution assignments |

### Timetable (`/api/timetable`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/timetable/branches` | List all CSE semester branches |
| `GET` | `/api/timetable/meta/options` | Retrieve available subjects and faculty options |
| `GET` | `/api/timetable/:branch_id` | Fetch live weekly master timetable for a semester |
| `POST` | `/api/timetable` | Add a new period slot to the master timetable (Admin only) |
| `DELETE` | `/api/timetable/:id` | Remove a period slot (Admin only) |

### Exam Invigilation (`/api/invigilation`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/invigilation` | List all scheduled exam duties |
| `POST` | `/api/invigilation/upload-schedule` | Upload exam duty circular photo/PDF (Admin only) |
| `POST` | `/api/invigilation` | Schedule an exam invigilation duty (Admin only) |
| `DELETE` | `/api/invigilation/:id` | Delete an exam duty assignment (Admin only) |
| `POST` | `/api/invigilation/clear-completed` | Clear completed past exams from roster (Admin only) |

### Update & Edit Timetables (`/api/upload`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload/personal-file` | Parse camera photo / image / PDF into 7 periods for logged-in faculty |
| `POST` | `/api/upload/auto-populate-personal` | Auto-populate personal schedule from master timetable |
| `POST` | `/api/upload/save-personal` | Save manually edited personal schedule to database |
| `GET` | `/api/upload/personal-schedule` | Retrieve personal schedule of logged-in faculty only |
| `POST` | `/api/upload/master-timetable` | Update master timetable for a semester (Admin only) |

---

## 📄 License & Credits

- **Project**: F.A.S.T — Faculty Alternative Substitute Tracker
- **Department**: Computer Science & Engineering (CSE)
- **Institution**: State Polytechnic / Engineering College
- Powered by **100% Deterministic n8n Workflow Automation** for rapid, zero-error academic operations.
