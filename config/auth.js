// The starter has no account configuration. Defaults match the assignment.
module.exports = function getAuthConfig() {
    return {
        email: process.env.TEST_EMAIL || 'masv@fpt.edu.vn',
        password: process.env.TEST_PASSWORD || 'masv@123',
        studentId: process.env.TEST_STUDENT_ID || '65dd00000000000000000001',
        secret: process.env.JWT_SECRET
    };
};
