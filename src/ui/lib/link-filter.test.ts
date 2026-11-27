import { describe, expect, it } from "vitest";
import { applyFilter, DEFAULT_FILTER, fold, isFiltering, readFilter, writeFilter } from "./link-filter";

const link = (over: Partial<Parameters<typeof applyFilter>[0][number]>) => ({
  archived: false,
  code: "abc123",
  createdAt: "2027-03-01T00:00:00.000Z",
  enabled: true,
  groupId: null,
  name: "Link",
  note: "",
  target: "https://example.org/",
  visits: 0,
  ...over
});

const LINKS = [
  link({
    code: "cfp-2027",
    createdAt: "2027-03-02T00:00:00.000Z",
    groupId: 1,
    name: "Poster Hội thảo 2027",
    visits: 5
  }),
  link({
    code: "so-3",
    createdAt: "2027-03-01T00:00:00.000Z",
    name: "Bài báo số 3",
    note: "Đăng trên Zalo",
    visits: 9
  }),
  link({ code: "cu", createdAt: "2027-02-01T00:00:00.000Z", enabled: false, groupId: 2, name: "Đường dẫn cũ" }),
  link({ archived: true, code: "xong", createdAt: "2026-12-01T00:00:00.000Z", groupId: 1, name: "Hội thảo 2026" })
];

const codes = (links: { code: string }[]) => links.map((one) => one.code);

describe("finding Links", () => {
  it("ignores case and Vietnamese marks, so a phone keyboard finds what it should", () => {
    expect(fold("Hội Thảo Đường")).toBe("hoi thao duong");
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "hoi thao" }))).toEqual(["cfp-2027"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "duong" }))).toEqual(["cu"]);
  });

  it("searches the code, the Target and the note too, and needs every word typed", () => {
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "so-3" }))).toEqual(["so-3"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "zalo bai" }))).toEqual(["so-3"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "zalo hoi" }))).toEqual([]);
    expect(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "example.org" })).toHaveLength(3);
  });

  it("shows at the top only the Links in no Group, and inside a Group only its own", () => {
    expect(codes(applyFilter(LINKS, DEFAULT_FILTER))).toEqual(["so-3"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, group: 1 }))).toEqual(["cfp-2027"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, group: 2 }))).toEqual(["cu"]);
  });

  it("searches every Link from the top, but only the Group's from inside it", () => {
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "duong" }))).toEqual(["cu"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, group: 1, query: "duong" }))).toEqual([]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, group: 2, query: "duong" }))).toEqual(["cu"]);
  });

  it("filters by state wherever it is", () => {
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, group: 2, status: "on" }))).toEqual([]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "example", status: "off" }))).toEqual(["cu"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "example", status: "on" }))).toEqual([
      "cfp-2027",
      "so-3"
    ]);
  });

  it("orders newest first by default, or oldest, most opened, or by name", () => {
    const everywhere = { ...DEFAULT_FILTER, query: "example.org" };
    expect(codes(applyFilter(LINKS, everywhere))).toEqual(["cfp-2027", "so-3", "cu"]);
    expect(codes(applyFilter(LINKS, { ...everywhere, sort: "old" }))).toEqual(["cu", "so-3", "cfp-2027"]);
    expect(codes(applyFilter(LINKS, { ...everywhere, sort: "visits" }))).toEqual(["so-3", "cfp-2027", "cu"]);
    expect(codes(applyFilter(LINKS, { ...everywhere, sort: "name" }))).toEqual(["so-3", "cu", "cfp-2027"]);
  });

  it("keeps archived Links out of every view but their own, which looks through every Group", () => {
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, group: 1 }))).toEqual(["cfp-2027"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, query: "hoi thao" }))).toEqual(["cfp-2027"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, status: "archived" }))).toEqual(["xong"]);
    expect(codes(applyFilter(LINKS, { ...DEFAULT_FILTER, group: 2, status: "archived" }))).toEqual([]);
  });

  it("leaves the list it was given as it was", () => {
    const before = codes(LINKS);
    applyFilter(LINKS, { ...DEFAULT_FILTER, sort: "name" });
    expect(codes(LINKS)).toEqual(before);
  });
});

describe("a filter in the address", () => {
  it("round-trips, writing nothing for what is the default", () => {
    const filter = { group: 3, query: "hội thảo", sort: "visits", status: "off" } as const;
    expect(readFilter(writeFilter(filter))).toEqual(filter);
    expect(writeFilter(DEFAULT_FILTER).toString()).toBe("");
    expect(readFilter(new URLSearchParams("group=none")).group).toBe("root");
  });

  it("falls back to the default for anything it does not understand", () => {
    expect(readFilter(new URLSearchParams("status=maybe&sort=random&group=-2"))).toEqual(DEFAULT_FILTER);
  });

  it("knows when it narrows the list", () => {
    expect(isFiltering(DEFAULT_FILTER)).toBe(false);
    expect(isFiltering({ ...DEFAULT_FILTER, sort: "name" })).toBe(false);
    expect(isFiltering({ ...DEFAULT_FILTER, query: " " })).toBe(false);
    // Being inside a Group is a place, not a filter.
    expect(isFiltering({ ...DEFAULT_FILTER, group: 4 })).toBe(false);
    expect(isFiltering({ ...DEFAULT_FILTER, status: "off" })).toBe(true);
  });
});
