const jwt = require('jsonwebtoken');
const getAuthConfig = require('../config/auth');

module.exports = function verifyToken(req, res, next) {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ message: 'A Bearer token is required' });
    try {
        req.user = jwt.verify(match[1], getAuthConfig().secret, { algorithms: ['HS256'] });
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
