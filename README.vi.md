# linkstead

Link và QR cố định dưới tên miền của chính tổ chức bạn, mà **đích có thể đổi sau khi đã in**. Một
tấm poster, một tờ rơi hay một thẻ hội nghị in ra hôm nay vẫn dẫn đúng nơi khi trang đích chuyển chỗ
vào năm sau.

[English](README.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/holedev/linkstead)

## Hệ thống làm gì

- **Link cố định.** Mỗi link có một Mã link (`/hoi-thao-2027`) không bao giờ đổi và không bao giờ
  cấp lại. Link có thể bị tắt, được lưu trữ (ẩn khỏi danh sách, vẫn mở được) hoặc bị xóa; link đã
  xóa vẫn giữ mã, để QR đã in không bao giờ dẫn tới nơi khác.
- **Đổi đích có kiểm soát.** Đổi đích phải qua bước xác nhận hiện đích cũ và đích mới, và được ghi
  vào lịch sử cùng người đổi.
- **QR.** QR luôn chứa địa chỉ link, không chứa đích. Logo chọn theo ba cấp: của tổ chức, của đơn
  vị, của riêng từng link (hoặc không logo). Ô vuông hoặc chấm tròn, tải SVG hoặc PNG.
- **Theo đơn vị.** Link thuộc về đơn vị, không thuộc về cá nhân, nên vẫn còn khi người tạo rời đi.
- **Mật khẩu và hạn dùng**, **tạo nhiều link từ CSV**, **lượt mở** theo ngày, quốc gia và trang giới
  thiệu (không lưu gì nhận ra được người mở), **kiểm tra đích** bằng Google Safe Browsing, **API**
  cho ứng dụng, **xuất dữ liệu** sang bản cài đặt khác.
- **Của riêng tổ chức bạn.** Tên, màu, logo, các tên miền email được nhận, ngôn ngữ (tiếng Anh hoặc
  tiếng Việt) và múi giờ đặt trong giao diện.

Từ vựng của dự án nằm trong [CONTEXT.md](CONTEXT.md) (thuật ngữ tiếng Anh, kèm tên tiếng Việt).

## Tự cài đặt

Nhanh nhất là nút **Deploy to Cloudflare** ở trên: nó chép repo này vào tài khoản GitHub của bạn,
tạo database D1 và bucket R2, chạy migration rồi deploy. Gói Workers Free là đủ.

Hoặc làm tay:

```bash
pnpm install
pnpm exec wrangler login
pnpm run deploy
```

**Chọn tên miền trước khi in bất cứ thứ gì.** QR mang tên miền nó được tạo ra, và chết cùng tên
miền đó.

### Tạo Quản trị hệ thống đầu tiên

1. `pnpm exec wrangler secret put BOOTSTRAP_TOKEN`
2. Gọi `/api/bootstrap` với bí mật đó, email của bạn và (tùy chọn) cài đặt của tổ chức:

   ```bash
   curl -X POST https://<địa-chỉ-worker>/api/bootstrap \
     -H "Authorization: Bearer <bí-mật>" \
     -H "Content-Type: application/json" \
     -d '{"email":"ban@example.org","name":"Trường Đại học Ví Dụ","emailDomains":["example.org"],"language":"vi","timeZone":"Asia/Ho_Chi_Minh"}'
   ```

3. Mở `setupUrl` trong kết quả để đặt mật khẩu (ít nhất 12 ký tự), rồi đăng nhập tại `/app`.
4. `pnpm exec wrangler secret delete BOOTSTRAP_TOKEN`

Sau đó đơn vị, thành viên, Quản trị hệ thống khác, logo và mọi cài đặt đều làm trong giao diện
(mục **Cài đặt**, **Đơn vị**...).

Chi tiết về chạy trên máy, kiểm tra đích an toàn, API và kiểm tra mã: xem [README.md](README.md).

## Giấy phép

MIT - xem [LICENSE](LICENSE) và [NOTICE](NOTICE). linkstead khởi đầu là OU Link, viết cho Trường
Đại học Mở Thành phố Hồ Chí Minh.
