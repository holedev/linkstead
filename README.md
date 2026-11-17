# OU Link

Link và QR cố định dưới tên miền của Trường Đại học Mở Thành phố Hồ Chí Minh, mà **đích có thể đổi
sau khi đã in**. Một tấm poster, một tờ rơi hay một cuốn kỷ yếu in ra hôm nay vẫn dẫn đúng nơi khi
trang đích chuyển chỗ vào năm sau.

> **Đang chạy thử trên tên miền tạm.** Mọi link tạo trong giai đoạn này đều có thể bỏ đi. **Chưa in
> QR nào** cho tới khi có tên miền chính thức của Trường - QR mang tên miền tạm sẽ chết cùng tên miền
> đó ([ADR-0001](docs/adr/0001-the-trial-runs-on-cloudflare-workers-and-stays-portable.md)).

## Hệ thống làm gì

- **Link cố định.** Mỗi link có một Mã link (`/hoi-thao-2027`) không bao giờ đổi và không bao giờ
  cấp lại. Link có thể bị tắt, được lưu trữ (ẩn khỏi danh sách, vẫn mở được) hoặc bị xóa. Link đã
  xóa vẫn giữ mã, để QR đã in không bao giờ dẫn tới nơi khác. Mã tự chọn, hoặc để hệ thống sinh 6
  ký tự.
- **Tạo nhiều link một lần.** Nhập tệp CSV (Tên link, Đích, Mã link, Nhóm, Ghi chú), xem trước lỗi
  từng dòng, rồi tải QR của mọi link vừa tạo thành một tệp zip.
- **Đổi đích có kiểm soát.** Đổi đích phải qua bước xác nhận hiện đích cũ và đích mới, và được ghi
  vào lịch sử cùng người đổi.
- **QR.** QR luôn chứa địa chỉ link, không chứa đích. Logo chọn theo ba cấp: của Trường, của đơn vị,
  của riêng từng link (hoặc không logo). Tải về dạng SVG hoặc PNG.
- **Theo đơn vị.** Link thuộc về đơn vị (tạp chí, khoa, phòng), không thuộc về cá nhân, nên vẫn còn
  khi người tạo rời đi. Một tài khoản có thể thuộc nhiều đơn vị.
- **Lượt mở.** Đếm theo link theo ngày, theo quốc gia và theo trang giới thiệu (chỉ tên miền).
  Không lưu gì nhận ra được người mở. Có trang tổng quan cho cả đơn vị. Là con số ước tính.
- **Kiểm tra đích.** Đích bị Google Safe Browsing xếp là lừa đảo hay mã độc thì không đặt được. Mỗi
  ngày hệ thống kiểm tra lại mọi đích; link có đích mới bị xếp như vậy sẽ hiện trang cảnh báo thay
  vì chuyển đi.
- **API cho ứng dụng.** Mỗi đơn vị cấp Khóa API để ứng dụng của mình tạo link, đổi đích, tắt/bật,
  liệt kê, đọc lượt mở và lấy QR.
- **Mang dữ liệu đi được.** Đơn vị tải CSV; Quản trị hệ thống xuất toàn bộ thành một tệp mà bản cài
  đặt khác nhập lại được.

Từ vựng của dự án (Link, Mã link, Đích, Đơn vị, Lượt mở...) được định nghĩa trong
[CONTEXT.md](CONTEXT.md).

## Kiến trúc

Một Cloudflare Worker duy nhất:

