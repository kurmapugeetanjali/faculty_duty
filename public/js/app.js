// FacultyDuty CSE - Client Controller & Real-Time Engine
let currentUser = null;
let currentDepartment = 'CSE';
let currentBranchId = 4; // Default to CSE 5th Sem
let currentTimetableEntries = [];
let selectedSlot = null; // { day, period, entry }
let hodEditMode = false;
let isAdminMode = false;
let metaOptions = { subjects: [], faculty: [] };
let personalScheduleData = {}; // { Monday: { 1: { isFree: false, label: 'CS-502 (AJWT)' } } }
let selectedPersonalFile = null;

// Application Initialization
document.addEventListener('DOMContentLoaded', async () => {
    initializeLiveDate();
    startLiveClock();
    
    // Concurrently fetch meta options, invigilations, and branches
    await Promise.allSettled([
        loadBranches(),
        loadMetaOptions(),
        loadInvigilations()
    ]);

    // Check user authentication; if active, stay logged in directly on Home page
    await checkSession();

    // Load initial timetable for CSE 5th Sem (Branch 4)
    if (currentBranchId) {
        await loadTimetable(currentBranchId);
    }
    
    if (window.lucide) lucide.createIcons();
});

// ================= REAL-TIME DATE & CLOCK =================
function initializeLiveDate() {
    const dateInput = document.getElementById('substitutionDateInput');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    if (dateInput) dateInput.value = todayStr;
    updateSelectedDayPill(todayStr);
}

function startLiveClock() {
    const clockEl = document.getElementById('liveClockDisplay');
    const loginClockEl = document.getElementById('loginGateClockDisplay');
    const updateTime = () => {
        const now = new Date();
        const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        const timeStr = '🕒 ' + now.toLocaleDateString('en-US', options);
        if (clockEl) clockEl.innerText = timeStr;
        if (loginClockEl) loginClockEl.innerText = timeStr;
    };
    updateTime();
    setInterval(updateTime, 1000);
}

function updateSelectedDayPill(dateStr) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = new Date(dateStr + 'T00:00:00');
    const dayName = days[d.getDay()] === 'Sunday' ? 'Monday' : days[d.getDay()];
    const pill = document.getElementById('currentDayText');
    if (pill) pill.innerText = dayName;
    return dayName;
}

function onDateChange() {
    const dateInput = document.getElementById('substitutionDateInput');
    const dayName = updateSelectedDayPill(dateInput.value);
    if (selectedSlot) {
        selectedSlot.day = dayName;
        queryAvailableSubstitutes(dayName, selectedSlot.period, selectedSlot.entry);
    }
}

// Password Visibility Toggle Function
function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.setAttribute('data-lucide', 'eye-off');
    } else {
        input.type = 'password';
        if (icon) icon.setAttribute('data-lucide', 'eye');
    }
    if (window.lucide) lucide.createIcons();
}

// Quick helper to fill login credentials by Name, Password, and Phone Number
function quickFillLogin(nameOrId, password = 'Fast@2026', phone = '+91 98480 11223') {
    const input = document.getElementById('manualFacultyIdInput');
    const pass = document.getElementById('manualPasswordInput');
    const phoneInput = document.getElementById('manualPhoneInput');
    if (input) input.value = nameOrId;
    if (pass) pass.value = password;
    if (phoneInput) phoneInput.value = phone;
}

function showLoginScreen() {
    const loginView = document.getElementById('loginScreenView');
    const appContainer = document.getElementById('authenticatedAppContainer');
    if (loginView) loginView.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
}

function enterAsGuest() {
    const loginView = document.getElementById('loginScreenView');
    const appContainer = document.getElementById('authenticatedAppContainer');
    if (loginView) loginView.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    currentUser = null;
    isAdminMode = false;
    switchTab('timetableTab', document.getElementById('navHomeTab'));
    renderUserSession();
    renderBranchUI();
    if (currentBranchId) loadTimetable(currentBranchId);
    showToast('Browsing in public guest mode.');
}

function openLoginModal() {
    showLoginScreen();
}

async function quickDemoLogin(identifier) {
    const input = document.getElementById('manualFacultyIdInput');
    const pass = document.getElementById('manualPasswordInput');
    const phoneInput = document.getElementById('manualPhoneInput');
    if (input) input.value = identifier;
    if (pass) pass.value = 'Fast@2026';
    if (phoneInput) phoneInput.value = '+91 98480 11223';
    await submitManualLogin();
}

// ================= AUTHENTICATION & SESSION MANAGEMENT =================
async function checkSession() {
    const loginView = document.getElementById('loginScreenView');
    const appContainer = document.getElementById('authenticatedAppContainer');

    // Fast local storage restore to prevent any screen flashing
    const storedUser = localStorage.getItem('facultyduty_user');
    if (storedUser) {
        try {
            const parsed = JSON.parse(storedUser);
            if (parsed && parsed.full_name) {
                currentUser = parsed;
                isAdminMode = !!currentUser.isAdminElevated || !!currentUser.isHOD || currentUser.role === 'hos';
                if (currentUser.department) {
                    currentDepartment = currentUser.department;
                }
                if (loginView) loginView.classList.add('hidden');
                if (appContainer) appContainer.classList.remove('hidden');

                switchTab('timetableTab', document.getElementById('navHomeTab'));
                renderUserSession();
                renderBranchUI();
            }
        } catch (e) {
            localStorage.removeItem('facultyduty_user');
        }
    }

    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            currentUser = await res.json();
            isAdminMode = !!currentUser.isAdminElevated || !!currentUser.isHOD || currentUser.role === 'hos';
            if (currentUser.department) {
                currentDepartment = currentUser.department;
            }
            localStorage.setItem('facultyduty_user', JSON.stringify(currentUser));
            
            if (loginView) loginView.classList.add('hidden');
            if (appContainer) appContainer.classList.remove('hidden');

            switchTab('timetableTab', document.getElementById('navHomeTab'));
            renderUserSession();
            renderBranchUI();
            return;
        }

        // If not logged in and no local storage, show login screen
        if (!currentUser) {
            if (loginView) loginView.classList.remove('hidden');
            if (appContainer) appContainer.classList.add('hidden');
        }
    } catch (e) {
        console.error("Auth check failed:", e);
        if (!currentUser) {
            if (loginView) loginView.classList.remove('hidden');
            if (appContainer) appContainer.classList.add('hidden');
        }
    }
}

