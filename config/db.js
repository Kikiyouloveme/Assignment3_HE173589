const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
    await mongoose.connect(process.env.MONGO_URI, {
        dbName: 'Assignment3',
        serverSelectionTimeoutMS: 5000
    });
    console.log('MongoDB connected successfully');
};

module.exports = connectDB;
