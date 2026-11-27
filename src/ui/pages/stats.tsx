import { useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import { Card, ErrorText, formatNumber } from "@/components/app";
import { cn } from "@/lib/utils";
import { api, type UnitVisits } from "../api";
import { text } from "../i18n";
import { organization } from "../organization";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { HourlyVisitsChart } from "./hourly-visits";
import { VisitSources } from "./visit-sources";

/**
 * A Unit's Visits at a glance: how many over a stretch of days, how they spread over the days,
 * which Links were opened most, and where the openings came from. Estimates, and said to be.
 */

const t = text().stats;

const RANGES: { days: 7 | 30 | 90 | 365 | null; label: string }[] = [
  { days: 7, label: t.rangeDays(7) },
  { days: 30, label: t.rangeDays(30) },
  { days: 90, label: t.rangeDays(90) },
  { days: 365, label: t.oneYear },
  { days: null, label: t.allTime }
];

type RangeDays = (typeof RANGES)[number]["days"];

const number = { format: formatNumber };
const DAY_MS = 24 * 60 * 60 * 1000;
/** Past this many days a bar per day is too thin to read, and the chart shows months. */
const MAX_DAY_BARS = 92;

const readRange = (raw: string | null): RangeDays => {
  if (raw === "all") {
    return null;
  }
  const days = Number(raw);
  return RANGES.find((range) => range.days === days)?.days ?? 30;
};

const formatDay = (day: string): string => day.split("-").reverse().join("/");

/** Every day from `first` to `last`, `yyyy-mm-dd`, so a day nobody opened anything shows as 0. */
const daysBetween = (first: string, last: string): string[] => {
  const out: string[] = [];
  for (let at = Date.parse(`${first}T00:00:00Z`); at <= Date.parse(`${last}T00:00:00Z`); at += DAY_MS) {
    out.push(new Date(at).toISOString().slice(0, 10));
  }
  return out;
};

type Bar = { key: string; label: string; count: number };

/** One bar per day, or per month when the stretch is long. */
const barsOf = (data: UnitVisits): Bar[] => {
  const first = data.since ?? data.days[0]?.day;
  if (!first) {
    return [];
  }
  const counts = new Map(data.days.map((day) => [day.day, day.count]));
  const days = daysBetween(first, data.today);
  if (days.length <= MAX_DAY_BARS) {
    return days.map((day) => ({ count: counts.get(day) ?? 0, key: day, label: formatDay(day) }));
  }
  const months = new Map<string, number>();
  for (const day of days) {
    const month = day.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + (counts.get(day) ?? 0));
  }
  return [...months].map(([month, count]) => ({
    count,
    key: month,
    label: t.month(month.slice(5), month.slice(0, 4))
  }));
};

const Tile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <Card>
    <p className='text-muted-foreground text-sm'>{label}</p>
    <p className='mt-1 font-semibold text-3xl tabular-nums tracking-tight'>{value}</p>
    {hint && <p className='mt-1 text-muted-foreground text-xs'>{hint}</p>}
  </Card>
);

