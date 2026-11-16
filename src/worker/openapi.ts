import { QR_STYLES } from "../domain/qr-style";

/**
 * The API a Khóa API speaks, as OpenAPI 3.1 - the six things AGENTS.md lists and nothing more.
 * Served at `/api/openapi.json` and read by the Swagger page under `/app/api-docs`. Written for
 * the developer an Đơn vị hands a key to, who may have no account, so it is public; it holds
 * nothing a key does not already reveal. `api-docs.test.ts` checks it against the real routes.
 */

const json = (schema: object) => ({ "application/json": { schema } });

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const refusal = (description: string, errors: string[]) => ({
  content: json({
    properties: { error: { enum: errors, type: "string" }, problem: { type: "string" } },
    required: ["error"],
    type: "object"
  }),
  description
});

/** What every call can be answered with, whatever it asks. */
const ALWAYS = {
  401: refusal("Thiếu Khóa API, khóa sai hoặc đã bị thu hồi.", ["not-signed-in"]),
  429: {
    content: json(ref("Error")),
    description: "Khóa đã gọi quá 120 lần trong phút này. Header `Retry-After` cho biết phải chờ bao nhiêu giây.",
    headers: { "Retry-After": { description: "Số giây phải chờ.", schema: { type: "integer" } } }
  }
};

const ON_A_LINK = {
  ...ALWAYS,
  403: refusal("Link thuộc đơn vị khác với đơn vị của khóa.", ["forbidden"]),
  404: refusal("Không có link nào mang mã này.", ["unknown-link"])
};

const CODE = {
  description: "Mã link, không phân biệt hoa thường.",
  example: "hoi-thao-2027",
  in: "path",
  name: "code",
  required: true,
  schema: { type: "string" }
};

const LINK = { content: json(ref("Link")), description: "Link sau thay đổi." };

