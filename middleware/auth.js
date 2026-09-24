function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
}

function requireHOS(req, res, next) {
    if (req.session && req.session.userId && (req.session.role === 'hos' || req.session.isAdminElevated)) {
        return next();
    }
    return res.status(403).json({ error: 'Forbidden: Admin / HOD access required' });
}

function requireFaculty(req, res, next) {
    if (req.session && req.session.userId && (req.session.role === 'faculty' || req.session.role === 'hos')) {
        return next();
    }
    return res.status(403).json({ error: 'Forbidden: Faculty access required' });
}

module.exports = {
    requireAuth,
    requireHOS,
    requireFaculty
};