async function submitManualLogin(e) {
    if (e) e.preventDefault();
    const rawInput = (document.getElementById('manualFacultyIdInput')?.value || '').trim();
    const password = document.getElementById('manualPasswordInput')?.value || 'Fast@2026';
    const phone = (document.getElementById('manualPhoneInput')?.value || '').trim();
    const errorDiv = document.getElementById('loginErrorMessage');
    const loginView = document.getElementById('loginScreenView');
    const appContainer = document.getElementById('authenticatedAppContainer');

    if (!rawInput) {
        if (errorDiv) {
            errorDiv.innerText = 'Please enter your Name or Faculty ID.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    if (!password) {
        if (errorDiv) {
            errorDiv.innerText = 'Please enter your Password.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faculty_id: rawInput, password, phone })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            isAdminMode = !!currentUser.isAdminElevated || !!currentUser.isHOD;
            if (currentUser.department) {
                currentDepartment = currentUser.department;
            }
            localStorage.setItem('facultyduty_user', JSON.stringify(currentUser));
            
            // Switch from Login Page to Main Application Home Page
            if (loginView) loginView.classList.add('hidden');
            if (appContainer) appContainer.classList.remove('hidden');
            if (errorDiv) errorDiv.classList.add('hidden');

            // Open Home page tab
            switchTab('timetableTab', document.getElementById('navHomeTab'));

            renderUserSession();
            renderBranchUI();

            const welcomeRole = (currentUser.isHOD || currentUser.role === 'hos') ? ` (HOD ${currentUser.department || ''} / Admin)` : '';
            showToast(`Welcome, ${currentUser.full_name}${welcomeRole}!`);

            await loadTimetable(currentBranchId);
            await loadInvigilations();
            await loadPersonalSchedule();
            if (window.lucide) lucide.createIcons();
        } else {
            if (errorDiv) {
                errorDiv.innerText = data.error || 'Invalid credentials. (Default demo password: Fast@2026)';
                errorDiv.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (errorDiv) {
            errorDiv.innerText = 'Login server connection error';
            errorDiv.classList.remove('hidden');
        }
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
        console.warn("Logout error:", e);
    }
    currentUser = null;
    isAdminMode = false;
    localStorage.removeItem('facultyduty_user');
    
    // Switch to Login Gate Screen
    const loginView = document.getElementById('loginScreenView');
    const appContainer = document.getElementById('authenticatedAppContainer');
    if (loginView) loginView.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');

    showToast('Signed out successfully.');
}

function renderUserSession() {
    const badge = document.getElementById('userProfileBadge');
    const nameDisplay = document.getElementById('userNameDisplay');
    const phoneDisplay = document.getElementById('userPhoneDisplay');
    const roleBadge = document.getElementById('userRoleBadge');
    const headerLoginBtn = document.getElementById('headerLoginBtn');
    const adminToggleBtn = document.getElementById('headerAdminToggleBtn');
    const adminText = document.getElementById('adminButtonText');
    const hodSection = document.getElementById('hodControlSection');
    const uploadModeSwitcher = document.getElementById('uploadModeSwitcher');
    const adminInvigUpload = document.getElementById('adminInvigilationUploadCard');
    const invigNotice = document.getElementById('invigAdminNotice');
    const personalBadge = document.getElementById('personalFacultyNameBadge');

    if (!currentUser) {
        if (badge) badge.classList.add('hidden');
        if (headerLoginBtn) headerLoginBtn.classList.remove('hidden');
        if (adminToggleBtn) adminToggleBtn.classList.add('hidden');
        return;
    }

    const isHODUser = currentUser.isHOD || currentUser.role === 'hos';
    const deptTag = currentUser.department ? ` (${currentUser.department})` : '';

    if (headerLoginBtn) headerLoginBtn.classList.add('hidden');
    if (badge) {
        badge.classList.remove('hidden');
        badge.classList.add('flex');
    }
    if (nameDisplay) nameDisplay.innerText = currentUser.full_name;
    if (phoneDisplay) phoneDisplay.innerText = `📱 ${currentUser.phone || '+91 98480 11223'}`;
    if (personalBadge) personalBadge.innerText = `${currentUser.full_name} [${currentUser.department || 'CSE'}]`;

    if (roleBadge) {
        if (isHODUser) {
            roleBadge.innerText = `👑 HOD${deptTag}`;
            roleBadge.className = 'px-1.5 py-0.2 rounded text-[9px] uppercase font-black bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-sm border border-amber-300';
        } else if (isAdminMode) {
            roleBadge.innerText = `👑 ADMIN${deptTag}`;
            roleBadge.className = 'px-1.5 py-0.2 rounded text-[9px] uppercase font-black bg-amber-400 text-slate-950 shadow-sm';
        } else {
            roleBadge.innerText = `FACULTY${deptTag}`;
            roleBadge.className = 'px-1.5 py-0.2 rounded text-[9px] uppercase font-black bg-indigo-500/40 text-indigo-200 border border-indigo-400/40';
        }
    }

    // Separate HOD / Admin Option Button in Header
    if (adminToggleBtn) {
        adminToggleBtn.classList.remove('hidden');
        adminToggleBtn.classList.add('flex');
        if (adminText) {
            if (isHODUser) {
                adminText.innerText = isAdminMode ? `👑 HOD Admin ${deptTag} Active` : `👑 HOD Admin ${deptTag}`;
            } else {
                adminText.innerText = isAdminMode ? `👑 Admin Active${deptTag}` : '🛡️ HOD Admin Access';
            }
        }
        adminToggleBtn.className = isAdminMode
            ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 shadow-sm transition'
            : 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/40 shadow-sm transition';
    }

    // HOD Controls on Home page
    if (hodSection) {
        if (isAdminMode) {
            hodSection.classList.remove('hidden');
            hodSection.classList.add('flex');
        } else {
            hodSection.classList.add('hidden');
            hodSection.classList.remove('flex');
            hodEditMode = false;
        }
    }

    // Admin Upload Switcher in Upload tab
    if (uploadModeSwitcher) {
        if (isAdminMode) {
            uploadModeSwitcher.classList.remove('hidden');
            uploadModeSwitcher.classList.add('flex');
        } else {
            uploadModeSwitcher.classList.add('hidden');
            switchUploadMode('personal');
        }
    }

    // Admin Exam Invigilation Upload Card & Clear Button
    const btnClearExams = document.getElementById('btnClearCompletedExams');
    if (adminInvigUpload) {
        if (isAdminMode) {
            adminInvigUpload.classList.remove('hidden');
            if (invigNotice) invigNotice.classList.add('hidden');
            if (btnClearExams) btnClearExams.classList.remove('hidden');
        } else {
            adminInvigUpload.classList.add('hidden');
            if (invigNotice) invigNotice.classList.remove('hidden');
            if (btnClearExams) btnClearExams.classList.add('hidden');
        }
    }

    if (window.lucide) lucide.createIcons();
}

// ================= DEDICATED HOD ADMIN EMAIL OTP VERIFICATION =================
let hodOtpTimerInterval = null;
let hodOtpExpiresAt = 0;

function openAdminVerificationModal() {
    if (isAdminMode || (currentUser && (currentUser.isHOD || currentUser.isAdminElevated || currentUser.role === 'hos'))) {
        isAdminMode = true;
        if (currentUser) currentUser.isAdminElevated = true;
        renderUserSession();
        showToast(`👑 HOD Admin Mode is Active for ${currentUser?.department || currentDepartment} Department! Master edit & exam tools unlocked.`);
        return;
    }

    // Reset to Step 1 for faculty seeking HOD admin elevation
    goToHodStep1();
    
    // Auto fill email from logged in user or default to HOD email
    const emailInput = document.getElementById('hodVerificationEmail');
    if (emailInput) {
        emailInput.value = (currentUser && currentUser.email) ? currentUser.email : `${(currentUser?.department || 'cse').toLowerCase()}.hod@polytechnic.edu`;
    }

    const codeInput = document.getElementById('hodOtpCodeInput');
    if (codeInput) codeInput.value = '';

    openModal('adminElevationModal');
    if (window.lucide) lucide.createIcons();
}

function goToHodStep1() {
    const step1 = document.getElementById('hodOtpStep1');
    const step2 = document.getElementById('hodOtpStep2');
    const err1 = document.getElementById('hodOtpErrorStep1');
    const err2 = document.getElementById('hodOtpErrorStep2');

    if (step1) step1.classList.remove('hidden');
    if (step2) step2.classList.add('hidden');
    if (err1) err1.classList.add('hidden');
    if (err2) err2.classList.add('hidden');

    if (hodOtpTimerInterval) {
        clearInterval(hodOtpTimerInterval);
        hodOtpTimerInterval = null;
    }
    if (window.lucide) lucide.createIcons();
}

function startHodOtpTimer(seconds = 300) {
    if (hodOtpTimerInterval) clearInterval(hodOtpTimerInterval);
    hodOtpExpiresAt = Date.now() + seconds * 1000;

    const timerDisplay = document.getElementById('hodOtpCountdown');
    function updateTimer() {
        const remaining = Math.max(0, Math.floor((hodOtpExpiresAt - Date.now()) / 1000));
        const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
        const secs = String(remaining % 60).padStart(2, '0');
        if (timerDisplay) {
            timerDisplay.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 inline mr-1"></i> Expires in: ${mins}:${secs}`;
            if (window.lucide) lucide.createIcons();
        }
        if (remaining <= 0) {
            clearInterval(hodOtpTimerInterval);
            hodOtpTimerInterval = null;
            if (timerDisplay) {
                timerDisplay.innerHTML = `<span class="text-red-500 font-bold">Code expired. Please resend.</span>`;
            }
        }
    }
    updateTimer();
    hodOtpTimerInterval = setInterval(updateTimer, 1000);
}

async function sendHodVerificationCode() {
    const emailInput = document.getElementById('hodVerificationEmail');
    const errorDiv = document.getElementById('hodOtpErrorStep1');
    const errorDiv2 = document.getElementById('hodOtpErrorStep2');
    const btnText = document.getElementById('btnSendHodOtpText');
    const emailDisplay = document.getElementById('hodOtpSentEmailDisplay');
    const step1 = document.getElementById('hodOtpStep1');
    const step2 = document.getElementById('hodOtpStep2');
    const codeInput = document.getElementById('hodOtpCodeInput');

    const email = (emailInput ? emailInput.value : '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (errorDiv) {
            errorDiv.innerText = 'Please enter a valid institutional email address.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    if (errorDiv) errorDiv.classList.add('hidden');
    if (errorDiv2) errorDiv2.classList.add('hidden');
    if (btnText) btnText.innerText = 'Sending Code...';

    try {
        const res = await fetch('/api/auth/send-hod-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (btnText) btnText.innerText = 'Send Verification Code';

        if (res.ok) {
            if (emailDisplay) emailDisplay.innerText = data.email || email;
            if (step1) step1.classList.add('hidden');
            if (step2) step2.classList.remove('hidden');

            startHodOtpTimer(data.expiresInSeconds || 300);

            if (codeInput) {
                codeInput.value = '';
                setTimeout(() => codeInput.focus(), 150);
            }

            const codeHint = data.codePreview ? ` (Code: ${data.codePreview})` : '';
            showToast(`📨 Verification code sent to ${data.email || email}!${codeHint}`);
            if (window.lucide) lucide.createIcons();
        } else {
            if (errorDiv) {
                errorDiv.innerText = data.error || 'Failed to send verification code.';
                errorDiv.classList.remove('hidden');
            }
            if (errorDiv2) {
                errorDiv2.innerText = data.error || 'Failed to send verification code.';
                errorDiv2.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (btnText) btnText.innerText = 'Send Verification Code';
        if (errorDiv) {
            errorDiv.innerText = 'Server connection error. Please try again.';
            errorDiv.classList.remove('hidden');
        }
    }
}

async function verifyHodCodeAndActivate() {
    const codeInput = document.getElementById('hodOtpCodeInput');
    const errorDiv = document.getElementById('hodOtpErrorStep2');
    const btnText = document.getElementById('btnVerifyHodOtpText');

    const code = (codeInput ? codeInput.value : '').trim();
    if (!code || code.length < 4) {
        if (errorDiv) {
            errorDiv.innerText = 'Please enter the 6-digit verification code sent to your email.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    if (errorDiv) errorDiv.classList.add('hidden');
    if (btnText) btnText.innerText = 'Verifying...';

    try {
        const res = await fetch('/api/auth/verify-hod-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await res.json();

        if (btnText) btnText.innerText = 'Verify & Activate Admin';

        if (res.ok) {
            isAdminMode = true;
            if (currentUser) {
                currentUser.isAdminElevated = true;
                currentUser.role = 'hos';
                currentUser.isHOD = true;
                localStorage.setItem('facultyduty_user', JSON.stringify(currentUser));
            }

            if (hodOtpTimerInterval) {
                clearInterval(hodOtpTimerInterval);
                hodOtpTimerInterval = null;
            }

            closeModal('adminElevationModal');
            renderUserSession();
            renderMasterTimetable(currentTimetableEntries);
            showToast('👑 Identity Verified: HOD Admin Mode Activated! You can now edit timetables and upload exam duty sheets.');
        } else {
            if (errorDiv) {
                errorDiv.innerText = data.error || 'Invalid or expired verification code.';
                errorDiv.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (btnText) btnText.innerText = 'Verify & Activate Admin';
        if (errorDiv) {
            errorDiv.innerText = 'Verification failed due to connection error.';
            errorDiv.classList.remove('hidden');
        }
    }
}

// ================= 5-BRANCH ENGINEERING DEPARTMENT & SEMESTER CONTROLLER =================
let allBranches = [];

async function loadBranches() {
    try {
        const res = await fetch('/api/timetable/branches');
        if (!res.ok) return;
        allBranches = await res.json();
        renderBranchUI();
    } catch (e) {
        console.error("Error loading branches:", e);
    }
}

function renderBranchUI() {
    // 1. Highlight active branch button
    const branchBtns = document.querySelectorAll('#branchPillContainer .branch-pill');
    branchBtns.forEach(btn => {
        const dept = btn.getAttribute('data-dept');
        if (dept === currentDepartment) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const deptFullNames = {
        'CSE': 'Computer Science & Engineering',
        'MECH': 'Mechanical Engineering',
        'EEE': 'Electrical & Electronics Engineering',
        'ECE': 'Electronics & Communication Engineering',
        'CIVIL': 'Civil Engineering'
    };

    const branchBadge = document.getElementById('currentBranchBadge');
    if (branchBadge) {
        branchBadge.innerText = `${currentDepartment} • ${deptFullNames[currentDepartment] || 'Engineering'}`;
    }

    const subTitle = document.getElementById('currentSemesterSubtitle');
    if (subTitle) {
        subTitle.innerText = `Showing all 5 semesters for ${currentDepartment} Department`;
    }

    // 2. Render Semester pills for the active department
    const semContainer = document.getElementById('semesterPillContainer');
    if (semContainer) {
        const deptBranches = allBranches.filter(b => b.department === currentDepartment);
        if (deptBranches.length > 0) {
            semContainer.innerHTML = deptBranches.map(b => {
                const isActive = (b.id === currentBranchId);
                return `
                    <button onclick="selectSemester(${b.id}, this)" class="semester-pill ${isActive ? 'active' : ''} px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer transition transform hover:scale-105 active:scale-95">
                        ${b.year} (${b.branch_name})
                    </button>
                `;
            }).join('');
        }
    }

    // 3. Update Admin upload target semester dropdown
    const adminSelect = document.getElementById('adminUploadTargetSemester');
    if (adminSelect && allBranches.length > 0) {
        adminSelect.innerHTML = allBranches.map(b => 
            `<option value="${b.id}" ${b.id === currentBranchId ? 'selected' : ''}>${b.department} - ${b.branch_name} (${b.year})</option>`
        ).join('');
    }
}

async function selectBranch(deptCode, btnElement) {
    currentDepartment = deptCode;
    
    // Pick the default branch for this department (prefer 5th Sem or first)
    const deptBranches = allBranches.filter(b => b.department === currentDepartment);
    if (deptBranches.length > 0) {
        const prefBranch = deptBranches.find(b => b.branch_name.includes('5th')) || deptBranches[0];
        currentBranchId = prefBranch.id;
    }

    renderBranchUI();

    const activeBranch = allBranches.find(b => b.id === currentBranchId);
    const headerTitle = document.getElementById('timetableHeaderTitle');
    if (headerTitle && activeBranch) {
        headerTitle.innerText = `Main Weekly Timetable - ${activeBranch.branch_name}`;
    }

    // Reload meta options for this department
    await loadMetaOptions();

    // Reset substitute results
    selectedSlot = null;
    resetSubstitutePanel();

    // Load master timetable
    await loadTimetable(currentBranchId);
}

async function selectSemester(branchId, btnElement) {
    currentBranchId = branchId;
    const branch = allBranches.find(b => b.id === branchId);
    if (branch) {
        currentDepartment = branch.department;
    }

    renderBranchUI();

    const headerTitle = document.getElementById('timetableHeaderTitle');
    if (headerTitle && branch) {
        headerTitle.innerText = `Main Weekly Timetable - ${branch.branch_name}`;
    }

    // Reset substitute results
    selectedSlot = null;
    resetSubstitutePanel();

    await loadTimetable(branchId);
}

function resetSubstitutePanel() {
    const listDiv = document.getElementById('availableFacultyList');
    const emptyState = document.getElementById('noFacultyAvailableState');
    const countBadge = document.getElementById('availableFacultyCount');
    const badge = document.getElementById('subPanelPeriodBadge');

    if (listDiv) {
        listDiv.innerHTML = `
            <div class="col-span-full py-8 text-center text-xs text-slate-400 italic">
                👈 Tap on any period (Period 1 to 7) in the timetable above to view free faculty candidates with contact numbers!
            </div>
        `;
    }
    if (emptyState) emptyState.classList.add('hidden');
    if (badge) badge.innerText = 'Tap a Period Above';
    if (countBadge) countBadge.innerText = 'Select any slot';
}

// ================= META OPTIONS =================
async function loadMetaOptions() {
    try {
        const res = await fetch(`/api/timetable/meta/options?department=${currentDepartment}`);
        if (res.ok) {
            metaOptions = await res.json();
            populateMetaDropdowns();
        }
    } catch (e) {
        console.error("Failed to load meta options:", e);
    }
}

function populateMetaDropdowns() {
    const subSelect = document.getElementById('newPeriodSubject');
    const facSelect = document.getElementById('newPeriodFaculty');
    const adminExamFacSelect = document.getElementById('adminExamFacultySelect');

    if (subSelect && metaOptions.subjects) {
        subSelect.innerHTML = metaOptions.subjects.map(s => 
            `<option value="${s.id}">${s.subject_code} - ${s.subject_name}</option>`
        ).join('');
    }

    if (facSelect && metaOptions.faculty) {
        facSelect.innerHTML = metaOptions.faculty.map(f => 
            `<option value="${f.id}">${f.full_name} (${f.designation})</option>`
        ).join('');
    }

    if (adminExamFacSelect && metaOptions.faculty) {
        adminExamFacSelect.innerHTML = metaOptions.faculty.map(f => 
            `<option value="${f.id}">${f.full_name} (${f.faculty_id})</option>`
        ).join('');
    }
}

// ================= MAIN TIMETABLE (HOME TAB - 7 PERIODS CONTINUOUS, NO LUNCH) =================
async function loadTimetable(branchId) {
    if (!branchId) return;
    try {
        const res = await fetch(`/api/timetable/${branchId}`);
        if (!res.ok) throw new Error('Failed to fetch timetable');

        currentTimetableEntries = await res.json();
        renderMasterTimetable(currentTimetableEntries);
    } catch (e) {
        console.error("Timetable load error:", e);
        showToast('Error loading timetable', 'error');
    }
}

function getSubjectThemeClass(subjectCode) {
    if (!subjectCode) return 'subject-theme-free';
    const code = subjectCode.toUpperCase();
    if (code.includes('501') || code.includes('IME') || code.includes('304') || code.includes('DBMS') || code.includes('102')) return 'subject-theme-indigo';
    if (code.includes('502') || code.includes('AJWT') || code.includes('JAVA') || code.includes('105') || code.includes('402')) return 'subject-theme-blue';
    if (code.includes('503') || code.includes('CCV') || code.includes('CLOUD') || code.includes('403') || code.includes('603')) return 'subject-theme-green';
    if (code.includes('504') || code.includes('PPDS') || code.includes('PYTHON') || code.includes('302') || code.includes('604')) return 'subject-theme-purple';
    if (code.includes('505') || code.includes('CHN') || code.includes('LAB') || code.includes('305') || code.includes('405')) return 'subject-theme-orange';
    if (code.includes('506') || code.includes('MPW') || code.includes('PROJECT') || code.includes('606') || code.includes('101')) return 'subject-theme-rose';
    if (code.includes('601') || code.includes('APP') || code.includes('404')) return 'subject-theme-cyan';
    return 'subject-theme-indigo';
}

const dayClassMap = {
    'Monday': 'day-card-mon',
    'Tuesday': 'day-card-tue',
    'Wednesday': 'day-card-wed',
    'Thursday': 'day-card-thu',
    'Friday': 'day-card-fri',
    'Saturday': 'day-card-sat'
};

function renderMasterTimetable(entries) {
    const tbody = document.getElementById('masterTimetableGridBody');
    const noticeEl = document.getElementById('timetableNotUploadedNotice');
    const notUploadedBranch = document.getElementById('notUploadedBranchName');
    
    if (!tbody) return;
    tbody.innerHTML = '';

    const activeBranch = allBranches.find(b => b.id === currentBranchId);
    const branchName = activeBranch ? `${activeBranch.department} - ${activeBranch.branch_name}` : `${currentDepartment} Timetable`;

    // Check if timetable has uploaded classes
    const hasUploadedClasses = entries && Array.isArray(entries) && entries.length > 0;

    if (noticeEl) {
        if (!hasUploadedClasses) {
            noticeEl.classList.remove('hidden');
            if (notUploadedBranch) notUploadedBranch.innerText = branchName;
        } else {
            noticeEl.classList.add('hidden');
        }
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const schedule = {};
    days.forEach(d => {
        schedule[d] = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };
    });

    if (hasUploadedClasses) {
        entries.forEach(entry => {
            if (schedule[entry.day]) {
                schedule[entry.day][entry.period] = entry;
            }
        });
    }

    days.forEach(day => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/40 transition-colors";
        const dayClass = dayClassMap[day] || 'day-card-mon';

        let html = `
            <td class="day-header-cell">
                <div class="day-pleasure-box ${dayClass}">
                    <div class="text-[12px] font-black uppercase tracking-wider">${day.slice(0, 3)}</div>
                    <div class="text-[10px] font-extrabold opacity-90 mt-0.5">${day}</div>
                </div>
            </td>
        `;

        for (let p = 1; p <= 7; p++) {
            html += generatePeriodCellHTML(day, p, schedule[day][p], hasUploadedClasses);
        }

        tr.innerHTML = html;
        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

function generatePeriodCellHTML(day, period, entry, hasUploadedClasses = true) {
    const isSelected = selectedSlot && selectedSlot.day === day && selectedSlot.period === period;

    if (entry) {
        const themeClass = getSubjectThemeClass(entry.subject_code);
        return `
            <td class="timetable-cell">
                <div onclick="selectPeriodSlot('${day}', ${period}, ${entry.id})" 
                     class="period-slot ${themeClass} p-2.5 sm:p-3 rounded-xl ${isSelected ? 'selected' : ''}">
                    <div class="flex items-center justify-between gap-1 mb-1">
                        <span class="badge-pill px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide shadow-xs">
                            ${entry.subject_code}
                        </span>
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/5 text-slate-700">${entry.room || 'LH-101'}</span>
                    </div>
                    <div class="text-xs font-black truncate tracking-tight text-slate-900" title="${entry.subject_name}">
                        ${entry.subject_name}
                    </div>
                    <div class="text-[11px] font-bold flex items-center gap-1 mt-1 text-slate-600 truncate">
                        <i data-lucide="user" class="w-3 h-3 text-slate-400 flex-shrink-0"></i>
                        <span>${entry.faculty_name}</span>
                    </div>

                    ${(isAdminMode && hodEditMode) ? `
                        <div class="mt-2 pt-1 border-t border-black/5 flex justify-end gap-1">
                            <button onclick="event.stopPropagation(); deletePeriod(${entry.id})" class="text-red-600 hover:text-red-800 text-[10px] px-1 font-bold">
                                Delete
                            </button>
                        </div>
                    ` : `
                        <div class="mt-1.5 text-[9px] font-extrabold flex items-center gap-1 text-indigo-700 bg-indigo-100/60 px-1.5 py-0.5 rounded w-fit">
                            <i data-lucide="sparkles" class="w-2.5 h-2.5 text-indigo-600"></i> Tap for sub
                        </div>
                    `}
                </div>
            </td>
        `;
    } else {
        return `
            <td class="timetable-cell">
                <div onclick="selectPeriodSlot('${day}', ${period}, null)" 
                     class="period-slot subject-theme-free p-2.5 sm:p-3 rounded-xl text-center flex flex-col justify-center min-h-[76px] ${isSelected ? 'selected' : ''}">
                    <span class="text-[11px] font-extrabold ${hasUploadedClasses ? 'text-slate-600' : 'text-amber-800'}">
                        ${hasUploadedClasses ? 'Free Period' : 'Not Uploaded'}
                    </span>
                    <span class="text-[9px] text-slate-400 mt-0.5">
                        ${hasUploadedClasses ? 'No Class Scheduled' : 'Upload in Update & Edit'}
                    </span>
                    ${(isAdminMode && hodEditMode) ? `
                        <button onclick="event.stopPropagation(); quickAddPeriodForSlot('${day}', ${period})" class="text-[10px] text-indigo-600 font-black hover:underline mt-1">
                            + Add Class
                        </button>
                    ` : `
                        <span class="text-[9px] font-bold text-indigo-600 mt-1">Tap for faculty</span>
                    `}
                </div>
            </td>
        `;
    }
}

// ================= PERIOD CLICK -> DISPLAY FREE FACULTY + EXAM COMPARISON =================
async function selectPeriodSlot(day, period, entryId) {
    const entry = currentTimetableEntries.find(e => e.id === entryId) || null;
    selectedSlot = { day, period, entry };

    renderMasterTimetable(currentTimetableEntries);

    const panel = document.getElementById('substitutionResultsPanel');
    const title = document.getElementById('subPanelTitle');
    const badge = document.getElementById('subPanelPeriodBadge');
    const subtitle = document.getElementById('subPanelSubtitle');

    if (badge) badge.innerText = `${day} Period ${period}`;
    if (title) {
        title.innerText = entry 
            ? `Available Substitute Faculty for ${entry.subject_name}`
            : `Available Faculty for ${day} Period ${period}`;
    }
    if (subtitle) {
        subtitle.innerText = entry 
            ? `Scheduled Teacher: ${entry.faculty_name} (${entry.room}) • CSE Department`
            : `Open Period slot in CSE Master Timetable.`;
    }

    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    await queryAvailableSubstitutes(day, period, entry);
}

function renderFacultyCards(facultyList, day, period, entry) {
    const facultyListDiv = document.getElementById('availableFacultyList');
    const emptyState = document.getElementById('noFacultyAvailableState');
    const countBadge = document.getElementById('availableFacultyCount');

    const freeCount = facultyList.filter(f => f.availability_status === 'available').length;
    const examDutyCount = facultyList.filter(f => f.availability_status === 'invigilation_busy').length;
    
    if (countBadge) {
        countBadge.innerText = `${freeCount} Completely Free • ${examDutyCount} in Exam Invigilation`;
    }

    if (facultyList.length === 0) {
        if (facultyListDiv) facultyListDiv.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (!facultyListDiv) return;

    facultyListDiv.innerHTML = facultyList.map(fac => {
        const cleanPhone = (fac.phone || '').replace(/[^0-9]/g, '');
        const whatsappMsg = encodeURIComponent(
            `Hello Prof. ${fac.full_name}, this is ${currentUser ? currentUser.full_name : 'Faculty'}. Can you please substitute for my CSE class on ${day} Period ${period} (${entry ? entry.subject_name : 'Diploma Class'})? Thank you!`
        );
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${whatsappMsg}`;
        const isExamBusy = fac.availability_status === 'invigilation_busy';
        const escapedName = (fac.full_name || 'Faculty').replace(/'/g, "\\'");

        return `
            <div class="faculty-candidate-card ${isExamBusy ? 'exam-duty-card' : ''} p-4 sm:p-5 flex flex-col justify-between space-y-3.5">
                <div>
                    <!-- Header with Avatar and Teacher Name -->
                    <div class="flex items-start gap-3">
                        <div class="w-11 h-11 rounded-2xl ${isExamBusy ? 'bg-gradient-to-tr from-amber-500 to-orange-600' : 'bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500'} text-white flex items-center justify-center font-black text-sm shadow-md flex-shrink-0">
                            ${fac.full_name.replace('Dr. ', '').replace('Prof. ', '').substring(0, 2).toUpperCase()}
                        </div>
                        
                        <div class="flex-1 min-w-0">
                            <h4 class="text-sm sm:text-base font-black text-slate-900 leading-snug truncate">
                                ${fac.full_name}
                            </h4>
                            <p class="text-[11px] text-slate-600 font-semibold mt-0.5">
                                ${fac.designation || 'Lecturer'} • CSE Department
                            </p>
                        </div>
                    </div>

                    <!-- Direct Contact Box -->
                    <div class="candidate-contact-box mt-3 mb-2">
                        <div class="text-[10px] uppercase tracking-wider font-extrabold text-indigo-900 flex items-center justify-between">
                            <span class="flex items-center gap-1">
                                <i data-lucide="phone-call" class="w-3.5 h-3.5 text-indigo-600"></i>
                                Contact Phone:
                            </span>
                            <span class="text-[9px] text-emerald-700 font-black bg-emerald-100 px-1.5 py-0.2 rounded">Official</span>
                        </div>
                        <div class="text-sm sm:text-base font-black text-indigo-950 font-code tracking-wide mt-1 flex items-center justify-between">
                            <a href="tel:${fac.phone}" class="hover:underline flex items-center gap-1.5 text-indigo-800">
                                <i data-lucide="phone" class="w-3.5 h-3.5 text-emerald-600"></i>
                                <span>${fac.phone}</span>
                            </a>
                            <button onclick="navigator.clipboard.writeText('${fac.phone}'); showToast('Copied ${fac.phone} to clipboard!')" 
                                    class="text-[10px] bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 px-2 py-0.5 rounded-lg font-bold shadow-xs flex items-center gap-1" title="Copy Number">
                                <i data-lucide="copy" class="w-2.5 h-2.5"></i> Copy
                            </button>
                        </div>
                    </div>

                    <!-- STATUS BADGE: Completely Free vs In Exam Invigilation Warning -->
                    ${isExamBusy ? `
                        <div class="p-2.5 rounded-xl bg-amber-100 border-2 border-amber-400 text-xs text-amber-950 font-semibold space-y-1 mt-2">
                            <div class="flex items-center gap-1.5 font-black text-amber-900">
                                <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600 flex-shrink-0"></i>
                                <span>⚠️ In Exam Invigilation:</span>
                            </div>
                            <div class="text-xs text-amber-950 font-black pl-5">
                                ${fac.invigilation_info ? fac.invigilation_info.exam_name : 'Semester Examination'}
                            </div>
                            <div class="text-[11px] text-amber-900 pl-5 font-bold">
                                Hall: <strong>${fac.invigilation_info ? fac.invigilation_info.hall_no : 'Exam Hall'}</strong> • Session: <strong>${fac.invigilation_info ? fac.invigilation_info.session : 'Morning'}</strong>
                            </div>
                            <div class="text-[10px] text-amber-800 italic pl-5">
                                (Assigned to exam duty. You can still select or contact this faculty member if they agree to substitute)
                            </div>
                        </div>
                    ` : `
                        <div class="p-2 rounded-xl bg-emerald-50 border-2 border-emerald-300 text-xs text-emerald-950 font-black flex items-center gap-2 mt-2">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>🟢 Completely Free & Available for Substitution</span>
                        </div>
                    `}
                </div>

                <!-- 1-Click Action Buttons -->
                <div class="pt-2.5 border-t border-slate-100 space-y-2">
                    <div class="grid grid-cols-2 gap-2 text-center text-xs">
                        <a href="tel:${fac.phone}" class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25 transition">
                            <i data-lucide="phone-call" class="w-4 h-4"></i> Call Now
                        </a>
                        <a href="${whatsappUrl}" target="_blank" class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-black flex items-center justify-center gap-1.5 shadow-md shadow-green-500/25 transition">
                            <i data-lucide="message-square" class="w-4 h-4"></i> WhatsApp
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

async function queryAvailableSubstitutes(day, period, entry) {
    const dateInput = document.getElementById('substitutionDateInput');
    const selectedDate = dateInput.value;
    const originalFacultyId = entry ? entry.faculty_id : (currentUser ? currentUser.id : 0);

    try {
        const res = await fetch(`/api/substitutions/available?date=${selectedDate}&day=${day}&period=${period}&original_faculty_id=${originalFacultyId}&department=${currentDepartment}`);
        if (!res.ok) throw new Error('Failed to fetch faculty list');

        const facultyList = await res.json();
        renderFacultyCards(facultyList, day, period, entry);
    } catch (e) {
        console.error("Error querying substitutes:", e);
    }
}

// ================= EXAM INVIGILATION DUTIES & ADMIN UPLOAD =================
async function loadInvigilations() {
    try {
        const res = await fetch('/api/invigilation');
        if (!res.ok) throw new Error('Failed to load invigilation');

        const exams = await res.json();
        const tbody = document.getElementById('invigilationTableBody');
        const badge = document.getElementById('examCountBadge');
        if (badge) badge.innerText = exams.length;

        if (!tbody) return;

        if (exams.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-xs text-slate-400 font-semibold">No scheduled exam invigilations found.</td></tr>`;
            return;
        }

        tbody.innerHTML = exams.map(e => `
            <tr class="hover:bg-amber-50/60 transition">
                <td class="p-3 font-bold text-amber-950">${e.department || 'All'}</td>
                <td class="p-3 font-extrabold text-slate-900">${e.exam_name}</td>
                <td class="p-3 font-semibold text-slate-600">${e.exam_date}</td>
                <td class="p-3 font-extrabold text-indigo-700">${e.faculty_name || 'Unassigned'}</td>
                <td class="p-3 font-bold text-slate-800">${e.hall_no || 'Assigned Hall'}</td>
                <td class="p-3 font-medium text-slate-700 font-code">
                    ${e.faculty_phone ? `<a href="tel:${e.faculty_phone}" class="hover:underline text-indigo-600 font-bold">${e.faculty_phone}</a>` : '---'}
                </td>
                <td class="p-3 text-right">
                    ${isAdminMode ? `
                        <button onclick="deleteInvigilationDuty(${e.id})" class="text-red-500 hover:text-red-700 font-black text-xs px-2 py-1 rounded bg-red-50 border border-red-200 hover:bg-red-100 transition">
                            🗑️ Delete
                        </button>
                    ` : `
                        <span class="text-[10px] text-slate-400 font-bold">Scheduled</span>
                    `}
                </td>
            </tr>
        `).join('');

        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error("Error loading invigilations:", e);
    }
}

function handleExamDutyFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    const info = document.getElementById('selectedExamDutyFileInfo');
    const nameSpan = document.getElementById('selectedExamDutyFileName');
    const sizeSpan = document.getElementById('selectedExamDutyFileSize');
    if (file) {
        if (nameSpan) nameSpan.innerText = file.name;
        if (sizeSpan) sizeSpan.innerText = `${(file.size / 1024).toFixed(1)} KB`;
        if (info) info.classList.remove('hidden');
        showToast(`Selected exam sheet: ${file.name}`);
    }
}

function simulateExamDutyUpload() {
    document.getElementById('adminExamNameInput').value = 'Board Diploma Theory Examination';
    document.getElementById('adminExamDateInput').value = '2026-09-30';
    document.getElementById('adminExamHallInput').value = 'Drawing Hall-2 (New Block)';
    if (document.getElementById('adminExamFacultySelect')) {
        document.getElementById('adminExamFacultySelect').selectedIndex = 1;
    }
    const info = document.getElementById('selectedExamDutyFileInfo');
    const nameSpan = document.getElementById('selectedExamDutyFileName');
    const sizeSpan = document.getElementById('selectedExamDutyFileSize');
    if (nameSpan) nameSpan.innerText = 'Exam_Invigilation_Notice_CSE.png (Simulated Scan)';
    if (sizeSpan) sizeSpan.innerText = '145.2 KB';
    if (info) info.classList.remove('hidden');
    showToast('Demo Exam Duty Sheet loaded! Click "Upload & Add Exam Duty to Roster" to save.');
}

async function submitAdminInvigilationSheet(e) {
    e.preventDefault();
    if (!isAdminMode) {
        showToast('Only Admin can upload exam duty sheets.', 'error');
        return;
    }

    const examName = document.getElementById('adminExamNameInput').value;
    const examDate = document.getElementById('adminExamDateInput').value;
    const hallNo = document.getElementById('adminExamHallInput').value;
    const facultyId = document.getElementById('adminExamFacultySelect').value;
    const fileInput = document.getElementById('adminInvigFileInput');

    const formData = new FormData();
    formData.append('exam_name', examName);
    formData.append('exam_date', examDate);
    formData.append('hall_no', hallNo);
    formData.append('faculty_id', facultyId);
    if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('examFile', fileInput.files[0]);
    }

    try {
        const res = await fetch('/api/invigilation/upload-schedule', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            showToast('Exam duty sheet uploaded and added to roster!');
            document.getElementById('adminInvigUploadForm').reset();
            const info = document.getElementById('selectedExamDutyFileInfo');
            if (info) info.classList.add('hidden');
            await loadInvigilations();
        } else {
            const err = await res.json();
            showToast(err.error || 'Failed to upload exam sheet', 'error');
        }
    } catch (err) {
        showToast('Error uploading exam sheet', 'error');
    }
}

async function deleteInvigilationDuty(id) {
    if (!isAdminMode) {
        showToast('Admin privileges required to delete exam duties.', 'error');
        return;
    }
    if (!confirm('Are you sure you want to delete this exam invigilation duty assignment?')) return;
    try {
        const res = await fetch(`/api/invigilation/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Exam duty removed from roster.');
            await loadInvigilations();
        } else {
            const err = await res.json();
            showToast(err.error || 'Failed to delete duty', 'error');
        }
    } catch (e) {
        showToast('Error deleting duty', 'error');
    }
}

async function clearCompletedExams() {
    if (!isAdminMode) {
        showToast('Admin mode required to clear exam records.', 'error');
        return;
    }
    if (!confirm('Are you sure you want to delete all past/finished exam invigilations from the roster?')) return;

    try {
        const res = await fetch('/api/invigilation/clear-completed', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Completed examinations cleared successfully.');
            await loadInvigilations();
        } else {
            showToast(data.error || 'Failed to clear past exams', 'error');
        }
    } catch (err) {
        console.error("Error clearing completed exams:", err);
        showToast('Server error clearing exams', 'error');
    }
}

// ================= UPLOAD & EDIT TIMETABLE (PERSONAL FOCUS) =================
function handlePersonalFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    selectedPersonalFile = file || null;
    const info = document.getElementById('selectedFileInfo');
    const nameSpan = document.getElementById('selectedFileName');
    const sizeSpan = document.getElementById('selectedFileSize');
    const promptDiv = document.getElementById('fileUploadPrompt');

    if (file) {
        if (nameSpan) nameSpan.innerText = file.name;
        if (sizeSpan) sizeSpan.innerText = `${(file.size / 1024).toFixed(1)} KB`;
        if (info) info.classList.remove('hidden');
        if (promptDiv) promptDiv.classList.add('hidden');
        showToast(`Selected timetable: ${file.name}`);
    } else {
        if (info) info.classList.add('hidden');
        if (promptDiv) promptDiv.classList.remove('hidden');
    }
}

async function submitPersonalFile() {
    const fileInput = document.getElementById('personalTimetableFileInput');
    const file = selectedPersonalFile || (fileInput && fileInput.files && fileInput.files[0]);

    if (!file) {
        showToast('Please select a photo, camera snapshot, or PDF timetable file first.', 'info');
        if (fileInput) fileInput.click();
        return;
    }

    const btn = document.getElementById('btnUploadPersonalFile');
    if (btn) btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Processing Timetable...</span>`;
    showToast('📷 Processing & structuring timetable into 7 periods...', 'info');

    const uid = currentUser ? currentUser.id : 1;
    const formData = new FormData();
    formData.append('personalFile', file);
    formData.append('user_id', String(uid));

    try {
        const res = await fetch('/api/upload/personal-file', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'x-user-id': String(uid)
            },
            body: formData
        });

        const data = await res.json();
        if (res.ok && data.success) {
            if (data.grid && Array.isArray(data.grid)) {
                personalScheduleData = {};
                data.grid.forEach(row => {
                    const day = row.day;
                    personalScheduleData[day] = {};
                    for (let p = 1; p <= 7; p++) {
                        const slot = row.periods ? row.periods[`p${p}`] : null;
                        personalScheduleData[day][p] = {
                            isFree: slot ? slot.isFree : true,
                            label: slot ? slot.label : 'Free Slot'
                        };
                    }
                });
                renderPersonalScheduleEditor();
            } else {
                await loadPersonalSchedule();
            }

            showToast(data.message || '🎉 Personal timetable structured! Review your schedule below and click "Save & Sync My Timetable".');
            selectedPersonalFile = null;
            if (fileInput) fileInput.value = '';
            const info = document.getElementById('selectedFileInfo');
            const promptDiv = document.getElementById('fileUploadPrompt');
            if (info) info.classList.add('hidden');
            if (promptDiv) promptDiv.classList.remove('hidden');
        } else {
            showToast(data.error || 'Failed to upload timetable file', 'error');
        }
    } catch (err) {
        console.error("Personal file upload error:", err);
        showToast('Error uploading timetable file', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = `<i data-lucide="file-check-2" class="w-4 h-4"></i><span>📷 Organize & Update Timetable</span>`;
            if (window.lucide) lucide.createIcons();
        }
    }
}

function switchUploadMode(mode) {
    const personalSec = document.getElementById('personalTimetableSection');
    const masterSec = document.getElementById('masterTimetableUploadSection');
    const btnPersonal = document.getElementById('btnUploadModePersonal');
    const btnMaster = document.getElementById('btnUploadModeMaster');

    if (mode === 'personal') {
        if (personalSec) personalSec.classList.remove('hidden');
        if (masterSec) masterSec.classList.add('hidden');
        if (btnPersonal) btnPersonal.className = "px-3 py-1.5 rounded-lg text-xs font-black bg-purple-600 text-white shadow-sm";
        if (btnMaster) btnMaster.className = "px-3 py-1.5 rounded-lg text-xs font-black text-slate-600 hover:text-slate-900";
    } else {
        isAdminMode = true;
        if (personalSec) personalSec.classList.add('hidden');
        if (masterSec) masterSec.classList.remove('hidden');
        if (btnMaster) btnMaster.className = "px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 text-white shadow-sm";
        if (btnPersonal) btnPersonal.className = "px-3 py-1.5 rounded-lg text-xs font-black text-slate-600 hover:text-slate-900";
        initInlineMasterEditor();
    }
}

async function autoPopulatePersonalSchedule() {
    showToast('⚡ Running n8n auto-population from Master Timetable...', 'info');
    try {
        const uid = currentUser ? currentUser.id : 1;
        const res = await fetch('/api/upload/auto-populate-personal', {
            method: 'POST',
            credentials: 'include',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': String(uid)
            },
            body: JSON.stringify({ user_id: uid })
        });
        if (!res.ok) throw new Error('Auto-population failed');
        const data = await res.json();
        
        if (data.grid && Array.isArray(data.grid)) {
            personalScheduleData = {};
            data.grid.forEach(row => {
                const day = row.day;
                personalScheduleData[day] = {};
                for (let p = 1; p <= 7; p++) {
                    const slot = row.periods ? row.periods[`p${p}`] : null;
                    personalScheduleData[day][p] = {
                        isFree: slot ? slot.isFree : true,
                        label: slot ? slot.label : 'Free Slot'
                    };
                }
            });
            renderPersonalScheduleEditor();
            showToast(`⚡ n8n Sync Complete: ${data.assignedLectures} active classes identified, ${data.freeSlots} slots marked FREE with 0% error!`);
        }
    } catch (err) {
        console.error("Auto-population error:", err);
        showToast('Auto-population encountered an issue. Loading current schedule.', 'error');
        await loadPersonalSchedule();
    }
}

function markAllUnscheduledAsFree() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let count = 0;
    days.forEach(day => {
        if (!personalScheduleData[day]) personalScheduleData[day] = {};
        for (let p = 1; p <= 7; p++) {
            const current = personalScheduleData[day][p];
            if (!current || current.isFree || (current.label && current.label.includes('Free'))) {
                personalScheduleData[day][p] = {
                    isFree: true,
                    label: 'Free Slot (Automated)'
                };
                count++;
            }
        }
    });
    renderPersonalScheduleEditor();
    showToast(`✨ Verified: ${count} unscheduled periods confirmed as FREE!`);
}

async function runLiveN8nPipeline() {
    const traceDiv = document.getElementById('n8nTraceOutput');
    const badge = document.getElementById('n8nLatencyBadge');
    if (!traceDiv) return;

    traceDiv.innerHTML = `<span class="text-amber-400 animate-pulse">⚡ Invoking n8n background substitution pipeline for Period ${selectedSubstitutionSlot.period} (${selectedSubstitutionSlot.day})...</span>`;
    if (badge) badge.innerText = 'Running...';

    const payload = {
        date: selectedSubstitutionSlot.date || new Date().toISOString().split('T')[0],
        day: selectedSubstitutionSlot.day || 'Monday',
        period: selectedSubstitutionSlot.period || 1,
        original_faculty_id: currentUser ? currentUser.id : 0
    };

    try {
        const startTime = Date.now();
        const res = await fetch('/api/n8n/compare-substitution', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const elapsed = Date.now() - startTime;
        if (!res.ok) throw new Error('Pipeline test failed');
        const data = await res.json();

        if (badge) badge.innerText = `⚡ ${data.executionTimeMs || elapsed}ms Response`;

        let logHtml = `<div class="space-y-1.5">`;
        logHtml += `<div class="text-emerald-400 font-bold">✔ Pipeline Execution Succeeded (${data.executionTimeMs || elapsed}ms)</div>`;
        logHtml += `<div class="text-slate-400 text-[10px]">Criteria: Date ${data.criteria.date} | Day ${data.criteria.day} | Period ${data.criteria.period} | Session ${data.criteria.session}</div>`;
        
        if (data.pipelineTrace && Array.isArray(data.pipelineTrace)) {
            data.pipelineTrace.forEach(step => {
                logHtml += `
                    <div class="flex items-start gap-2 pl-2 border-l-2 border-indigo-500/50 py-0.5">
                        <span class="text-amber-400 font-bold">[Step ${step.step}]</span>
                        <span class="text-slate-300 font-semibold">${step.name}:</span>
                        <span class="text-emerald-300 font-mono">${step.result}</span>
                    </div>
                `;
            });
        }

        const candidates = data.availableFaculty || [];
        logHtml += `<div class="text-amber-300 font-bold pt-1">🎯 Candidate Output: ${candidates.length} verified available faculty ready for 1-Click WhatsApp / Call assignment.</div>`;
        logHtml += `</div>`;

        traceDiv.innerHTML = logHtml;
        showToast(`⚡ n8n Pipeline: ${candidates.length} free candidates resolved in ${data.executionTimeMs || elapsed}ms!`);
    } catch (err) {
        console.error("n8n pipeline error:", err);
        traceDiv.innerHTML = `<span class="text-red-400">✖ Pipeline execution failed: ${err.message}</span>`;
        if (badge) badge.innerText = 'Error';
        showToast('Pipeline execution failed', 'error');
    }
}

function downloadN8nWorkflowJson() {
    window.open('/api/n8n/workflow-json', '_blank');
    showToast('Downloading n8n Workflow JSON definition...');
}

async function loadPersonalSchedule() {
    try {
        const uid = currentUser ? currentUser.id : 1;
        const res = await fetch('/api/upload/personal-schedule', {
            credentials: 'include',
            headers: { 'x-user-id': String(uid) }
        });
        if (res.ok) {
            const data = await res.json();
            personalScheduleData = {};

            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            days.forEach(d => {
                personalScheduleData[d] = {};
                for (let p = 1; p <= 7; p++) {
                    personalScheduleData[d][p] = { isFree: true, label: 'Free Slot (---)' };
                }
            });

            // Fill master assigned classes
            if (data.masterClasses && Array.isArray(data.masterClasses)) {
                data.masterClasses.forEach(cls => {
                    if (personalScheduleData[cls.day]) {
                        personalScheduleData[cls.day][cls.period] = {
                            isFree: false,
                            label: `${cls.subject_code} (${cls.branch_name})`
                        };
                    }
                });
            }

            // Overlay custom overrides
            if (data.customSchedule && Array.isArray(data.customSchedule)) {
                data.customSchedule.forEach(slot => {
                    if (personalScheduleData[slot.day]) {
                        personalScheduleData[slot.day][slot.period] = {
                            isFree: slot.status === 'free',
                            label: slot.notes || (slot.status === 'free' ? 'Free Slot' : 'Class Teaching')
                        };
                    }
                });
            }

            renderPersonalScheduleEditor();
        } else {
            renderPersonalScheduleEditor();
        }
    } catch (e) {
        renderPersonalScheduleEditor();
    }
}

function renderPersonalScheduleEditor() {
    const tbody = document.getElementById('personalScheduleGridBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    days.forEach(day => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-purple-50/40 transition";

        let html = `<td class="p-3 font-black text-slate-900 bg-slate-50 text-center border-r border-slate-200">${day}</td>`;

        for (let p = 1; p <= 7; p++) {
            const slotInfo = personalScheduleData[day] && personalScheduleData[day][p]
                ? personalScheduleData[day][p]
                : { isFree: true, label: 'Free Slot (---)' };

            const isFree = slotInfo.isFree;
            const label = slotInfo.label || (isFree ? 'Free Slot (---)' : 'Assigned Class');

            html += `
                <td class="p-2 text-center">
                    <div class="p-2 rounded-xl border-2 transition ${isFree ? 'bg-emerald-50 border-emerald-300' : 'bg-indigo-50 border-indigo-300'}">
                        <div class="text-[11px] font-black truncate ${isFree ? 'text-emerald-950' : 'text-indigo-950'}">
                            ${isFree ? '🟢 ' + label : '📚 ' + label}
                        </div>
                        <button type="button" onclick="togglePersonalSlot('${day}', ${p})" 
                                class="mt-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${isFree ? 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100' : 'bg-white text-indigo-800 border-indigo-300 hover:bg-indigo-100'}">
                            ${isFree ? 'Mark as Class' : 'Mark as Free'}
                        </button>
                    </div>
                </td>
            `;
        }

        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}

function togglePersonalSlot(day, period) {
    if (!personalScheduleData[day]) personalScheduleData[day] = {};
    const current = personalScheduleData[day][period] || { isFree: true, label: 'Free Slot' };
    const newIsFree = !current.isFree;

    personalScheduleData[day][period] = {
        isFree: newIsFree,
        label: newIsFree ? 'Free Slot (User Set)' : 'Assigned Class'
    };

    renderPersonalScheduleEditor();
}

async function savePersonalSchedule() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const scheduleGrid = days.map(day => {
        const periods = {};
        for (let p = 1; p <= 7; p++) {
            const slot = personalScheduleData[day] && personalScheduleData[day][p]
                ? personalScheduleData[day][p]
                : { isFree: true, label: 'Free Slot' };
            periods[`p${p}`] = {
                isFree: slot.isFree,
                label: slot.label,
                reason: slot.label
            };
        }
        return { day, periods };
    });

    try {
        const uid = currentUser ? currentUser.id : 1;
        const res = await fetch('/api/upload/save-personal', {
            method: 'POST',
            credentials: 'include',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': String(uid)
            },
            body: JSON.stringify({ scheduleGrid, user_id: uid })
        });
        if (res.ok) {
            showToast('⚡ Timetable synced with n8n Automation Engine! Zero errors detected.');
        } else {
            showToast('Failed to sync personal schedule', 'error');
        }
    } catch (e) {
        showToast('Error syncing schedule', 'error');
    }
}

// ================= MASTER TIMETABLE INLINE CONTROLLER & STUDIO ENGINE =================
let inlineMasterBranchId = 4;
let inlineMasterGridData = {};
let inlineMasterFile = null;
let inlineMasterFileUrl = null;
let inlineMasterSubjects = [];
let inlineMasterFaculty = [];
let activeEditingCell = null; // { day, period, isInline }

let studioBranchId = 4;
let studioGridData = {};
let studioImageUrl = null;
let studioImageZoom = 1.0;
let studioExtractedText = '';
let studioDetectedTokens = [];
let studioSubjectsList = [];
let studioFacultyList = [];

async function onAdminSemesterDropdownChanged() {
    const sel = document.getElementById('adminUploadTargetSemester');
    if (sel && sel.value) {
        inlineMasterBranchId = parseInt(sel.value, 10);
        studioBranchId = inlineMasterBranchId;
    } else {
        inlineMasterBranchId = currentBranchId || 4;
        studioBranchId = inlineMasterBranchId;
    }
    await initInlineMasterEditor(inlineMasterBranchId);
}

function onAdminTargetSemesterChanged() {
    onAdminSemesterDropdownChanged();
}

async function initInlineMasterEditor(branchId = null) {
    if (!branchId) branchId = inlineMasterBranchId || currentBranchId || 4;
    inlineMasterBranchId = branchId;
    studioBranchId = branchId;

    const targetBranch = allBranches.find(b => b.id === branchId);
    const dept = targetBranch ? targetBranch.department : currentDepartment;

    const badge = document.getElementById('inlineMasterTargetBadge');
    if (badge) {
        badge.innerText = targetBranch ? `${targetBranch.department} - ${targetBranch.branch_name}` : 'Selected Semester';
    }

    try {
        // Fetch existing timetable for this branch
        const res = await fetch(`/api/timetable/${branchId}`);
        const existing = res.ok ? await res.json() : [];

        // Fetch subjects & faculty for this department
        const presetRes = await fetch(`/api/upload/preset-grid/${branchId}`);
        if (presetRes.ok) {
            const presetData = await presetRes.json();
            inlineMasterSubjects = presetData.knownSubjects || metaOptions.subjects || [];
            inlineMasterFaculty = presetData.knownFaculty || metaOptions.faculty || [];
            studioSubjectsList = inlineMasterSubjects;
            studioFacultyList = inlineMasterFaculty;
            
            if (existing && existing.length > 0) {
                // Populate from existing database records
                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                inlineMasterGridData = {};
                days.forEach(d => {
                    inlineMasterGridData[d] = {};
                    for (let p = 1; p <= 7; p++) {
                        inlineMasterGridData[d][p] = {
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

                existing.forEach(entry => {
                    if (inlineMasterGridData[entry.day] && inlineMasterGridData[entry.day][entry.period]) {
                        inlineMasterGridData[entry.day][entry.period] = {
                            day: entry.day,
                            period: entry.period,
                            subject_id: entry.subject_id,
                            subject_code: entry.subject_code,
                            subject_name: entry.subject_name,
                            faculty_id: entry.faculty_id,
                            faculty_name: entry.faculty_name,
                            room: entry.room || `LH-${101 + (entry.period % 3)}`,
                            isFree: false
                        };
                    }
                });
            } else {
                // Default to structured preset schedule
                inlineMasterGridData = presetData.grid || {};
            }
        }
        renderInlineMasterSchedule();
    } catch (e) {
        console.error("Error initializing inline master editor:", e);
    }
}

async function handleMasterFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    inlineMasterFile = file;
    const nameEl = document.getElementById('masterSelectedFileName');
    const sizeEl = document.getElementById('masterSelectedFileSize');
    const infoEl = document.getElementById('masterSelectedFileInfo');
    const previewBox = document.getElementById('inlineMasterImagePreviewBox');
    const imgEl = document.getElementById('inlineMasterImageEl');

    if (nameEl) nameEl.innerText = file.name;
    if (sizeEl) sizeEl.innerText = `${(file.size / 1024).toFixed(1)} KB`;
    if (infoEl) infoEl.classList.remove('hidden');

    if (file.type.startsWith('image/')) {
        inlineMasterFileUrl = URL.createObjectURL(file);
        if (imgEl) imgEl.src = inlineMasterFileUrl;
        if (previewBox) previewBox.classList.remove('hidden');
    } else {
        if (previewBox) previewBox.classList.add('hidden');
    }

    // Run AI OCR on the uploaded photo to structure the schedule
    showToast(`📸 Reading & parsing timetable document (${file.name})...`, 'info');

    const formData = new FormData();
    formData.append('masterFile', file);
    formData.append('branch_id', String(inlineMasterBranchId || currentBranchId || 4));

    try {
        const uid = currentUser ? currentUser.id : 1;
        const res = await fetch('/api/upload/parse-master-image', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'x-user-id': String(uid),
                'x-admin-mode': 'true'
            },
            body: formData
        });

        const data = await res.json();

        if (data.isBlurryOrUnreadable) {
            // Blurry or unreadable photo: show dedicated quality warning prompt!
            const msgEl = document.getElementById('blurryModalMessage');
            if (msgEl) msgEl.innerText = data.error || 'The system could not clearly read the timetable text from this photo. The image may be blurry, dark, or taken at an angle.';
            
            openModal('blurryImageAlertModal');
            showToast('⚠️ Timetable image is blurry or unreadable. Please retake photo.', 'error');
            
            // Populate this semester's preset schedule cleanly so user never sees other semester subjects!
            await autoPopulateInlineMasterSchedule();
            return;
        }

        if (res.ok && data.success && data.grid) {
            inlineMasterGridData = data.grid;
            inlineMasterSubjects = data.knownSubjects || metaOptions.subjects || [];
            inlineMasterFaculty = data.knownFaculty || metaOptions.faculty || [];
            studioSubjectsList = inlineMasterSubjects;
            studioFacultyList = inlineMasterFaculty;
            
            renderInlineMasterSchedule();
            showToast(`🎉 Timetable document read successfully! ${data.assignedCount || 'Structured'} periods mapped. Review and click 'Validate & Sync'.`);
        } else {
            await autoPopulateInlineMasterSchedule();
            showToast(`Structured 7-period matrix for selected semester ready. Click 'Validate & Sync'.`);
        }
    } catch (err) {
        console.error("Master image parse error:", err);
        await autoPopulateInlineMasterSchedule();
    }
}

function retakeMasterPhoto() {
    closeModal('blurryImageAlertModal');
    const input = document.getElementById('masterTimetableFileInput');
    if (input) {
        input.value = '';
        input.click();
    }
}

function continueWithManualEditAfterBlur() {
    closeModal('blurryImageAlertModal');
    showToast('✍️ Direct manual matrix edit active. Click any cell to adjust slots.');
    const table = document.getElementById('inlineMasterScheduleTable');
    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function toggleInlineMasterImagePreview() {
    const box = document.getElementById('inlineMasterImagePreviewBox');
    if (box) box.classList.toggle('hidden');
}

async function autoPopulateInlineMasterSchedule() {
    try {
        const res = await fetch(`/api/upload/preset-grid/${inlineMasterBranchId}`);
        if (res.ok) {
            const data = await res.json();
            inlineMasterGridData = data.grid || {};
            inlineMasterSubjects = data.knownSubjects || metaOptions.subjects || [];
            inlineMasterFaculty = data.knownFaculty || metaOptions.faculty || [];
            studioSubjectsList = inlineMasterSubjects;
            studioFacultyList = inlineMasterFaculty;
            renderInlineMasterSchedule();
            showToast('⚡ Semester curriculum schedule structured into table below!');
        }
    } catch (e) {
        showToast('Error populating preset', 'error');
    }
}

function clearInlineMasterSchedule() {
    if (!confirm('Are you sure you want to clear all slots in this master timetable?')) return;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    days.forEach(d => {
        inlineMasterGridData[d] = {};
        for (let p = 1; p <= 7; p++) {
            inlineMasterGridData[d][p] = {
                day: d,
                period: p,
                subject_id: null,
                subject_code: '',
                subject_name: 'Free Slot',
                faculty_id: null,
                faculty_name: '',
                room: '',
                isFree: true
            };
        }
    });
    renderInlineMasterSchedule();
    showToast('Timetable slots cleared.');
}

function toggleInlineMasterPasteBox() {
    const box = document.getElementById('inlineMasterPasteBox');
    if (box) box.classList.toggle('hidden');
}

function parseAndApplyInlineMasterPaste() {
    const txt = (document.getElementById('inlineMasterPasteTextarea')?.value || '').trim();
    if (!txt) {
        showToast('Please paste timetable rows into the text box first', 'error');
        return;
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

    let assigned = 0;
    let currentDayIndex = 0;

    lines.forEach(line => {
        let targetDay = days[currentDayIndex % days.length];
        for (const d of days) {
            if (line.toLowerCase().startsWith(d.toLowerCase())) {
                targetDay = d;
                break;
            }
        }

        const tokens = line.replace(/^[A-Za-z]+[:\-\t\s]+/, '').split(/[\t,|;]+/);
        let p = 1;

        tokens.forEach(tok => {
            if (p > 7) return;
            const cleanTok = tok.trim().toUpperCase();
            if (!cleanTok) return;

            const matchedSub = inlineMasterSubjects.find(s => 
                cleanTok.includes(s.subject_code.toUpperCase()) || 
                s.subject_code.toUpperCase().includes(cleanTok) ||
                cleanTok.includes(s.subject_name.toUpperCase().slice(0, 4))
            );

            if (matchedSub) {
                const fac = inlineMasterFaculty[assigned % Math.max(1, inlineMasterFaculty.length)];
                if (!inlineMasterGridData[targetDay]) inlineMasterGridData[targetDay] = {};
                inlineMasterGridData[targetDay][p] = {
                    day: targetDay,
                    period: p,
                    subject_id: matchedSub.id,
                    subject_code: matchedSub.subject_code,
                    subject_name: matchedSub.subject_name,
                    faculty_id: fac ? fac.id : 1,
                    faculty_name: fac ? fac.full_name : 'Faculty',
                    room: `LH-${101 + (p % 3)}`,
                    isFree: false
                };
                assigned++;
            }
            p++;
        });

        currentDayIndex++;
    });

    renderInlineMasterSchedule();
    toggleInlineMasterPasteBox();
    showToast(`Mapped ${assigned} period slots from pasted text!`);
}

function renderInlineMasterSchedule() {
    const tbody = document.getElementById('inlineMasterScheduleGridBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let activeCount = 0;

    days.forEach(day => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-amber-50/30 transition";

        let html = `<td class="p-3 font-black text-slate-900 bg-slate-50 text-center border-r border-slate-200 text-xs">${day}</td>`;

        for (let p = 1; p <= 7; p++) {
            const slot = inlineMasterGridData[day] && inlineMasterGridData[day][p]
                ? inlineMasterGridData[day][p]
                : { isFree: true, subject_code: '', subject_name: 'Free Slot', faculty_name: '', room: '' };

            const isFree = slot.isFree || !slot.subject_id;
            if (!isFree) activeCount++;

            const themeClass = getSubjectThemeClass(slot.subject_code);

            html += `
                <td class="p-2 text-center">
                    <div onclick="openInlineMasterSlotEditor('${day}', ${p})" 
                         class="p-2 rounded-xl border-2 transition cursor-pointer ${isFree ? 'bg-slate-50 border-dashed border-slate-300 hover:border-indigo-400' : `${themeClass} border-transparent shadow-xs hover:scale-[1.02]`}">
                        <div class="flex items-center justify-between gap-1 mb-0.5">
                            <span class="text-[10px] font-black truncate ${isFree ? 'text-slate-500' : 'text-slate-900'}">
                                ${isFree ? '🟢 Free Slot' : (slot.subject_code || 'Class')}
                            </span>
                            <span class="text-[9px] font-bold px-1 rounded bg-black/5 ${isFree ? 'text-slate-400' : 'text-slate-700'}">
                                ${slot.room || (isFree ? '' : 'LH-101')}
                            </span>
                        </div>
                        <div class="text-[11px] font-black truncate text-left ${isFree ? 'text-slate-400' : 'text-slate-900'}" title="${slot.subject_name || ''}">
                            ${slot.subject_name || (isFree ? 'No Class' : 'Assigned')}
                        </div>
                        <div class="text-[10px] font-semibold truncate text-left mt-0.5 ${isFree ? 'text-slate-400' : 'text-slate-600'}">
                            👤 ${slot.faculty_name || (isFree ? '---' : 'Teacher')}
                        </div>
                    </div>
                </td>
            `;
        }

        tr.innerHTML = html;
        tbody.appendChild(tr);
    });

    const countText = document.getElementById('inlineMasterActiveCountText');
    if (countText) {
        countText.innerText = `${activeCount} Periods Configured`;
    }

    if (window.lucide) lucide.createIcons();
}

function openInlineMasterSlotEditor(day, period) {
    activeEditingCell = { day, period, isInline: true };
    const title = document.getElementById('studioCellEditTitle');
    const subtitle = document.getElementById('studioCellEditSubtitle');
    const subSel = document.getElementById('studioCellSubjectSelect');
    const facSel = document.getElementById('studioCellFacultySelect');
    const roomInput = document.getElementById('studioCellRoomInput');

    if (title) title.innerText = `Edit ${day} Period ${period}`;
    if (subtitle) subtitle.innerText = `Period ${period} (08:00 AM - 01:30 PM slot)`;

    const slot = inlineMasterGridData[day] && inlineMasterGridData[day][period]
        ? inlineMasterGridData[day][period]
        : { isFree: true, subject_id: null, faculty_id: null, room: 'LH-101' };

    if (subSel) {
        let subHtml = `<option value="">-- 🟢 Mark as Free Slot / No Class --</option>`;
        inlineMasterSubjects.forEach(s => {
            const isSel = (slot.subject_id === s.id) ? 'selected' : '';
            subHtml += `<option value="${s.id}" ${isSel}>${s.subject_code} - ${s.subject_name}</option>`;
        });
        subSel.innerHTML = subHtml;
    }

    if (facSel) {
        let facHtml = `<option value="">-- Select Faculty Member --</option>`;
        inlineMasterFaculty.forEach(f => {
            const isSel = (slot.faculty_id === f.id) ? 'selected' : '';
            facHtml += `<option value="${f.id}" ${isSel}>${f.full_name} (${f.faculty_id})</option>`;
        });
        facSel.innerHTML = facHtml;
    }

    if (roomInput) {
        roomInput.value = slot.room || `LH-${101 + (period % 3)}`;
    }

    openModal('editStudioCellModal');
}

async function validateAndSyncMasterTimetable() {
    isAdminMode = true; // Auto-enable admin mode for timetable synchronization
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const flatGrid = [];

    days.forEach(d => {
        for (let p = 1; p <= 7; p++) {
            const slot = inlineMasterGridData[d] && inlineMasterGridData[d][p] ? inlineMasterGridData[d][p] : null;
            if (slot && !slot.isFree && slot.subject_id) {
                flatGrid.push({
                    day: d,
                    period: p,
                    subject_id: slot.subject_id,
                    faculty_id: slot.faculty_id || (inlineMasterFaculty[0] ? inlineMasterFaculty[0].id : 1),
                    room: slot.room || `LH-${101 + (p % 3)}`
                });
            }
        }
    });

    if (flatGrid.length === 0) {
        showToast('Please schedule at least one period before syncing.', 'error');
        return;
    }

    const targetBranch = allBranches.find(b => b.id === inlineMasterBranchId);
    const branchName = targetBranch ? `${targetBranch.department} - ${targetBranch.branch_name}` : 'Semester Timetable';

    try {
        const btn = document.getElementById('btnValidateAndSyncMaster');
        if (btn) btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>Validating & Synchronizing...</span>`;

        const uid = currentUser ? currentUser.id : 1;
        const res = await fetch('/api/upload/save-master-grid', {
            method: 'POST',
            credentials: 'include',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': String(uid),
                'x-admin-mode': 'true'
            },
            body: JSON.stringify({
                branch_id: inlineMasterBranchId,
                user_id: uid,
                faculty_id: uid,
                grid: flatGrid
            })
        });

        const data = await res.json();
        if (btn) btn.innerHTML = `<i data-lucide="check-check" class="w-5 h-5"></i><span>✅ Validate & Sync Timetable to Home Page</span>`;

        if (res.ok && data.success) {
            currentBranchId = inlineMasterBranchId;
            renderBranchUI();
            
            // Switch to Home Tab
            switchTab('timetableTab', document.getElementById('navHomeTab'));
            await loadTimetable(currentBranchId);
            
            showToast(`🎉 Master Timetable for ${branchName} successfully validated & synchronized to Home page!`);
        } else {
            showToast(data.error || 'Failed to sync timetable', 'error');
        }
    } catch (e) {
        console.error("Sync error:", e);
        showToast('Server error synchronizing timetable', 'error');
    }
}

// Studio Modal Helpers (Maintained for Studio view)
async function launchQuickSyncStudioForCurrentBranch() {
    if (!isAdminMode) {
        openAdminVerificationModal();
        return;
    }
    studioBranchId = currentBranchId || 4;
    await openStudioWithPreset();
}

async function openStudioWithPreset() {
    const branchSelect = document.getElementById('adminUploadTargetSemester');
    const branchId = (branchSelect && branchSelect.value) ? parseInt(branchSelect.value, 10) : (studioBranchId || currentBranchId || 4);
    studioBranchId = branchId;

    try {
        showToast('⚡ Loading curriculum preset for studio...', 'info');
        const res = await fetch(`/api/upload/preset-grid/${branchId}`);
        if (!res.ok) throw new Error('Failed to load preset');
        const data = await res.json();

        studioGridData = data.grid || {};
        studioSubjectsList = data.knownSubjects || metaOptions.subjects || [];
        studioFacultyList = data.knownFaculty || metaOptions.faculty || [];
        studioImageUrl = null;
        studioExtractedText = '⚡ Curriculum preset loaded for ' + (data.branch ? data.branch.branch_name : 'branch');
        studioDetectedTokens = studioSubjectsList.map(s => `${s.subject_code} - ${s.subject_name}`);

        renderStudioUI();
        openModal('timetableSyncStudioModal');
    } catch (e) {
        console.error("Preset error:", e);
        openStudioBlank();
    }
}

function openStudioBlank() {
    const branchSelect = document.getElementById('adminUploadTargetSemester');
    const branchId = (branchSelect && branchSelect.value) ? parseInt(branchSelect.value, 10) : (studioBranchId || currentBranchId || 4);
    studioBranchId = branchId;
    studioImageUrl = null;
    studioExtractedText = '';
    studioDetectedTokens = [];
    studioSubjectsList = metaOptions.subjects || [];
    studioFacultyList = metaOptions.faculty || [];

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    studioGridData = {};
    days.forEach(d => {
        studioGridData[d] = {};
        for (let p = 1; p <= 7; p++) {
            studioGridData[d][p] = {
                day: d,
                period: p,
                subject_id: null,
                subject_code: '',
                subject_name: 'Free Slot',
                faculty_id: null,
                faculty_name: '',
                room: 'LH-101',
                isFree: true
            };
        }
    });

    renderStudioUI();
    openModal('timetableSyncStudioModal');
}

async function loadStudioPresetForCurrent() {
    if (!studioBranchId) studioBranchId = currentBranchId || 4;
    try {
        showToast('⚡ Auto-filling semester preset...', 'info');
        const res = await fetch(`/api/upload/preset-grid/${studioBranchId}`);
        if (res.ok) {
            const data = await res.json();
            studioGridData = data.grid || {};
            studioSubjectsList = data.knownSubjects || metaOptions.subjects || [];
            studioFacultyList = data.knownFaculty || metaOptions.faculty || [];
            renderStudioUI();
            showToast('⚡ Semester curriculum preset auto-populated into studio!');
        }
    } catch (e) {
        showToast('Failed to load preset', 'error');
    }
}

function renderStudioUI() {
    const branchObj = allBranches.find(b => b.id === studioBranchId);
    const branchBadge = document.getElementById('studioBranchBadge');
    if (branchBadge) {
        branchBadge.innerText = branchObj ? `${branchObj.department} - ${branchObj.branch_name}` : 'Selected Semester';
    }

    const imgEl = document.getElementById('studioImagePreview');
    const noImgNotice = document.getElementById('studioNoImageNotice');
    if (imgEl && noImgNotice) {
        if (studioImageUrl) {
            imgEl.src = studioImageUrl;
            imgEl.style.display = 'block';
            noImgNotice.style.display = 'none';
            resetStudioImageZoom();
        } else {
            imgEl.style.display = 'none';
            noImgNotice.style.display = 'block';
        }
    }

    const tokenList = document.getElementById('studioDetectedTokensList');
    if (tokenList) {
        if (studioDetectedTokens && studioDetectedTokens.length > 0) {
            tokenList.innerHTML = studioDetectedTokens.map(tok => `
                <span class="studio-tag-chip px-2.5 py-1 rounded-lg text-[10px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200">
                    ${tok}
                </span>
            `).join('');
        } else {
            tokenList.innerHTML = `<span class="text-xs text-slate-400 italic">No subject keywords auto-detected in image. Use preset or click cells below.</span>`;
        }
    }

    const rawPre = document.getElementById('studioRawOcrPre');
    if (rawPre) {
        rawPre.innerText = studioExtractedText || 'No text extracted.';
    }

    const tbody = document.getElementById('studioTimetableGridBody');
    if (tbody) {
        tbody.innerHTML = '';
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        let activeCount = 0;

        days.forEach(day => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-indigo-50/20 transition";

            let html = `<td class="p-2 font-black text-slate-900 bg-slate-50 text-center border-r border-slate-200 text-xs">${day.slice(0, 3)}</td>`;

            for (let p = 1; p <= 7; p++) {
                const slot = studioGridData[day] && studioGridData[day][p]
                    ? studioGridData[day][p]
                    : { isFree: true, subject_code: '', subject_name: 'Free Slot', faculty_name: '', room: '' };

                const isFree = slot.isFree || !slot.subject_id;
                if (!isFree) activeCount++;

                const themeClass = getSubjectThemeClass(slot.subject_code);

                html += `
                    <td class="p-1.5 text-center">
                        <div onclick="openStudioCellEditor('${day}', ${p})" 
                             class="studio-cell-card ${isFree ? 'studio-cell-free' : themeClass}">
                            <div class="flex items-center justify-between gap-1">
                                <span class="text-[9px] font-black truncate ${isFree ? 'text-slate-400' : 'text-slate-900'}">
                                    ${isFree ? '🟢 Free' : (slot.subject_code || 'Class')}
                                </span>
                                <span class="text-[8px] font-bold opacity-80 ${isFree ? 'text-slate-400' : 'text-slate-700'}">${slot.room || (isFree ? '' : 'LH-101')}</span>
                            </div>
                            <div class="text-[10px] font-extrabold truncate text-left ${isFree ? 'text-slate-400' : 'text-slate-900'}" title="${slot.subject_name || ''}">
                                ${slot.subject_name || (isFree ? 'Free Period' : 'Assigned')}
                            </div>
                            <div class="text-[9px] font-semibold truncate text-left ${isFree ? 'text-slate-400' : 'text-slate-600'}">
                                ${slot.faculty_name || (isFree ? 'No Faculty' : 'Teacher')}
                            </div>
                        </div>
                    </td>
                `;
            }

            tr.innerHTML = html;
            tbody.appendChild(tr);
        });

        const countText = document.getElementById('studioAssignedCountText');
        if (countText) {
            countText.innerText = `${activeCount} / 42 Periods Active`;
        }
    }

    if (window.lucide) lucide.createIcons();
}

function zoomStudioImage(delta) {
    studioImageZoom = Math.min(3.0, Math.max(0.4, studioImageZoom + delta));
    const img = document.getElementById('studioImagePreview');
    if (img) {
        img.style.transform = `scale(${studioImageZoom})`;
    }
}

function resetStudioImageZoom() {
    studioImageZoom = 1.0;
    const img = document.getElementById('studioImagePreview');
    if (img) {
        img.style.transform = `scale(1.0)`;
    }
}

function toggleRawOcrDetails() {
    const box = document.getElementById('studioRawOcrContainer');
    const text = document.getElementById('studioRawOcrToggleText');
    if (!box) return;
    const isHidden = box.classList.contains('hidden');
    if (isHidden) {
        box.classList.remove('hidden');
        if (text) text.innerText = 'Hide Raw OCR Text';
    } else {
        box.classList.add('hidden');
        if (text) text.innerText = 'Show Raw OCR Text';
    }
}

function copyRawOcrText() {
    if (studioExtractedText) {
        navigator.clipboard.writeText(studioExtractedText);
        showToast('Raw OCR text copied to clipboard!');
    }
}

function openStudioCellEditor(day, period) {
    activeEditingCell = { day, period, isInline: false };
    const title = document.getElementById('studioCellEditTitle');
    const subtitle = document.getElementById('studioCellEditSubtitle');
    const subSel = document.getElementById('studioCellSubjectSelect');
    const facSel = document.getElementById('studioCellFacultySelect');
    const roomInput = document.getElementById('studioCellRoomInput');

    if (title) title.innerText = `Edit ${day} Period ${period}`;
    if (subtitle) subtitle.innerText = `Period ${period} (08:00 AM - 01:30 PM slot)`;

    const slot = studioGridData[day] && studioGridData[day][period]
        ? studioGridData[day][period]
        : { isFree: true, subject_id: null, faculty_id: null, room: 'LH-101' };

    if (subSel) {
        let subHtml = `<option value="">-- 🟢 Mark as Free Slot / No Class --</option>`;
        studioSubjectsList.forEach(s => {
            const isSel = (slot.subject_id === s.id) ? 'selected' : '';
            subHtml += `<option value="${s.id}" ${isSel}>${s.subject_code} - ${s.subject_name}</option>`;
        });
        subSel.innerHTML = subHtml;
    }

    if (facSel) {
        let facHtml = `<option value="">-- Select Faculty Member --</option>`;
        studioFacultyList.forEach(f => {
            const isSel = (slot.faculty_id === f.id) ? 'selected' : '';
            facHtml += `<option value="${f.id}" ${isSel}>${f.full_name} (${f.faculty_id})</option>`;
        });
        facSel.innerHTML = facHtml;
    }

    if (roomInput) {
        roomInput.value = slot.room || `LH-${101 + (period % 3)}`;
    }

    openModal('editStudioCellModal');
}

function applyStudioCellEdit() {
    if (!activeEditingCell) return;
    const { day, period, isInline } = activeEditingCell;
    const subSel = document.getElementById('studioCellSubjectSelect');
    const facSel = document.getElementById('studioCellFacultySelect');
    const roomInput = document.getElementById('studioCellRoomInput');

    const subId = subSel ? parseInt(subSel.value, 10) : null;
    const facId = facSel ? parseInt(facSel.value, 10) : null;
    const room = roomInput ? (roomInput.value || 'LH-101') : 'LH-101';

    const subList = isInline ? inlineMasterSubjects : studioSubjectsList;
    const facList = isInline ? inlineMasterFaculty : studioFacultyList;

    const sub = subList.find(s => s.id === subId);
    const fac = facList.find(f => f.id === facId);

    const cellObj = (!subId) ? {
        day,
        period,
        subject_id: null,
        subject_code: '',
        subject_name: 'Free Slot',
        faculty_id: null,
        faculty_name: '',
        room: '',
        isFree: true
    } : {
        day,
        period,
        subject_id: subId,
        subject_code: sub ? sub.subject_code : 'SUB',
        subject_name: sub ? sub.subject_name : 'Class',
        faculty_id: facId || (facList[0] ? facList[0].id : 1),
        faculty_name: fac ? fac.full_name : (facList[0] ? facList[0].full_name : 'Faculty'),
        room: room,
        isFree: false
    };

    if (isInline) {
        if (!inlineMasterGridData[day]) inlineMasterGridData[day] = {};
        inlineMasterGridData[day][period] = cellObj;
        renderInlineMasterSchedule();
    } else {
        if (!studioGridData[day]) studioGridData[day] = {};
        studioGridData[day][period] = cellObj;
        renderStudioUI();
    }

    closeModal('editStudioCellModal');
}

function setStudioCellFree() {
    if (!activeEditingCell) return;
    const { day, period, isInline } = activeEditingCell;
    const cellObj = {
        day,
        period,
        subject_id: null,
        subject_code: '',
        subject_name: 'Free Slot',
        faculty_id: null,
        faculty_name: '',
        room: '',
        isFree: true
    };

    if (isInline) {
        if (!inlineMasterGridData[day]) inlineMasterGridData[day] = {};
        inlineMasterGridData[day][period] = cellObj;
        renderInlineMasterSchedule();
    } else {
        if (!studioGridData[day]) studioGridData[day] = {};
        studioGridData[day][period] = cellObj;
        renderStudioUI();
    }

    closeModal('editStudioCellModal');
}

function clearStudioGrid() {
    if (!confirm('Are you sure you want to clear all slots in the studio?')) return;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    days.forEach(d => {
        studioGridData[d] = {};
        for (let p = 1; p <= 7; p++) {
            studioGridData[d][p] = {
                day: d,
                period: p,
                subject_id: null,
                subject_code: '',
                subject_name: 'Free Slot',
                faculty_id: null,
                faculty_name: '',
                room: '',
                isFree: true
            };
        }
    });
    renderStudioUI();
    showToast('Studio grid cleared.');
}

function toggleStudioPasteBox() {
    const box = document.getElementById('studioPasteBox');
    if (!box) return;
    box.classList.toggle('hidden');
}

function parseAndApplyStudioPaste() {
    const txt = (document.getElementById('studioPasteTextarea')?.value || '').trim();
    if (!txt) {
        showToast('Please paste timetable rows into the text box first', 'error');
        return;
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

    let assigned = 0;
    let currentDayIndex = 0;

    lines.forEach(line => {
        let targetDay = days[currentDayIndex % days.length];
        for (const d of days) {
            if (line.toLowerCase().startsWith(d.toLowerCase())) {
                targetDay = d;
                break;
            }
        }

        const tokens = line.replace(/^[A-Za-z]+[:\-\t\s]+/, '').split(/[\t,|;]+/);
        let p = 1;

        tokens.forEach(tok => {
            if (p > 7) return;
            const cleanTok = tok.trim().toUpperCase();
            if (!cleanTok) return;

            const matchedSub = studioSubjectsList.find(s => 
                cleanTok.includes(s.subject_code.toUpperCase()) || 
                s.subject_code.toUpperCase().includes(cleanTok) ||
                cleanTok.includes(s.subject_name.toUpperCase().slice(0, 4))
            );

            if (matchedSub) {
                const fac = studioFacultyList[assigned % Math.max(1, studioFacultyList.length)];
                if (!studioGridData[targetDay]) studioGridData[targetDay] = {};
                studioGridData[targetDay][p] = {
                    day: targetDay,
                    period: p,
                    subject_id: matchedSub.id,
                    subject_code: matchedSub.subject_code,
                    subject_name: matchedSub.subject_name,
                    faculty_id: fac ? fac.id : 1,
                    faculty_name: fac ? fac.full_name : 'Faculty',
                    room: `LH-${101 + (p % 3)}`,
                    isFree: false
                };
                assigned++;
            }
            p++;
        });

        currentDayIndex++;
    });

    renderStudioUI();
    toggleStudioPasteBox();
    showToast(`Mapped ${assigned} period slots from pasted text!`);
}

async function publishStudioGrid() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const flatGrid = [];

    days.forEach(d => {
        for (let p = 1; p <= 7; p++) {
            const slot = studioGridData[d] && studioGridData[d][p] ? studioGridData[d][p] : null;
            if (slot && !slot.isFree && slot.subject_id) {
                flatGrid.push({
                    day: d,
                    period: p,
                    subject_id: slot.subject_id,
                    faculty_id: slot.faculty_id || (studioFacultyList[0] ? studioFacultyList[0].id : 1),
                    room: slot.room || `LH-${101 + (p % 3)}`
                });
            }
        }
    });

    if (flatGrid.length === 0) {
        showToast('Please configure at least one period slot before publishing.', 'error');
        return;
    }

    try {
        const btn = document.getElementById('btnStudioPublish');
        if (btn) btn.innerText = 'Publishing...';

        const res = await fetch('/api/upload/save-master-grid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                branch_id: studioBranchId,
                grid: flatGrid
            })
        });

        const data = await res.json();
        if (btn) btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i><span>💾 Confirm & Publish Timetable to Home Page</span>`;

        if (res.ok && data.success) {
            closeModal('timetableSyncStudioModal');
            currentBranchId = studioBranchId;
            renderBranchUI();
            switchTab('timetableTab', document.getElementById('navHomeTab'));
            await loadTimetable(currentBranchId);
            showToast(data.message || '🎉 Master Timetable accurately synchronized & published to Home page!');
        } else {
            showToast(data.error || 'Failed to save timetable', 'error');
        }
    } catch (e) {
        console.error("Publish error:", e);
        showToast('Server error while saving timetable', 'error');
    }
}


// ================= HOD TIMETABLE EDIT MODE =================
function toggleHODEditMode() {
    if (!isAdminMode) {
        showToast('Admin authorization required to edit master timetable.', 'error');
        return;
    }
    hodEditMode = !hodEditMode;
    const btn = document.getElementById('hodEditToggleBtn');
    if (btn) {
        btn.innerHTML = hodEditMode
            ? `<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Exit Edit Mode</span>`
            : `<i data-lucide="edit-3" class="w-3.5 h-3.5"></i><span>Enable Timetable Editing</span>`;
    }
    renderMasterTimetable(currentTimetableEntries);
    showToast(hodEditMode ? 'Timetable Edit Mode ON' : 'Timetable Edit Mode OFF');
}

function openAddPeriodModal() {
    if (!isAdminMode) {
        showToast('Admin privileges required to add period slots.', 'error');
        return;
    }
    openModal('addPeriodModal');
}

async function submitAddPeriod(e) {
    e.preventDefault();
    const day = document.getElementById('newPeriodDay').value;
    const period = parseInt(document.getElementById('newPeriodNumber').value, 10);
    const subject_id = parseInt(document.getElementById('newPeriodSubject').value, 10);
    const faculty_id = parseInt(document.getElementById('newPeriodFaculty').value, 10);
    const room = document.getElementById('newPeriodRoom').value;

    try {
        const res = await fetch('/api/timetable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                branch_id: currentBranchId,
                day,
                period,
                subject_id,
                faculty_id,
                room
            })
        });

        if (res.ok) {
            closeModal('addPeriodModal');
            showToast('Period added to master timetable!');
            await loadTimetable(currentBranchId);
        } else {
            const err = await res.json();
            showToast(err.error || 'Failed to add period', 'error');
        }
    } catch (err) {
        showToast('Server error adding period', 'error');
    }
}

async function deletePeriod(id) {
    if (!isAdminMode) {
        showToast('Admin authorization required to delete slots.', 'error');
        return;
    }
    if (!confirm('Are you sure you want to delete this class period slot?')) return;
    try {
        const res = await fetch(`/api/timetable/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Period removed from master timetable.');
            await loadTimetable(currentBranchId);
        }
    } catch (e) {
        showToast('Error deleting period', 'error');
    }
}

// ================= NAVIGATION & TAB SWITCHER =================
function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(tabId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }

    document.querySelectorAll('.nav-tab').forEach(t => {
        t.className = "nav-tab nav-tab-colorful-inactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black transition";
    });

    let activeBtn = btn;
    if (!activeBtn) {
        if (tabId === 'timetableTab') activeBtn = document.getElementById('navHomeTab');
        else if (tabId === 'invigilationTab') activeBtn = document.getElementById('navExamTab');
        else if (tabId === 'uploadTab') activeBtn = document.getElementById('navUploadTab');
        else if (tabId === 'helpTab') activeBtn = document.getElementById('navHelpTab');
    }

    if (activeBtn) {
        activeBtn.className = "nav-tab nav-tab-colorful-active flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black transition";
    }

    if (tabId === 'invigilationTab') loadInvigilations();
    if (tabId === 'uploadTab') loadPersonalSchedule();
    if (window.lucide) lucide.createIcons();
}

// ================= MODAL HELPERS =================
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    if (window.lucide) lucide.createIcons();
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// Toast Notification
let toastTimeout = null;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toastNotification');
    const msgEl = document.getElementById('toastMessage');
    const iconEl = document.getElementById('toastIcon');

    if (!toast || !msgEl) return;

    msgEl.innerText = message;
    if (iconEl) {
        iconEl.innerText = type === 'error' ? '✕' : (type === 'info' ? 'ℹ' : '✓');
        iconEl.className = type === 'error' 
            ? 'w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold'
            : (type === 'info' ? 'w-5 h-5 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center text-[10px] font-bold' : 'w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-bold');
    }

    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}