| Phần | Công nghệ |
| --- | --- |
| API và chuyển hướng link | [Hono](https://hono.dev) |
| Giao diện quản trị (`/app`, tiếng Việt) | React, Vite, Tailwind, shadcn/ui |
| Cơ sở dữ liệu | Cloudflare D1 qua Drizzle |
| Tệp logo | Cloudflare R2 |

Phần xử lý yêu cầu không phụ thuộc API riêng của Workers: nó chỉ biết hai "đường nối" `Store` và
`LogoFiles`, để sau này chuyển về máy chủ của Trường chỉ cần viết lại hai phần đó. Cấu trúc thư mục
và danh sách route đầy đủ nằm trong [AGENTS.md](AGENTS.md).

## Yêu cầu

- Node 22 và pnpm 11.20.0 (khai trong `mise.toml`; chạy `mise install` nếu dùng [mise](https://mise.jdx.dev)).
- Tài khoản Cloudflare, nếu muốn deploy. Gói Workers Free là đủ.

## Chạy trên máy

```bash
pnpm install
```

Tạo tệp `.dev.vars` ở thư mục gốc, chứa bí mật dùng để tạo Quản trị hệ thống đầu tiên:

```
BOOTSTRAP_TOKEN=mot-chuoi-bi-mat-tuy-chon
```

```bash
pnpm db:migrate:local
```

```bash
pnpm build:ui
```

```bash
pnpm dev
```

Hệ thống chạy ở `http://localhost:8787`, giao diện ở `http://localhost:8787/app`. Tiếp theo, tạo
Quản trị hệ thống đầu tiên như mục [Tạo Quản trị hệ thống đầu tiên](#tạo-quản-trị-hệ-thống-đầu-tiên),
với địa chỉ `http://localhost:8787`.

Khi sửa giao diện, chạy thêm `pnpm dev:ui` ở một cửa sổ khác để có hot reload; nó gọi API của Worker
đang chạy bằng `pnpm dev`.

## Deploy lên Cloudflare

```bash
pnpm exec wrangler login
```

Tạo cơ sở dữ liệu D1 rồi ghi `database_id` nhận được vào `wrangler.jsonc` (bỏ qua nếu id trong tệp
đã là database của bạn - kiểm tra bằng `pnpm exec wrangler d1 list`):

```bash
pnpm exec wrangler d1 create ou-link
```

```bash
pnpm db:migrate:remote
```

```bash
pnpm exec wrangler r2 bucket create ou-link-logos
```

```bash
pnpm run deploy
```

Phải gõ `pnpm run deploy`: `pnpm deploy` là một lệnh khác có sẵn của pnpm.

### Tự động deploy khi đẩy lên `main`

`.github/workflows/deploy.yml` chạy lint, kiểm tra kiểu và test cho mỗi pull request. Với mỗi lần đẩy lên
`main`, nếu các bước đó qua, nó build giao diện, chạy migration lên database thật rồi deploy. Lần nào
có bước lỗi thì không deploy, bản đang chạy giữ nguyên.

Cần đặt hai secret một lần, ở GitHub: **Settings → Secrets and variables → Actions → New repository
secret**:

- `CLOUDFLARE_ACCOUNT_ID` - Account ID, ở trang Workers & Pages của Cloudflare (cột bên phải).
- `CLOUDFLARE_API_TOKEN` - tạo ở **My Profile → API Tokens → Create Token**, mẫu **Edit Cloudflare
  Workers**, thêm quyền **Account → D1 → Edit**.

Kết quả từng lần chạy ở tab **Actions** của repo. Vẫn deploy tay được như trên khi cần:
`pnpm db:migrate:remote` rồi `pnpm run deploy`.

## Tạo Quản trị hệ thống đầu tiên

Hệ thống không có đăng ký tự do và không gửi email. Người đầu tiên được tạo bằng một bí mật đặt lúc
deploy; những người sau do người đã ở trong hệ thống thêm vào.

1. Đặt bí mật (với bản chạy trên máy thì là dòng trong `.dev.vars`):

   ```bash
   pnpm exec wrangler secret put BOOTSTRAP_TOKEN
   ```

2. Gọi `/api/bootstrap` với bí mật đó và email `@ou.edu.vn` của bạn.

   bash:

   ```bash
   curl -X POST https://<địa-chỉ-worker>/api/bootstrap \
     -H "Authorization: Bearer <bí-mật>" \
     -H "Content-Type: application/json" \
     -d '{"email":"ten-cua-ban@ou.edu.vn"}'
   ```

   PowerShell:

   ```powershell
   Invoke-RestMethod -Method Post -Uri "https://<địa-chỉ-worker>/api/bootstrap" -Headers @{ Authorization = "Bearer <bí-mật>" } -ContentType "application/json" -Body '{"email":"ten-cua-ban@ou.edu.vn"}' | Format-List
   ```

3. Mở `setupUrl` trong kết quả để đặt mật khẩu (ít nhất 12 ký tự), rồi đăng nhập tại `/app`. Đường
   dẫn dùng được một lần, trong 7 ngày.

4. Xóa bí mật:

   ```bash
   pnpm exec wrangler secret delete BOOTSTRAP_TOKEN
   ```

Bước 2 chỉ chạy được khi chưa có Quản trị hệ thống nào. Người này tự động là Quản lý của hai đơn vị
có sẵn (Tạp chí Khoa học, Nhà xuất bản). Thêm đơn vị, thành viên và Quản trị hệ thống khác đều làm
trong giao diện.

## Bật kiểm tra đích an toàn

Kiểm tra đích dùng Google Safe Browsing, miễn phí nhưng cần một khóa:

1. Ở [Google Cloud Console](https://console.cloud.google.com/), tạo (hoặc chọn) một project, bật
   **Safe Browsing API**, rồi tạo một API key ở **APIs & Services → Credentials**.
2. Đặt khóa cho Worker:

   ```bash
   pnpm exec wrangler secret put SAFE_BROWSING_KEY
   ```

Chưa đặt khóa thì hệ thống vẫn chạy, chỉ là không kiểm tra đích. Lượt kiểm tra hằng ngày chạy lúc
03:17 giờ Việt Nam (`triggers.crons` trong `wrangler.jsonc`).

## Dùng API

Tài liệu đầy đủ, thử được ngay trên trình duyệt: **`/app/api-docs`** (Swagger, không cần đăng nhập). Bản mô tả
OpenAPI ở `/api/openapi.json`, dùng được để sinh mã client.

Quản lý đơn vị cấp Khóa API trong giao diện (mục **Khóa API**); khóa chỉ hiện một lần. Ứng dụng gửi
khóa trong header `Authorization: Bearer <khóa>`. Một khóa chỉ làm việc trên link của đơn vị mình và
bị từ chối khi vượt 120 lượt gọi mỗi phút.

| Việc | Route |
| --- | --- |
| Tạo link | `POST /api/links` - `{ "name", "target", "code"?, "note"? }` |
| Liệt kê link của đơn vị | `GET /api/links` |
| Đổi đích | `PUT /api/links/:code/target` - `{ "target" }` |
| Tắt, bật | `POST /api/links/:code/disable`, `POST /api/links/:code/enable` |
| Đọc lượt mở theo ngày | `GET /api/links/:code/visits` |
| Lấy QR (SVG) | `GET /api/links/:code/qr` - thêm `?style=` để đổi màu: `light-on-dark`, `blue-on-light`, `dark-on-clear`, `light-on-clear` |

```bash
curl -X POST https://<địa-chỉ-worker>/api/links \
  -H "Authorization: Bearer <khóa-api>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Poster hội thảo, bản in A3","target":"https://example.ou.edu.vn/hoi-thao","code":"hoi-thao-2027"}'
```

Mọi thay đổi qua API đều được ghi dưới tên khóa đã thực hiện. Tài khoản, đơn vị và khóa chỉ quản lý
được trong giao diện, không qua API.

## Kiểm tra mã

```bash
pnpm test
```

```bash
pnpm check-types
```

```bash
pnpm lint:check
```

Test chạy trên một D1 cục bộ thật với đúng các migration, nên kiểm tra cả câu SQL mà Worker sẽ chạy.
Commit theo conventional commits, được commitlint kiểm tra.

## Tài liệu

- [CONTEXT.md](CONTEXT.md) - từ vựng của dự án.
- [AGENTS.md](AGENTS.md) - các quy tắc thiết kế, danh sách route, cấu trúc thư mục.
- [docs/adr/](docs/adr/) - các quyết định khó đảo ngược và lý do.
- [docs/export-and-import.md](docs/export-and-import.md) - xuất dữ liệu và nhập vào bản cài đặt khác.