const openApiDocument = (origin: string) => ({
  components: {
    schemas: {
      Error: {
        properties: {
          error: { description: "Lý do, dạng mã máy đọc được.", type: "string" },
          problem: { description: "Chi tiết thêm, khi có.", type: "string" }
        },
        required: ["error"],
        type: "object"
      },
      Link: {
        properties: {
          code: { description: "Mã link. Không bao giờ đổi.", example: "hoi-thao-2027", type: "string" },
          createdAt: { format: "date-time", type: "string" },
          disabledBySystem: {
            description: "Do Quản trị hệ thống tắt: chỉ Quản trị hệ thống bật lại được.",
            type: "boolean"
          },
          enabled: {
            description: "Đang bật. Link bị tắt hiện trang thông báo thay vì chuyển tới đích.",
            type: "boolean"
          },
          logoChoice: { enum: ["inherit", "none", "custom"], type: "string" },
          name: { description: "Tên link: dùng cho việc gì. Chỉ người trong đơn vị thấy.", type: "string" },
          note: { type: "string" },
          preview: {
            description: "Tiêu đề, mô tả, ảnh khi dán link vào Zalo, Facebook... Rỗng là lấy của trang đích.",
            properties: { description: { type: "string" }, image: { type: "string" }, title: { type: "string" } },
            type: "object"
          },
          target: { description: "Đích: nơi người mở link được chuyển tới.", format: "uri", type: "string" },
          unitId: { type: "integer" },
          url: { description: "Địa chỉ đầy đủ để in hoặc gửi đi.", format: "uri", type: "string" },
          visits: { description: "Tổng lượt mở, ước tính.", type: "integer" }
        },
        type: "object"
      }
    },
    securitySchemes: {
      khoaApi: {
        bearerFormat: "oul_...",
        description:
          "Khóa API do Quản lý đơn vị cấp trong giao diện (mục Khóa API). Gửi trong header `Authorization: Bearer <khóa>`. Khóa chỉ làm việc với link của đơn vị mình.",
        scheme: "bearer",
        type: "http"
      }
    }
  },
  info: {
    description: [
      "Link và QR cố định của Trường Đại học Mở Thành phố Hồ Chí Minh, mà đích đổi được sau khi đã in.",
      "",
      "Khóa API làm được đúng sáu việc dưới đây, và chỉ với link của đơn vị đã cấp khóa. Tài khoản, đơn vị và khóa chỉ quản lý được trong giao diện. Mọi thay đổi qua API được ghi lại dưới tên khóa đã thực hiện. Mỗi khóa gọi được tối đa 120 lần mỗi phút.",
      "",
      "**Đang chạy thử trên tên miền tạm: chưa in QR nào.**"
    ].join("\n"),
    title: "OU Link API",
    version: "1"
  },
  openapi: "3.1.0",
  paths: {
    "/api/links": {
      get: {
        description: "Mới nhất trước.",
        operationId: "listLinks",
        responses: {
          200: {
            content: json({ properties: { links: { items: ref("Link"), type: "array" } }, type: "object" }),
            description: "Các link của đơn vị."
          },
          ...ALWAYS
        },
        summary: "Liệt kê link của đơn vị",
        tags: ["Link"]
      },
      post: {
        description:
          "Link thuộc về đơn vị của khóa. Bỏ trống `code` để hệ thống tự sinh mã 6 ký tự. Mã đã dùng không bao giờ được cấp lại, kể cả khi link đã bị tắt.",
        operationId: "createLink",
        requestBody: {
          content: json({
            properties: {
              code: {
                description: "Chữ thường không dấu, chữ số, dấu gạch ngang; 3 đến 50 ký tự.",
                example: "hoi-thao-2027",
                type: "string"
              },
              name: { example: "Poster hội thảo, bản in A3", maxLength: 200, type: "string" },
              note: { maxLength: 1000, type: "string" },
              target: { example: "https://journalofscience.ou.edu.vn/cfp", format: "uri", type: "string" }
            },
            required: ["name", "target"],
            type: "object"
          }),
          required: true
        },
        responses: {
          201: { content: json(ref("Link")), description: "Link vừa tạo." },
          409: refusal("Mã đã có link khác dùng.", ["code-taken"]),
          422: refusal(
            "Tên, ghi chú, đích hoặc mã không hợp lệ. `problem` nói rõ: với đích là `not-a-url`, `not-https`, `points-at-self`, `too-long`; với mã là `too-short`, `too-long`, `bad-characters`, `reserved`.",
            ["bad-name", "bad-note", "bad-target", "bad-code"]
          ),
          503: refusal("Chưa sinh được mã. Thử lại.", ["no-code-available"]),
          ...ALWAYS
        },
        summary: "Tạo link",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/disable": {
      post: {
        description: "Người mở link thấy trang thông báo thay vì được chuyển tới đích. Mã link vẫn được giữ.",
        operationId: "disableLink",
        parameters: [CODE],
        responses: { 200: LINK, ...ON_A_LINK },
        summary: "Tắt link",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/enable": {
      post: {
        operationId: "enableLink",
        parameters: [CODE],
        responses: {
          200: LINK,
          ...ON_A_LINK,
          403: refusal(
            "Link thuộc đơn vị khác, hoặc do Quản trị hệ thống tắt - khi đó chỉ Quản trị hệ thống bật lại được.",
            ["forbidden", "disabled-by-system"]
          )
        },
        summary: "Bật lại link",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/qr": {
      get: {
        description:
          "QR luôn chứa địa chỉ link, không chứa đích, nên vẫn dùng được sau khi đổi đích. Chỉ trả SVG; logo theo lựa chọn của link và đơn vị.",
        operationId: "linkQr",
        parameters: [
          CODE,
          {
            description:
              "Kiểu màu. Mặc định đen trên trắng. Không có tùy chọn màu tự do, để QR luôn đủ tương phản cho điện thoại quét được.",
            in: "query",
            name: "style",
            required: false,
            schema: { default: "dark-on-light", enum: Object.keys(QR_STYLES), type: "string" }
          }
        ],
        responses: {
          200: { content: { "image/svg+xml": { schema: { type: "string" } } }, description: "QR dạng SVG." },
          ...ON_A_LINK,
          422: refusal("Kiểu màu không có trong danh sách.", ["bad-style"])
        },
        summary: "Lấy QR",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/target": {
      put: {
        description:
          "Người mở link được chuyển tới đích mới ngay. Gửi kèm `expectedTarget` là đích bạn đang thấy: nếu ai đó vừa đổi trước, không có gì bị ghi đè và câu trả lời cho biết đích hiện tại.",
        operationId: "changeTarget",
        parameters: [CODE],
        requestBody: {
          content: json({
            properties: {
              expectedTarget: { format: "uri", type: "string" },
              resetPreview: {
                description:
                  "`true` để bỏ tiêu đề, mô tả, ảnh xem trước đã tự đặt cho đích cũ; khi dán link sẽ hiện của trang đích mới.",
                type: "boolean"
              },
              target: { example: "https://journalofscience.ou.edu.vn/cfp-2027", format: "uri", type: "string" }
            },
            required: ["target"],
            type: "object"
          }),
          required: true
        },
        responses: {
          200: LINK,
          ...ON_A_LINK,
          409: {
            content: json({
              properties: { error: { enum: ["target-changed"], type: "string" }, target: { type: "string" } },
              type: "object"
            }),
            description: "Đích đã bị đổi trước khi yêu cầu này tới; `target` là đích hiện tại."
          },
          422: refusal(
            "Đích không hợp lệ: `problem` là `not-a-url`, `not-https`, `points-at-self`, `too-long` hoặc `unchanged`.",
            ["bad-target"]
          )
        },
        summary: "Đổi đích",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/visits": {
      get: {
        description:
          "Theo ngày giờ Việt Nam, ngày cũ trước; ngày không có lượt mở thì không có dòng. Là con số ước tính: lượt mở do Zalo, Facebook tự tạo để hiện bản xem trước được bỏ qua khi nhận ra được.",
        operationId: "linkVisits",
        parameters: [CODE],
        responses: {
          200: {
            content: json({
              properties: {
                days: {
                  items: {
                    properties: { count: { type: "integer" }, day: { example: "2027-03-01", type: "string" } },
                    type: "object"
                  },
                  type: "array"
                },
                total: { type: "integer" }
              },
              type: "object"
            }),
            description: "Lượt mở theo ngày và tổng."
          },
          ...ON_A_LINK
        },
        summary: "Đọc lượt mở",
        tags: ["Link"]
      }
    }
  },
  security: [{ khoaApi: [] }],
  servers: [{ description: "Bản đang chạy", url: origin }],
  tags: [{ description: "Sáu việc một Khóa API làm được, trên link của đơn vị đã cấp khóa.", name: "Link" }]
});

export { openApiDocument };
