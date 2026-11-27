import { formatNumber } from "@/components/app";
import type { VisitSource, Visits } from "../api";
import { locale, text } from "../i18n";

/**
 * Where Visits came from - by Country, Referring Site, Device and Browser - as short ranked lists.
 * Counts only (ADR-0005, ADR-0008): "" is "not known", which for referring sites is usually the
 * largest group, since a scanned QR sends none.
 */

const SHOWN = 8;
const t = text().visitSources;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames([locale()], { type: "region" });
  } catch {
    return null;
  }
})();

/** `VN` as "Vietnam" in the UI's language, or the two letters where the browser does not know the name. */
const countryName = (code: string): string => {
  if (!code) {
    return t.unknown;
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

const siteName = (host: string): string => host || t.unknownSite;

/** A device class as a word in the UI's language. */
const deviceName = (device: string): string => t.devices[device] ?? t.unknown;

/** Browser families by the names their makers give them; "other" in the UI's language. */
const BROWSER_NAMES: Record<string, string> = {
  chrome: "Chrome",
  edge: "Edge",
  facebook: "Facebook / Messenger",
  firefox: "Firefox",
  instagram: "Instagram",
  opera: "Opera",
  safari: "Safari",
  samsung: "Samsung Internet",
  zalo: "Zalo"
};

const browserName = (browser: string): string => BROWSER_NAMES[browser] ?? t.otherBrowser;

const SourceList = ({
  title,
  sources,
  nameOf
}: {
  title: string;
  sources: VisitSource[];
  nameOf: (value: string) => string;
}) => {
  const total = sources.reduce((sum, source) => sum + source.count, 0);
  const shown = sources.slice(0, SHOWN);
  const rest = sources.slice(SHOWN).reduce((sum, source) => sum + source.count, 0);
  return (
    <section>
      <h4 className='font-medium text-sm'>{title}</h4>
      {total === 0 ? (
        <p className='mt-1 text-muted-foreground text-sm'>{t.noData}</p>
      ) : (
        <ul className='mt-2 space-y-1.5'>
          {shown.map((source) => (
            <li className='text-sm' key={source.value}>
              <div className='flex items-baseline justify-between gap-2'>
                <span className={source.value ? "min-w-0 truncate" : "min-w-0 truncate text-muted-foreground"}>
                  {nameOf(source.value)}
                </span>
                <span className='shrink-0 text-muted-foreground tabular-nums'>
                  {formatNumber(source.count)} · {Math.round((source.count / total) * 100)}%
                </span>
              </div>
              <div aria-hidden='true' className='mt-1 h-1.5 rounded-full bg-muted'>
                <div className='h-full rounded-full bg-primary' style={{ width: `${(source.count / total) * 100}%` }} />
              </div>
            </li>
          ))}
          {rest > 0 && <li className='text-muted-foreground text-xs'>{t.fromElsewhere(formatNumber(rest))}</li>}
        </ul>
      )}
    </section>
  );
};

/** The four lists side by side, two by two, or stacked on a phone. */
const VisitSources = ({ visits }: { visits: Pick<Visits, "countries" | "referrers" | "devices" | "browsers"> }) => (
  <div className='space-y-2'>
    <div className='grid gap-5 sm:grid-cols-2'>
      <SourceList nameOf={countryName} sources={visits.countries} title={t.byCountry} />
      <SourceList nameOf={siteName} sources={visits.referrers} title={t.byReferrer} />
      <SourceList nameOf={deviceName} sources={visits.devices} title={t.byDevice} />
      <SourceList nameOf={browserName} sources={visits.browsers} title={t.byBrowser} />
    </div>
    <p className='text-muted-foreground text-xs'>{t.note}</p>
  </div>
);

export { countryName, VisitSources };
