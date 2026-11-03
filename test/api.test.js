const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { seed } = require('../scripts/seed');
const { Student, Class, Attendance } = require('../models');
const app = require('../app');

let database, databaseDirectory, server, base, token;
const classId = '65bb00000000000000000001';
const studentId = '65dd00000000000000000001';
const missingId = '000000000000000000000000';
const classPath = `/api/classes/${classId}`;
const records = [1, 2, 3].map(n => ({
    studentId: `65dd0000000000000000000${n}`, status: n === 1 ? 'PRESENT' : 'ABSENT'
}));

async function request(path, { method = 'GET', body, auth = token } = {}) {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    assert.match(response.headers.get('content-type'), /application\/json/);
    return { status: response.status, body: await response.json() };
}

before(async () => {
    process.env.JWT_SECRET = 'isolated-test-secret';
    process.env.TEST_EMAIL = 'masv@fpt.edu.vn';
    process.env.TEST_PASSWORD = 'masv@123';
    process.env.TEST_STUDENT_ID = studentId;
    const port = await new Promise(resolve => {
        const listener = net.createServer();
        listener.listen(0, '127.0.0.1', () => {
            const port = listener.address().port;
            listener.close(() => resolve(port));
        });
    });
    databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'assignment3-test-'));
    const installed = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
    const binary = process.env.MONGOD_BINARY || (fs.existsSync(installed) ? installed : 'mongod');
    database = spawn(binary, ['--dbpath', databaseDirectory, '--port', String(port), '--bind_ip', '127.0.0.1'],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let startupError;
    let databaseLog = '';
    database.on('error', error => { startupError = error; });
    database.stdout.on('data', chunk => { databaseLog = (databaseLog + chunk).slice(-16000); });
    database.stderr.on('data', chunk => { databaseLog = (databaseLog + chunk).slice(-16000); });
    let connected = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        if (startupError) throw startupError;
        if (database.exitCode !== null) throw new Error(`Test MongoDB exited with ${database.exitCode}: ${databaseLog}`);
        try {
            await mongoose.connect(`mongodb://127.0.0.1:${port}/Assignment3_test`, { serverSelectionTimeoutMS: 1000 });
            connected = true;
            break;
        } catch { /* Retry while the isolated database starts. */ }
    }
    assert.ok(connected, 'Test MongoDB did not start');
    await seed();
    server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}`;
    const login = await request('/api/auth/login', {
        method: 'POST', body: { email: 'masv@fpt.edu.vn', password: 'masv@123' }
    });
    assert.equal(login.status, 200);
    token = login.body.token;
}, { timeout: 180000 });

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (database && database.exitCode === null && database.pid) {
        await new Promise(resolve => { database.once('exit', resolve); database.kill(); });
    }
    if (databaseDirectory) {
        // Only remove the unique test directory directly inside the system temp folder.
        assert.equal(path.dirname(path.resolve(databaseDirectory)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(databaseDirectory).startsWith('assignment3-test-'));
        fs.rmSync(databaseDirectory, { recursive: true, force: true });
    }
});

test('login validates credentials and creates a one-hour JWT containing studentId', async () => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(decoded.studentId, studentId);
    assert.equal(decoded.exp - decoded.iat, 3600);
    for (const body of [{}, { email: 'masv@fpt.edu.vn' }, { email: 'masv@fpt.edu.vn', password: 'wrong' }]) {
        assert.equal((await request('/api/auth/login', { method: 'POST', body })).status, 401);
    }
});

test('all attendance routes reject missing, invalid, and expired tokens', async () => {
    const expired = jwt.sign({ studentId }, process.env.JWT_SECRET, { expiresIn: -1 });
    for (const path of [`${classPath}/students`, `${classPath}/attendance-summary`, `/api/students/${studentId}/attendances`, `${classPath}/attendances`]) {
        for (const auth of ['', 'invalid', expired]) {
            assert.equal((await request(path, { auth, method: path === `${classPath}/attendances` ? 'POST' : 'GET' })).status, 401);
        }
    }
    const response = await fetch(`${base}${classPath}/students`, { headers: { Authorization: `Basic ${token}` } });
    assert.equal(response.status, 401);
});

test('class roster defaults to enrolled and supports case-insensitive filtering', async () => {
    const response = await request(`${classPath}/students`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.map(s => s.studentCode), ['SE001', 'SE002', 'SE003']);
    assert.deepEqual(Object.keys(response.body[0]).sort(), ['email', 'fullName', 'studentCode', 'studentId']);
    for (const status of ['enrolled', 'EnRoLlEd']) {
        const filtered = await request(`${classPath}/students?status=${status}`);
        assert.equal(filtered.status, 200);
        assert.deepEqual(filtered.body, response.body);
    }
    const dropped = await request(`${classPath}/students?status=DrOpPeD`);
    assert.deepEqual(dropped.body.map(s => s.studentCode), ['SE004']);
    for (const query of ['status=invalid', 'status=', 'status=enrolled&status=dropped']) {
        assert.equal((await request(`${classPath}/students?${query}`)).status, 400);
    }
});

test('invalid IDs return 400 and missing resources return 404', async () => {
    for (const endpoint of ['students', 'attendance-summary', 'attendances']) {
        const method = endpoint === 'attendances' ? 'POST' : 'GET';
        assert.equal((await request(`/api/classes/bad/${endpoint}`, { method })).status, 400);
        assert.equal((await request(`/api/classes/${missingId}/${endpoint}`, { method })).status, 404);
    }
    assert.equal((await request('/api/students/bad/attendances')).status, 400);
    assert.equal((await request(`/api/students/${missingId}/attendances`)).status, 404);
});

test('summary matches the provided 90%, 70%, 60% example', async () => {
    const response = await request(`${classPath}/attendance-summary`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.map(({ totalSessions, present, absent, attendanceRate, warning }) =>
        ({ totalSessions, present, absent, attendanceRate, warning })), [
        { totalSessions: 10, present: 9, absent: 1, attendanceRate: 90, warning: false },
        { totalSessions: 10, present: 7, absent: 3, attendanceRate: 70, warning: true },
        { totalSessions: 10, present: 6, absent: 4, attendanceRate: 60, warning: true }
    ]);
});

test('students with no records remain in summary and have empty history', async () => {
    const student = await Student.create({ studentCode: 'EMPTY', fullName: 'No Attendance', email: 'empty@example.test' });
    await Class.updateOne({ _id: classId }, { $push: { enrollments: { studentId: student._id, status: 'ENROLLED' } } });
    try {
        const summary = await request(`${classPath}/attendance-summary`);
        const row = summary.body.find(item => item.studentId === String(student._id));
        assert.equal(row.totalSessions, 0);
        assert.equal(row.present, 0);
        assert.equal(row.absent, 0);
        assert.equal(row.attendanceRate, 0);
        assert.equal(row.warning, true);
        assert.deepEqual((await request(`/api/students/${student._id}/attendances`)).body, []);
    } finally {
        await Class.updateOne({ _id: classId }, { $pull: { enrollments: { studentId: student._id } } });
        await Student.deleteOne({ _id: student._id });
    }
});

test('history joins subject names across classes and sorts newest first', async () => {
    const response = await request(`/api/students/${studentId}/attendances`);
    assert.equal(response.status, 200);
    assert.ok(new Set(response.body.map(item => item.className)).size > 1);
    for (const row of response.body) {
        assert.ok(row.className && row.subjectName && row.date && row.status);
    }
    assert.deepEqual(response.body.map(row => row.date), response.body.map(row => row.date).sort().reverse());
});

test('batch rejects invalid dates, missing students, duplicates and bad statuses before writing', async () => {
    const beforeCount = await Attendance.countDocuments();
    const invalidBodies = [
        {}, { records }, { date: '2026-02-30', records }, { date: '2099-01-01', records },
        { date: 'invalid', records }, { date: '2026-03-17', records: [] },
        { date: '2026-03-17', records: records.slice(0, 2) },
        { date: '2026-03-17', records: [...records, records[0]] },
        { date: '2026-03-17', records: [null] },
        { date: '2026-03-17', records: [{ studentId: 'bad', status: 'PRESENT' }] },
        { date: '2026-03-17', records: records.map(r => ({ ...r, status: 'present' })) },
        { date: '2026-03-17', records: [...records, { studentId: '65dd00000000000000000004', status: 'PRESENT' }] }
    ];
    for (const body of invalidBodies) {
        assert.equal((await request(`${classPath}/attendances`, { method: 'POST', body })).status, 400, JSON.stringify(body));
    }
    assert.equal(await Attendance.countDocuments(), beforeCount);
});

test('batch inserts and then updates the same day without creating duplicates', async () => {
    const body = { date: '2026-03-17', records };
    const inserted = await request(`${classPath}/attendances`, { method: 'POST', body });
    assert.equal(inserted.status, 200);
    assert.equal(inserted.body.upsertedCount, 3);
    const updated = await request(`${classPath}/attendances`, {
        method: 'POST', body: { ...body, records: records.map(r => ({ ...r, status: 'PRESENT' })) }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.upsertedCount, 0);
    assert.equal(updated.body.matchedCount, 3);
    const saved = await Attendance.find({ classId, date: new Date('2026-03-17') });
    assert.equal(saved.length, 3);
    assert.ok(saved.every(r => r.status === 'PRESENT'));
    await seed();
    assert.equal(await Attendance.countDocuments({ classId, date: new Date('2026-03-17') }), 3);
});

test('malformed JSON and unknown routes return JSON errors', async () => {
    const malformed = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken'
    });
    assert.equal(malformed.status, 400);
    assert.ok((await malformed.json()).message);
    assert.equal((await request('/unknown')).status, 404);
});