/** The bars, each with its own hover label; a table says the same to a screen reader. */
const BarChart = ({ bars, unit }: { bars: Bar[]; unit: "day" | "month" }) => {
  const [active, setActive] = useState<Bar | null>(null);
  const peak = Math.max(1, ...bars.map((bar) => bar.count));
  const [first] = bars;
  const last = bars.at(-1);
  const hint = unit === "day" ? t.hoverDay : t.hoverMonth;
  return (
    <div>
      <p aria-hidden='true' className='h-5 text-muted-foreground text-sm'>
        {active ? (
          <>
            {active.label}: <span className='font-medium text-foreground'>{number.format(active.count)}</span>{" "}
            {t.visits}
          </>
        ) : (
          hint
        )}
      </p>
      <div
        aria-hidden='true'
        className='mt-3 flex h-48 items-end gap-0.5 border-b'
        onMouseLeave={() => setActive(null)}
      >
        {bars.map((bar) => (
          <div
            aria-hidden='true'
            className='group flex h-full min-w-0 flex-1 items-end'
            key={bar.key}
            onMouseEnter={() => setActive(bar)}
          >
            <div
              className={cn(
                "w-full rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary",
                bar.count === 0 && "bg-transparent"
              )}
              style={{ height: `${(bar.count / peak) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden='true' className='mt-1 flex justify-between text-muted-foreground text-xs'>
        <span>{first?.label}</span>
        <span>{last?.label}</span>
      </div>
      <table className='sr-only'>
        <caption>{unit === "day" ? t.tableByDay : t.tableByMonth}</caption>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.key}>
              <th>{bar.label}</th>
              <td>{bar.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TopLinks = ({ links }: { links: UnitVisits["topLinks"] }) => {
  const peak = Math.max(1, ...links.map((link) => link.count));
  if (links.length === 0) {
    return <p className='text-muted-foreground text-sm'>{t.noneInRange}</p>;
  }
  return (
    <ol className='space-y-2.5'>
      {links.map((link, index) => (
        <li className='text-sm' key={link.code}>
          <div className='flex items-baseline gap-2'>
            <span className='w-5 shrink-0 text-muted-foreground tabular-nums'>{index + 1}.</span>
            <RouterLink
              className='min-w-0 flex-1 truncate underline-offset-4 hover:underline'
              to={`/?q=${encodeURIComponent(link.code)}`}
            >
              {link.name} <span className='font-mono text-muted-foreground text-xs'>/{link.code}</span>
            </RouterLink>
            <span className='shrink-0 tabular-nums'>{number.format(link.count)}</span>
          </div>
          <div aria-hidden='true' className='mt-1 ml-7 h-1.5 rounded-full bg-muted'>
            <div className='h-full rounded-full bg-primary' style={{ width: `${(link.count / peak) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
};

const busiestOf = (data: UnitVisits) =>
  data.days.reduce<{ day: string; count: number } | null>(
    (best, day) => (best && best.count >= day.count ? best : day),
    null
  );

const StatsPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const [params, setParams] = useSearchParams();
  const range = readRange(params.get("days"));
  // Keyed by the range too: another stretch is another answer, not a reload of this one.
  const { data, error } = useLoaded(`${unitId}:${range}`, () => api.unitVisits(unitId, range));
  const bars = data ? barsOf(data) : [];
  const busiest = data ? busiestOf(data) : null;
  const dayCount = data?.since ? daysBetween(data.since, data.today).length : bars.length;

  return (
    <>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 className='font-bold text-2xl tracking-tight'>{t.title}</h1>
          <p className='text-muted-foreground text-sm'>{t.subtitle(unit?.unitName ?? "")}</p>
        </div>
        <fieldset className='flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1'>
          <legend className='sr-only'>{t.range}</legend>
          {RANGES.map((option) => (
            <button
              aria-pressed={option.days === range}
              className={cn(
                "h-9 rounded-md px-3 font-medium text-sm transition md:h-8",
                option.days === range ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              key={option.label}
              onClick={() => setParams(option.days === 30 ? {} : { days: String(option.days ?? "all") })}
              type='button'
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>

      <ErrorText>{error}</ErrorText>
      {!(data || error) && <p className='text-muted-foreground'>{text().common.loading}</p>}

      {data && (
        <>
          <div className='grid gap-3 sm:grid-cols-3'>
            <Tile
              hint={data.since ? t.sinceUntilToday(formatDay(data.since)) : t.sinceFirstLink}
              label={t.total}
              value={number.format(data.total)}
            />
            <Tile
              label={t.average}
              value={number.format(dayCount ? Math.round((data.total / dayCount) * 10) / 10 : 0)}
            />
            <Tile
              hint={busiest ? formatDay(busiest.day) : undefined}
              label={t.busiest}
              value={busiest ? number.format(busiest.count) : "0"}
            />
          </div>

          <Card>
            <h2 className='font-medium'>{bars.length > 0 && bars[0]?.key.length === 7 ? t.byMonth : t.byDay}</h2>
            {bars.length > 0 ? (
              <div className='mt-3'>
                <BarChart bars={bars} unit={bars[0]?.key.length === 7 ? "month" : "day"} />
              </div>
            ) : (
              <p className='mt-2 text-muted-foreground text-sm'>{t.noVisits}</p>
            )}
          </Card>

          <div className='grid gap-4'>
            <Card>
              <h2 className='mb-3 font-medium'>{t.topLinks}</h2>
              <TopLinks links={data.topLinks} />
            </Card>
            <Card>
              <h2 className='mb-3 font-medium'>{t.sources}</h2>
              <VisitSources visits={data} />
            </Card>
            {organization().hourlyVisits && (
              <Card>
                <HourlyVisitsChart load={(days) => api.unitVisitHours(unitId, days)} stamp={String(unitId)} />
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
};

export { StatsPage };
