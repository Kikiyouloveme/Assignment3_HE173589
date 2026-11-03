const express = require('express');
const jwt = require('jsonwebtoken');
const getAuthConfig = require('./config/auth');
const verifyToken = require('./middleware/verifyToken');
const controller = require('./controllers/attendanceController');
const app = express();
app.use(express.json());
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get('/', (req, res) => res.json({ message: 'Student Attendance Management API' }));
app.post('/api/auth/login', (req, res, next) => {
    const { email, password } = req.body || {};
    const config = getAuthConfig();
    if (!email || !password || email !== config.email || password !== config.password) {
        return res.status(401).json({ message: 'Invalid email or password' });
    }
    try {
        const token = jwt.sign({ studentId: config.studentId, email }, config.secret,
            { algorithm: 'HS256', expiresIn: '1h' });
        res.json({ message: 'Login successful', token });
    } catch (error) { next(error); }
});

app.use('/api', verifyToken);
app.get('/api/classes/:classId/students', asyncHandler(controller.getStudents));
app.get('/api/classes/:classId/attendance-summary', asyncHandler(controller.getSummary));
app.get('/api/students/:studentId/attendances', asyncHandler(controller.getHistory));
app.post('/api/classes/:classId/attendances', asyncHandler(controller.saveAttendances));
app.use((req, res) => res.status(404).json({ message: 'Endpoint not found' }));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.code === 11000 ? 409 : (error.status || 500);
    if (status === 500) console.error(error);
    res.status(status).json({ message: status === 500 ? 'Internal server error' :
        error.code === 11000 ? 'Conflicting attendance record; retry the request' : error.message });
});
module.exports = app;
