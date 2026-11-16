/**
 * The two pages a visitor can meet instead of a redirect. Vietnamese and English on the same
 * page: whoever scans a QR on a conference poster may read neither the other.
 */

type NoticeKind = "unknown" | "disabled";

const TEXT: Record<NoticeKind, { vi: string; en: string }> = {
  disabled: {
    en: "This link has been switched off and no longer leads anywhere.",
    vi: "Liên kết này đã bị tắt và hiện không dẫn tới đâu."
  },
  unknown: {
    en: "This link does not exist. Please check the address you typed or scanned.",
    vi: "Liên kết này không tồn tại. Vui lòng kiểm tra lại địa chỉ bạn đã gõ hoặc quét."
  }
};

const Notice = ({ kind }: { kind: NoticeKind }) => (
  <html lang='vi'>
    <head>
      <meta charset='utf-8' />
      <meta content='width=device-width, initial-scale=1' name='viewport' />
      <meta content='noindex' name='robots' />
      <title>OU Link</title>
    </head>
    <body style='font-family: system-ui, sans-serif; max-width: 32rem; margin: 15vh auto; padding: 0 1rem; line-height: 1.5'>
      <h1 style='font-size: 1.25rem'>Trường Đại học Mở Thành phố Hồ Chí Minh</h1>
      <p>{TEXT[kind].vi}</p>
      <p lang='en' style='color: #555'>
        {TEXT[kind].en}
      </p>
    </body>
  </html>
);

export { Notice, type NoticeKind };
