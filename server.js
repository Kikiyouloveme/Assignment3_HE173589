require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { Attendance } = require('./models');

async function start() {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
    await connectDB();
    await Attendance.init();
    const PORT = process.env.PORT || 9999;
    return app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

if (require.main === module) {
    start().catch(error => {
        console.error('Server startup failed:', error.message);
        process.exit(1);
    });
}

module.exports = { start };
