# Assignment 3 — Student Attendance Management API

Triển khai trên project Express/Mongoose được cung cấp, database `Assignment3`, port `9999`.

## Chạy ứng dụng

```powershell
npm install
# Nếu chưa có .env, sao chép .env.example thành .env và cấu hình JWT_SECRET.
# Bật MongoDB, kiểm tra MONGO_URI trong .env.
npm run seed
npm start
```

`npm run dev` chạy bằng nodemon. Script seed chuyển MongoDB Extended JSON (`$oid`, `$date`) sang ObjectId/Date và chỉ thêm những bản ghi mẫu chưa tồn tại, không xóa database hoặc ghi đè dữ liệu đang có.

Project gốc chỉ có PORT, MONGO_URI và JWT_SECRET; chưa có tài khoản test. Tài khoản mặc định lấy từ đề: `masv@fpt.edu.vn` / `masv@123`, studentId `65dd00000000000000000001`. Có thể thay bằng TEST_EMAIL, TEST_PASSWORD, TEST_STUDENT_ID trong `.env`.

## API

| Method | Endpoint | Ý nghĩa |
| --- | --- | --- |
| POST | `/api/auth/login` | Đăng nhập, nhận JWT hết hạn sau 1 giờ |
| GET | `/api/classes/:classId/students?status=enrolled` | Danh sách sinh viên enrolled hoặc dropped |
| GET | `/api/classes/:classId/attendance-summary` | Tổng hợp điểm danh sinh viên đang học |
| GET | `/api/students/:studentId/attendances` | Lịch sử tất cả lớp, ngày mới nhất trước |
| POST | `/api/classes/:classId/attendances` | Tạo/cập nhật điểm danh cả lớp trong một ngày |

Các API ngoài login yêu cầu header `Authorization: Bearer <token>`, bao gồm API ghi điểm danh.
Đề có một số đường dẫn in thiếu tham số; code dùng `:classId` và `:studentId` theo phần bảo vệ API và ví dụ.

Login body:

```json
{ "email": "masv@fpt.edu.vn", "password": "masv@123" }
```

Body điểm danh cho lớp `65bb00000000000000000001`:

```json
{
  "date": "2026-03-17",
  "records": [
    { "studentId": "65dd00000000000000000001", "status": "PRESENT" },
    { "studentId": "65dd00000000000000000002", "status": "ABSENT" },
    { "studentId": "65dd00000000000000000003", "status": "PRESENT" }
  ]
}
```

- `date` dùng `YYYY-MM-DD`, kiểm tra ngày thực tế và không vượt quá ngày hiện tại ở Việt Nam; lưu midnight UTC để thống nhất khóa theo ngày.
- Phải gửi đủ tất cả sinh viên ENROLLED, không trùng, không chứa sinh viên DROPPED hoặc ngoài lớp. Toàn bộ đầu vào được kiểm tra trước khi ghi.
- Upsert theo `(classId, studentId, date)`; unique index ngăn bản ghi trùng. Bulk write không phải transaction: lỗi database trong lúc ghi có thể khiến một phần batch đã được ghi; có thể gửi lại cùng request.
- Dữ liệu enrollment chữ thường trong file mẫu hoặc dữ liệu import trực tiếp đều được hỗ trợ.
- `attendanceRate` là số phần trăm làm tròn 1 chữ số thập phân (JSON có thể hiển thị `90` thay vì `90.0`). Warning bật khi dưới 80%; sinh viên chưa có bản ghi nhận 0 và warning=true.
- ID sai hoặc body/query sai: 400; tài nguyên không tồn tại: 404; login/token sai: 401; xung đột unique index: 409.

## Kiểm thử

```powershell
npm test
```

Test tự khởi động MongoDB riêng trên port trống với thư mục tạm, không thay đổi database của bạn. Dùng MongoDB 8.3 tại đường dẫn cài đặt mặc định Windows, hoặc `mongod` trong PATH. Có thể đặt biến `MONGOD_BINARY` trỏ đến file mongod trên máy bạn. Bao gồm login/JWT, validate ID, lọc enrollment, thống kê mẫu 90/70/60, sinh viên chưa có điểm danh, lịch sử nhiều lớp, validate batch và upsert không trùng.
