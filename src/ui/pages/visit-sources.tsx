import { formatNumber } from "@/components/app";
import type { VisitSource } from "../api";
import { locale, text } from "../i18n";

/**
 * Where Visits came from - by Country and by Referring Site - as short ranked lists. Counts
 * only (ADR-0005): "" is "not known", which for referring sites is usually the largest group,
 * since a scanned QR sends none.
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

/** Both lists side by side, or stacked on a phone. */
const VisitSources = ({ countries, referrers }: { countries: VisitSource[]; referrers: VisitSource[] }) => (
  <div className='space-y-2'>
    <div className='grid gap-5 sm:grid-cols-2'>
      <SourceList nameOf={countryName} sources={countries} title={t.byCountry} />
      <SourceList nameOf={siteName} sources={referrers} title={t.byReferrer} />
    </div>
    <p className='text-muted-foreground text-xs'>{t.note}</p>
  </div>
);

export { countryName, VisitSources };
