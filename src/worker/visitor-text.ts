import type { Language } from "../domain/organization";

/**
 * Every word a visitor reads on the pages served without signing in, in each language an
 * Organization may choose. A page speaks the Organization's language first and adds English
 * beneath when that is another: whoever scans a QR on a conference poster may read only one.
 *
 * `{address}` marks where an address is shown in code type; `{name}` is the Organization's name.
 */

type NoticeKind = "unknown" | "disabled" | "deleted" | "expired" | "unsafe";

type NoticeText = { title: string; body: string; advice: string };

type VisitorText = {
  notice: Record<NoticeKind, NoticeText>;
  addressOpened: string;
  destination: string;
  continueAnyway: string;
  aboutLinks: string;
  whatIsThis: string;
  whatIsThisBody: string;
  password: {
    title: string;
    enter: string;
    label: string;
    open: string;
    show: string;
    hide: string;
    wrong: string;
    tooMany: string;
  };
  landing: {
    signIn: string;
    signInToManage: string;
    headline: string;
    headlineStress: string;
    lead: string;
    howItWorks: string;
    howItWorksLead: string;
    steps: { title: string; text: string }[];
    forUnits: string;
    forUnitsLead: string;
    features: { title: string; text: string }[];
    developers: string;
    apiDocs: string;
    openedOne: string;
    openedOneBody: string;
    demo: {
      label: string;
      printed: string;
      leadsTo: string;
      before: string;
      today: string;
      note: string;
    };
    description: string;
  };
};

const en: VisitorText = {
  aboutLinks: "About {name}'s links",
  addressOpened: "Address you opened",
  continueAnyway: "I understand the risk, continue anyway",
  destination: "Destination",
  landing: {
    apiDocs: "API documentation",
    demo: {
      before: "in March",
      label: "An example of a link",
      leadsTo: "Leads to",
      note: "The printed poster needs no reprint - only where it leads changes.",
      printed: "Link printed on a poster",
      today: "today"
    },
    description: "{name}'s permanent short links and QR codes: printed once, pointed wherever they need to go.",
    developers: "Developers: see the",
    features: [
      {
        text: "A link belongs to a unit, not to a person. When whoever looked after it moves on, it stays.",
        title: "Owned by units, not people"
      },
      {
        text: "A link's code is never changed, deleted or given to something else. A link no longer needed is switched off.",
        title: "Never lost"
      },
      {
        text: "QR codes carry the organization's or the unit's logo, in several looks, as SVG or PNG for print.",
        title: "QR codes with a logo"
      },
      {
        text: "Openings are counted per day, leaving out the previews chat apps make on their own.",
        title: "Visits per day"
      },
      {
        text: "No IP address, device or anything else about the person opening a link is kept.",
        title: "Respectful of visitors"
      },
      {
        text: "A unit's own software can create and update links through the API, with the unit's own key.",
        title: "An API for applications"
      }
    ],
    forUnits: "For the units of {name}",
    forUnitsLead:
      "Accounts are invited by a unit's manager. Each unit looks after its own links, members and API keys.",
    headline: "Links and QR codes that",
    headlineStress: "last",
    howItWorks: "How it works",
    howItWorksLead: "Three steps, and a printed QR code never has to be printed again because its destination moved.",
    lead: "Each publication, event or article gets a short address under {name}'s own domain. The address never changes; where it leads can be updated at any time, even after its QR code has been printed.",
    openedOne: "Just opened one of these links?",
    openedOneBody:
      "Every link reads {address}. If one shows an error page, check the code, or contact the unit that published it.",
    signIn: "Sign in",
    signInToManage: "Sign in to manage links",
    steps: [
      {
        text: "A unit creates a link with a short code that is easy to read and type - chosen, or made up.",
        title: "Create a link"
      },
      {
        text: "The QR code always carries the link's address, never its destination, so it can go on posters, books and badges.",
        title: "Print its QR code"
      },
      {
        text: "The destination can change at any time. Printed codes keep working; every change records who made it and when.",
        title: "Change where it leads"
      }
    ]
  },
  notice: {
    deleted: {
      advice: "The unit that published it has deleted it. If you need its content, please contact them.",
      body: "This link has been deleted and no longer leads anywhere.",
      title: "This link was deleted"
    },
    disabled: {
      advice: "The unit that published it has switched it off. If you need its content, please contact them.",
      body: "This link has been switched off and no longer leads anywhere.",
      title: "This link is switched off"
    },
    expired: {
      advice: "It could only be used until a date its publisher set. If you still need it, please contact them.",
      body: "This link has expired and no longer leads anywhere.",
      title: "This link has expired"
    },
    unknown: {
      advice:
        "Check each character, especially look-alikes such as 0 and o, 1 and l. If you scanned it from something printed, tell whoever published it.",
      body: "This link does not exist. Please check the address you typed or scanned.",
      title: "Link not found"
    },
    unsafe: {
      advice: "Only go on if you trust this page, and do not enter a password or personal details there.",
      body: "Google Safe Browsing lists the page this link leads to as possibly harmful - phishing or malware.",
      title: "The destination may be unsafe"
    }
  },
  password: {
    enter: "Enter the password its publisher gave you.",
    hide: "Hide password",
    label: "Password",
    open: "Open",
    show: "Show password",
    title: "This link needs a password",
    tooMany: "Too many wrong tries. Please wait a minute and try again.",
    wrong: "Wrong password."
  },
  whatIsThis: "What is this?",
  whatIsThisBody:
    "{name}'s own short links and QR codes. Every link reads {address} and is managed by one of its units."
};

