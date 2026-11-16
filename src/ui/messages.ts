import { ApiFailure } from "./api";

/**
 * The server answers with reasons, the UI with sentences. Kept in one table so a reason is worded
 * once, and so a new one the server starts sending shows up here as the fallback, not as silence.
 */
const BY_CODE: Record<string, string> = {
  "already-admin": "Người này đã là Quản trị hệ thống.",
  "already-member": "Người này đã là thành viên của đơn vị.",
  "already-reserved": "Mã này đã được dành riêng rồi.",
  "bad-name": "Hãy nhập tên (tối đa 200 ký tự).",
  "bad-note": "Ghi chú quá dài (tối đa 1000 ký tự).",
  "bad-password-key": "Trình duyệt không xử lý được mật khẩu. Hãy tải lại trang và thử lại.",
  "bad-style": "Kiểu QR này không có. Hãy chọn một kiểu trong danh sách.",
  "code-taken": "Mã này đã có link khác dùng. Mã đã dùng không bao giờ được cấp lại.",
  "cross-site": "Yêu cầu bị từ chối. Hãy tải lại trang và thử lại.",
  "disabled-by-system": "Link này do Quản trị hệ thống tắt, chỉ Quản trị hệ thống bật lại được.",
  forbidden: "Bạn không có quyền làm việc này.",
  "invalid-credentials": "Email hoặc mật khẩu không đúng.",
  "invalid-token": "Đường dẫn không hợp lệ, đã được dùng hoặc đã hết hạn. Hãy xin đường dẫn mới từ Quản lý đơn vị.",
  "last-admin": "Hệ thống phải luôn có ít nhất một Quản trị hệ thống. Hãy thêm người khác trước.",
  "last-manager": "Đơn vị phải luôn có ít nhất một Quản lý đơn vị. Hãy chỉ định người khác làm quản lý trước.",
  "link-moved": "Link vừa được chuyển sang đơn vị khác. Hãy tra cứu lại.",
  locked: "Tài khoản tạm khóa 15 phút vì nhập sai mật khẩu nhiều lần.",
  "logos-unavailable": "Hệ thống chưa gắn nơi lưu logo nên chưa tải logo lên được.",
  network: "Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.",
  "no-code-available": "Chưa sinh được mã. Hãy thử lại.",
  "not-a-member": "Người này không phải thành viên của đơn vị.",
  "not-an-admin": "Người này không phải Quản trị hệ thống.",
  "not-signed-in": "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
  "not-university-email": "Chỉ nhận email @ou.edu.vn.",
  "rate-limited": "Khóa API đã gọi quá nhiều lần trong một phút.",
  "same-unit": "Link đang thuộc đơn vị này rồi.",
  "target-changed": "Đích vừa được người khác đổi. Hãy xem lại đích hiện tại rồi thử lại.",
  "unit-name-taken": "Đã có đơn vị mang tên này (kể cả đơn vị đã giải thể).",
  "unit-owns-links": "Đơn vị còn link nên chưa giải thể được. Hãy chuyển hết link sang đơn vị khác trước.",
  "unknown-code": "Không tìm thấy mã dành riêng này.",
  "unknown-key": "Không tìm thấy khóa này, hoặc khóa đã bị thu hồi.",
  "unknown-link": "Không tìm thấy link này.",
  "unknown-unit": "Không tìm thấy đơn vị này."
};

const BY_PROBLEM: Record<string, string> = {
  "bad-code:bad-characters":
    "Mã chỉ gồm chữ thường không dấu, chữ số và dấu gạch ngang, không bắt đầu hay kết thúc bằng gạch ngang.",
  "bad-code:reserved": "Mã này được dành riêng. Hãy chọn mã khác.",
  "bad-code:too-long": "Mã dài tối đa 50 ký tự.",
  "bad-code:too-short": "Mã phải có ít nhất 3 ký tự.",
  "bad-logo:empty": "Tệp logo rỗng.",
  "bad-logo:not-png-or-jpeg": "Logo phải là ảnh PNG hoặc JPEG. Không nhận SVG.",
  "bad-logo:too-large": "Logo quá lớn (tối đa 256 KB).",
  "bad-preview:description-too-long": "Mô tả dài tối đa 500 ký tự.",
  "bad-preview:image-not-https": "Ảnh phải là một địa chỉ https.",
  "bad-preview:title-too-long": "Tiêu đề dài tối đa 200 ký tự.",
  "bad-target:not-a-url": "Đích phải là một địa chỉ đầy đủ, bắt đầu bằng https://",
  "bad-target:not-https": "Đích phải là địa chỉ https.",
  "bad-target:points-at-self": "Đích không được trỏ về chính hệ thống này.",
  "bad-target:too-long": "Địa chỉ đích quá dài.",
  "bad-target:unchanged": "Đích mới trùng với đích hiện tại."
};

const isReason = (value: unknown): value is { code: string; problem?: string } =>
  typeof value === "object" && value !== null && typeof (value as { code?: unknown }).code === "string";

const messageOf = (error: unknown): string => {
  // A plain `{ code, problem }` is a refusal the UI reached itself, with the server's own rule.
  if (error instanceof ApiFailure || isReason(error)) {
    return BY_PROBLEM[`${error.code}:${error.problem}`] ?? BY_CODE[error.code] ?? `Có lỗi xảy ra (${error.code}).`;
  }
  return "Có lỗi xảy ra. Hãy thử lại.";
};

export { messageOf };
