const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { Student, Subject, Class, Attendance } = require('../models');

function readData(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${name}.json`), 'utf8'),
        (key, value) => {
            if (value && typeof value === 'object' && value.$oid) return new mongoose.Types.ObjectId(value.$oid);
            if (value && typeof value === 'object' && value.$date) return new Date(value.$date);
            return value;
        });
}

async function seed() {
    for (const [name, Model] of [['students', Student], ['subjects', Subject], ['classes', Class], ['attendances', Attendance]]) {
        const documents = readData(name).map(record => new Model(record).toObject());
        // Insert missing fixtures only; re-running never overwrites existing records.
        await Model.bulkWrite(documents.map(({ _id, ...fields }) => ({
            updateOne: { filter: { _id }, update: { $setOnInsert: fields }, upsert: true }
        })));
    }
    await Attendance.init();
}

if (require.main === module) {
    connectDB().then(seed).then(() => console.log('Sample data initialized'))
        .catch(error => { console.error(error.message); process.exitCode = 1; })
        .finally(() => mongoose.disconnect());
}
module.exports = { seed, readData };