const vi: VisitorText = {
  aboutLinks: "Về liên kết của {name}",
  addressOpened: "Địa chỉ bạn đã mở",
  continueAnyway: "Tôi hiểu rủi ro, vẫn tiếp tục",
  destination: "Trang đích",
  landing: {
    apiDocs: "tài liệu API",
    demo: {
      before: "tháng 3",
      label: "Ví dụ một liên kết",
      leadsTo: "Dẫn tới",
      note: "Poster đã in không cần in lại - chỉ trang đích thay đổi.",
      printed: "Liên kết in trên poster",
      today: "hôm nay"
    },
    description: "Đường dẫn ngắn và mã QR bền vững của {name} - in một lần, đổi trang đích bất cứ lúc nào.",
    developers: "Lập trình viên: xem",
    features: [
      {
        text: "Liên kết thuộc về đơn vị, không thuộc về một người. Người phụ trách đổi việc, liên kết vẫn ở lại.",
        title: "Của đơn vị, không của cá nhân"
      },
      {
        text: "Mã liên kết không bao giờ bị đổi, xóa hay cấp lại cho việc khác. Không dùng nữa thì tắt.",
        title: "Không bao giờ mất"
      },
      {
        text: "Mã QR mang logo của tổ chức hoặc của đơn vị, nhiều kiểu màu, tải về dạng SVG hoặc PNG để in.",
        title: "QR có logo"
      },
      {
        text: "Đếm số lượt mở mỗi ngày, bỏ qua các lượt xem trước của Zalo, Facebook, Messenger.",
        title: "Lượt mở theo ngày"
      },
      {
        text: "Không lưu địa chỉ IP, thiết bị hay bất cứ thông tin nào về người mở liên kết.",
        title: "Tôn trọng người xem"
      },
      {
        text: "Phần mềm của đơn vị có thể tạo và cập nhật liên kết qua API, bằng khóa riêng của đơn vị.",
        title: "API cho ứng dụng"
      }
    ],
    forUnits: "Dành cho các đơn vị của {name}",
    forUnitsLead:
      "Tài khoản do quản lý đơn vị mời. Mỗi đơn vị quản lý liên kết, thành viên và khóa API của riêng mình.",
    headline: "Đường dẫn và mã QR",
    headlineStress: "bền vững",
    howItWorks: "Cách hoạt động",
    howItWorksLead: "Ba bước, và mã QR đã in không bao giờ phải in lại vì đổi trang đích.",
    lead: "Mỗi ấn phẩm, sự kiện, bài báo có một địa chỉ ngắn dưới tên miền của {name}. Địa chỉ ấy không bao giờ đổi; nơi nó dẫn tới thì cập nhật được bất cứ lúc nào, kể cả sau khi mã QR đã được in.",
    openedOne: "Bạn vừa mở một liên kết như thế này?",
    openedOneBody:
      "Mọi liên kết có dạng {address}. Nếu một liên kết đưa bạn tới trang báo lỗi, hãy kiểm tra lại mã, hoặc liên hệ đơn vị đã phát hành nó.",
    signIn: "Đăng nhập",
    signInToManage: "Đăng nhập để quản lý liên kết",
    steps: [
      {
        text: "Một đơn vị tạo liên kết với một mã ngắn, dễ đọc, dễ gõ - tự đặt hoặc để hệ thống tạo.",
        title: "Tạo liên kết"
      },
      {
        text: "Mã QR luôn chứa địa chỉ của liên kết, không chứa trang đích, nên có thể in lên poster, sách, thẻ hội nghị.",
        title: "In mã QR"
      },
      {
        text: "Trang đích có thể thay bất cứ lúc nào. Mã đã in vẫn dùng được; mỗi lần đổi đều ghi lại ai đổi và khi nào.",
        title: "Đổi đích khi cần"
      }
    ]
  },
  notice: {
    deleted: {
      advice:
        "Đơn vị phát hành đã xóa liên kết này. Nếu bạn cần nội dung của nó, hãy liên hệ đơn vị đã in hoặc gửi liên kết cho bạn.",
      body: "Liên kết này đã bị xóa và không còn dẫn tới đâu.",
      title: "Liên kết đã bị xóa"
    },
    disabled: {
      advice:
        "Đơn vị phát hành đã tắt liên kết này. Nếu bạn cần nội dung của nó, hãy liên hệ đơn vị đã in hoặc gửi liên kết cho bạn.",
      body: "Liên kết này đã bị tắt và hiện không dẫn tới đâu.",
      title: "Liên kết đã bị tắt"
    },
    expired: {
      advice:
        "Liên kết chỉ dùng được đến một ngày do đơn vị phát hành đặt. Nếu bạn vẫn cần nó, hãy liên hệ đơn vị đã in hoặc gửi liên kết cho bạn.",
      body: "Liên kết này đã hết hạn và hiện không dẫn tới đâu.",
      title: "Liên kết đã hết hạn"
    },
    unknown: {
      advice:
        "Hãy kiểm tra lại từng ký tự, nhất là các chữ dễ nhầm như 0 và o, 1 và l. Nếu bạn quét từ một ấn phẩm, hãy báo cho đơn vị đã phát hành ấn phẩm đó.",
      body: "Liên kết này không tồn tại. Vui lòng kiểm tra lại địa chỉ bạn đã gõ hoặc quét.",
      title: "Không tìm thấy liên kết"
    },
    unsafe: {
      advice:
        "Liên kết đã được đánh dấu để đơn vị quản lý kiểm tra. Chỉ tiếp tục nếu bạn tin trang này, và đừng nhập mật khẩu hay thông tin cá nhân ở đó.",
      body: "Google Safe Browsing xếp trang mà liên kết này dẫn tới vào danh sách có thể gây hại - lừa đảo hoặc mã độc.",
      title: "Trang đích có thể không an toàn"
    }
  },
  password: {
    enter: "Nhập mật khẩu mà đơn vị phát hành đã gửi cho bạn.",
    hide: "Ẩn mật khẩu",
    label: "Mật khẩu",
    open: "Mở liên kết",
    show: "Hiện mật khẩu",
    title: "Liên kết cần mật khẩu",
    tooMany: "Nhập sai quá nhiều lần. Hãy đợi một phút rồi thử lại.",
    wrong: "Mật khẩu không đúng."
  },
  whatIsThis: "Đây là gì?",
  whatIsThisBody:
    "Hệ thống đường dẫn ngắn và mã QR của {name}. Mỗi liên kết có dạng {address} và được một đơn vị của {name} quản lý."
};

const VISITOR_TEXT: Record<Language, VisitorText> = { en, vi };

/**
 * The words in the Organization's language, and the English ones to add beneath - or null when
 * the Organization's language is English already.
 */
const textsFor = (language: Language): { main: VisitorText; english: VisitorText | null } => ({
  english: language === "en" ? null : en,
  main: VISITOR_TEXT[language]
});

/** A sentence with the Organization's name put in. */
const named = (sentence: string, name: string): string => sentence.replaceAll("{name}", name);

export type { NoticeKind, VisitorText };
export { named, textsFor };
