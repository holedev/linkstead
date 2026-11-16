import { describe, expect, it } from "vitest";
import { isFetchableTarget, isPreviewFetcher, mergePreview, readPreview, renderPreviewPage } from "./preview";

const PAGE = "https://journalofscience.ou.edu.vn/so-3";

describe("a preview fetcher", () => {
  it("is told apart from a person by its user agent", () => {
    expect(isPreviewFetcher("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isPreviewFetcher("Zalo Link Preview")).toBe(true);
    expect(isPreviewFetcher("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isPreviewFetcher("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari/604.1")).toBe(false);
    expect(isPreviewFetcher(undefined)).toBe(false);
  });
});

describe("reading a page's preview", () => {
  it("takes Open Graph first, then Twitter, then the plain title and description", () => {
    const html = `<html><head>
      <title>Tiêu đề thường</title>
      <meta name="description" content="Mô tả thường">
      <meta name="twitter:title" content="Tiêu đề Twitter">
      <meta property="og:title" content="Tạp chí Khoa học &amp; Công nghệ">
      <meta content='/anh/bia.jpg' property='og:image'>
    </head></html>`;
    expect(readPreview(html, PAGE)).toEqual({
      description: "Mô tả thường",
      image: "https://journalofscience.ou.edu.vn/anh/bia.jpg",
      title: "Tạp chí Khoa học & Công nghệ"
    });
  });

  it("falls back to the <title>, and leaves out what the page does not say", () => {
    expect(readPreview("<title>\n  Trang  chủ\n</title>", PAGE)).toEqual({
      description: "",
      image: "",
      title: "Trang chủ"
    });
    expect(readPreview("", PAGE)).toEqual({ description: "", image: "", title: "" });
  });

  it("drops an image that is not https", () => {
    expect(readPreview('<meta property="og:image" content="http://cu.example/a.jpg">', PAGE).image).toBe("");
    expect(readPreview('<meta property="og:image" content="javascript:alert(1)">', PAGE).image).toBe("");
  });

  it("lets each part the Link sets win over the Đích's", () => {
    const fromTarget = { description: "Của trang", image: "https://a.vn/x.jpg", title: "Của trang" };
    expect(mergePreview({ description: "", image: "", title: "Của link" }, fromTarget)).toEqual({
      ...fromTarget,
      title: "Của link"
    });
    expect(mergePreview({ description: "", image: "", title: "" }, null)).toEqual({
      description: "",
      image: "",
      title: ""
    });
  });
});

describe("which Đích the server may read", () => {
  it("is a public https name, never an address inside a network", () => {
    expect(isFetchableTarget("https://journalofscience.ou.edu.vn/cfp")).toBe(true);
    for (const address of [
      "http://ou.edu.vn/",
      "https://10.0.0.5/",
      "https://[::1]/",
      "https://localhost/",
      "https://may-chu/",
      "https://nas.local/",
      "https://db.internal/",
      "https://ou.edu.vn:8443/",
      "https://ai:mat-khau@ou.edu.vn/",
      "khong-phai-dia-chi"
    ]) {
      expect([address, isFetchableTarget(address)]).toEqual([address, false]);
    }
  });
});

describe("the page a preview fetcher gets", () => {
  const render = (title: string) =>
    renderPreviewPage({
      linkUrl: "https://go.test/cfp-2027",
      preview: { description: "Mô tả", image: "https://a.vn/x.jpg", title },
      siteName: "OU Link",
      target: "https://journalofscience.ou.edu.vn/cfp?a=1&b=2"
    });

  it("carries the tags, names the Link as canonical, and still sends a person on", () => {
    const page = render("Hội thảo 2027");
    expect(page).toContain('<meta property="og:title" content="Hội thảo 2027">');
    expect(page).toContain('<meta property="og:url" content="https://go.test/cfp-2027">');
    expect(page).toContain('<meta property="og:image" content="https://a.vn/x.jpg">');
    expect(page).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(page).toContain('<link rel="canonical" href="https://go.test/cfp-2027">');
    expect(page).toContain('content="0;url=https://journalofscience.ou.edu.vn/cfp?a=1&amp;b=2"');
  });

  it("escapes whatever the Đích's page said, so it cannot add markup of its own", () => {
    const page = render('"><script>alert(1)</script>');
    expect(page).not.toContain("<script>");
    expect(page).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("names the Đích's host when nobody gave a title", () => {
    const page = renderPreviewPage({
      linkUrl: "https://go.test/x",
      preview: { description: "", image: "", title: "" },
      siteName: "OU Link",
      target: "https://forms.gle/abc"
    });
    expect(page).toContain('<meta property="og:title" content="forms.gle">');
    expect(page).not.toContain("og:image");
  });
});
