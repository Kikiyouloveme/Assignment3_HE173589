const mongoose = require('mongoose');
const { Schema } = mongoose;
const reference = (ref) => ({ type: Schema.Types.ObjectId, ref, required: true });

const studentSchema = new Schema({
    studentCode: { type: String, required: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true }
}, { versionKey: false });

const subjectSchema = new Schema({
    code: String, name: String, credits: Number, status: String
}, { versionKey: false });

const classSchema = new Schema({
    className: { type: String, required: true },
    subjectId: reference('Subject'),
    lecturerName: String,
    status: String,
    enrollments: [{
        _id: false,
        studentId: reference('Student'),
        status: { type: String, uppercase: true, enum: ['ENROLLED', 'DROPPED'], required: true }
    }]
}, { versionKey: false });

const attendanceSchema = new Schema({
    studentId: reference('Student'),
    classId: reference('Class'),
    date: { type: Date, required: true },
    status: { type: String, enum: ['PRESENT', 'ABSENT'], required: true }
}, { versionKey: false });
attendanceSchema.index({ classId: 1, studentId: 1, date: 1 }, { unique: true });

module.exports = {
    Student: mongoose.model('Student', studentSchema),
    Subject: mongoose.model('Subject', subjectSchema),
    Class: mongoose.model('Class', classSchema),
    Attendance: mongoose.model('Attendance', attendanceSchema)
};
