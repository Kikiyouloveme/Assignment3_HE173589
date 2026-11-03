const { Student, Class, Attendance } = require('../models');

function fail(status, message) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

function validateId(id, name) {
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
        fail(400, `${name} must be a valid ObjectId`);
    }
}

async function findClass(id) {
    validateId(id, 'classId');
    const classroom = await Class.findById(id).lean();
    if (!classroom) fail(404, 'Class not found');
    return classroom;
}

function enrollmentsFor(classroom, status) {
    return classroom.enrollments.filter(entry => entry.status.toUpperCase() === status);
}

function studentFields(student) {
    return {
        studentId: student._id,
        studentCode: student.studentCode,
        fullName: student.fullName,
        email: student.email
    };
}

exports.getStudents = async (req, res) => {
    const classroom = await findClass(req.params.classId);
    const status = req.query.status === undefined ? 'ENROLLED' : req.query.status;
    if (typeof status !== 'string' || !['ENROLLED', 'DROPPED'].includes(status.toUpperCase())) {
        fail(400, 'status must be enrolled or dropped');
    }
    const ids = enrollmentsFor(classroom, status.toUpperCase()).map(entry => entry.studentId);
    const students = await Student.find({ _id: { $in: ids } }).sort({ studentCode: 1 }).lean();
    res.json(students.map(studentFields));
};

exports.getSummary = async (req, res) => {
    const classroom = await findClass(req.params.classId);
    const ids = enrollmentsFor(classroom, 'ENROLLED').map(entry => entry.studentId);
    const [students, statistics] = await Promise.all([
        Student.find({ _id: { $in: ids } }).sort({ studentCode: 1 }).lean(),
        Attendance.aggregate([
            { $match: { classId: classroom._id, studentId: { $in: ids } } },
            { $group: {
                _id: '$studentId',
                totalSessions: { $sum: 1 },
                present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
                absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } }
            } }
        ])
    ]);
    const byStudent = new Map(statistics.map(row => [String(row._id), row]));
    res.json(students.map(student => {
        const { totalSessions = 0, present = 0, absent = 0 } = byStudent.get(String(student._id)) || {};
        const attendanceRate = totalSessions ? Number((present / totalSessions * 100).toFixed(1)) : 0;
        return { ...studentFields(student), totalSessions, present, absent, attendanceRate, warning: attendanceRate < 80 };
    }));
};

exports.getHistory = async (req, res) => {
    const { studentId } = req.params;
    validateId(studentId, 'studentId');
    if (!await Student.exists({ _id: studentId })) fail(404, 'Student not found');
    const records = await Attendance.find({ studentId })
        .sort({ date: -1, _id: 1 })
        .populate({ path: 'classId', populate: { path: 'subjectId' } }).lean();
    res.json(records.map(record => ({
        className: record.classId?.className ?? null,
        subjectName: record.classId?.subjectId?.name ?? null,
        date: record.date,
        status: record.status
    })));
};

exports.saveAttendances = async (req, res) => {
    const classroom = await findClass(req.params.classId);
    const { date, records } = req.body || {};
    // A session is a calendar day, stored consistently at midnight UTC.
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        fail(400, 'date must be a valid date in YYYY-MM-DD format');
    }
    const sessionDate = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(sessionDate.getTime()) || sessionDate.toISOString().slice(0, 10) !== date) {
        fail(400, 'date must be a valid calendar date');
    }
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    if (date > today) fail(400, 'date must not be in the future');
    if (!Array.isArray(records) || records.length === 0) fail(400, 'records must be a non-empty array');

    const enrolled = new Set(enrollmentsFor(classroom, 'ENROLLED').map(entry => String(entry.studentId)));
    const submitted = new Set();
    for (const record of records) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) fail(400, 'Invalid attendance record');
        validateId(record.studentId, 'studentId');
        const id = record.studentId.toLowerCase();
        if (submitted.has(id)) fail(400, 'Duplicate studentId in records');
        if (!enrolled.has(id)) fail(400, 'Every student must be ENROLLED in this class');
        if (!['PRESENT', 'ABSENT'].includes(record.status)) fail(400, 'status must be PRESENT or ABSENT');
        submitted.add(id);
    }
    if (submitted.size !== enrolled.size) fail(400, 'Include all students currently ENROLLED in the class');
    if (await Student.countDocuments({ _id: { $in: [...submitted] } }) !== submitted.size) {
        fail(400, 'One or more students do not exist');
    }

    // Validate the complete request before any writes. Unique index prevents duplicates.
    const result = await Attendance.bulkWrite(records.map(record => ({
        updateOne: {
            filter: { classId: classroom._id, studentId: record.studentId, date: sessionDate },
            update: { $set: { status: record.status } },
            upsert: true
        }
    })));
    res.json({ message: 'Attendance saved successfully', matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount, upsertedCount: result.upsertedCount });
};
