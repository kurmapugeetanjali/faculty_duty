const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./database/database'); // Initializes Postgres DB

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session Configuration
app.use(session({
    secret: 'super_secret_faculty_scheduler_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Routes
const authRoutes = require('./routes/auth');
const timetableRoutes = require('./routes/timetable');
const substitutionsRoutes = require('./routes/substitutions');
const invigilationRoutes = require('./routes/invigilation');
const uploadRoutes = require('./routes/upload');
const n8nRoutes = require('./routes/n8n');

app.use('/api/auth', authRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/substitutions', substitutionsRoutes);
app.use('/api/invigilation', invigilationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/n8n', n8nRoutes);

// Fallback to serve index.html for unknown routes (SPA like behavior)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Process Error Handlers to keep the server rock-solid
process.on('uncaughtException', (err) => {
    console.error('Unhandled process exception (caught):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.warn('Unhandled promise rejection (caught):', reason);
});

// Start Server on all network interfaces for mobile access
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running smoothly!`);
    console.log(`💻 Computer: http://localhost:${PORT}`);
    console.log(`📱 Mobile:   http://10.57.129.246:${PORT}`);
});
