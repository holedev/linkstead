/**
 * Finding Links on the Links screen: what was typed, which state, which Nhóm, in what order. Pure,
 * so it is tested without a browser; the screen keeps it in the address, so a filtered view can
 * be bookmarked or sent to a colleague.
 */

type Status = "all" | "on" | "off";
type Sort = "new" | "old" | "visits" | "name";
/**
 * Where on the Links screen: inside one Nhóm, by its id, or at the top - "root" - where the Nhóm
 * show as folders and the Links in none are listed, as the Đơn vị's shared ones.
 */
type GroupFilter = number | "root";

type LinkFilter = { query: string; status: Status; group: GroupFilter; sort: Sort };

type Filterable = {
  code: string;
  name: string;
  note: string;
  target: string;
  enabled: boolean;
  groupId: number | null;
  visits: number;
  createdAt: string;
};

const DEFAULT_FILTER: LinkFilter = { group: "root", query: "", sort: "new", status: "all" };

const STATUSES: readonly Status[] = ["all", "on", "off"];
const SORTS: readonly Sort[] = ["new", "old", "visits", "name"];

const MARKS = /\p{Diacritic}/gu;
const SPACES = /\s+/;

/**
 * Text as it is compared: lowercase, without Vietnamese marks, đ as d - so "hoi thao" finds
 * "Hội thảo", as people type on a phone without switching keyboards.
 */
const fold = (text: string): string =>
  text.normalize("NFD").replace(MARKS, "").replaceAll("đ", "d").replaceAll("Đ", "d").toLowerCase();

/** Every word typed must appear somewhere in the Link's name, code, Đích or note. */
const matchesQuery = (link: Filterable, query: string): boolean => {
  const words = fold(query).split(SPACES).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = fold(`${link.name} ${link.code} ${link.target} ${link.note}`);
  return words.every((word) => haystack.includes(word));
};

/**
 * Inside a Nhóm, its Links. At the top, the Links in no Nhóm - unless something is searched for,
 * which looks through every Link, wherever it is sorted.
 */
const matchesGroup = (link: Filterable, group: GroupFilter, query: string): boolean => {
  if (group !== "root") {
    return link.groupId === group;
  }
  return Boolean(query.trim()) || link.groupId === null;
};

const matchesStatus = (link: Filterable, status: Status): boolean =>
  status === "all" || (status === "on") === link.enabled;

const COLLATOR = new Intl.Collator("vi");

const ORDER: Record<Sort, (a: Filterable, b: Filterable) => number> = {
  name: (a, b) => COLLATOR.compare(a.name, b.name),
  new: (a, b) => b.createdAt.localeCompare(a.createdAt),
  old: (a, b) => a.createdAt.localeCompare(b.createdAt),
  visits: (a, b) => b.visits - a.visits
};

const applyFilter = <T extends Filterable>(links: readonly T[], filter: LinkFilter): T[] =>
  links
    .filter(
      (link) =>
        matchesQuery(link, filter.query) &&
        matchesGroup(link, filter.group, filter.query) &&
        matchesStatus(link, filter.status)
    )
    .sort(ORDER[filter.sort]);

const readGroup = (raw: string | null): GroupFilter => {
  const id = Number(raw);
  return raw && Number.isInteger(id) && id > 0 ? id : "root";
};

/** The filter an address describes. Anything it does not understand falls back to the default. */
const readFilter = (params: URLSearchParams): LinkFilter => {
  const status = params.get("status");
  const sort = params.get("sort");
  const group = params.get("group");
  return {
    group: readGroup(group),
    query: params.get("q") ?? "",
    sort: SORTS.includes(sort as Sort) ? (sort as Sort) : "new",
    status: STATUSES.includes(status as Status) ? (status as Status) : "all"
  };
};

/** The address parameters for a filter, leaving out whatever is the default. */
const writeFilter = (filter: LinkFilter): URLSearchParams => {
  const params = new URLSearchParams();
  if (filter.query) {
    params.set("q", filter.query);
  }
  if (filter.status !== "all") {
    params.set("status", filter.status);
  }
  if (filter.group !== "root") {
    params.set("group", String(filter.group));
  }
  if (filter.sort !== "new") {
    params.set("sort", filter.sort);
  }
  return params;
};

/** Whether the list is narrowed by a search or a state - being inside a Nhóm is where, not a filter. */
const isFiltering = (filter: LinkFilter): boolean => Boolean(filter.query.trim()) || filter.status !== "all";

export {
  applyFilter,
  DEFAULT_FILTER,
  fold,
  type GroupFilter,
  isFiltering,
  type LinkFilter,
  readFilter,
  type Sort,
  type Status,
  writeFilter
};
