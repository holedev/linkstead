import type { VisitSource } from "../api";

/**
 * Where Lượt mở came from - by Quốc gia and by Nguồn giới thiệu - as short ranked lists. Counts
 * only (ADR-0005): "" is "not known", which for referring sites is usually the largest group,
 * since a scanned QR sends none.
 */

const number = new Intl.NumberFormat("vi-VN");
const SHOWN = 8;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["vi"], { type: "region" });
  } catch {
    return null;
  }
})();

/** `VN` as "Việt Nam", or the two letters where the browser does not know the name. */
const countryName = (code: string): string => {
  if (!code) {
    return "Không rõ";
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

const siteName = (host: string): string => host || "Không rõ (quét QR, gõ tay, ứng dụng chat)";

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
        <p className='mt-1 text-muted-foreground text-sm'>Chưa có số liệu.</p>
      ) : (
        <ul className='mt-2 space-y-1.5'>
          {shown.map((source) => (
            <li className='text-sm' key={source.value}>
              <div className='flex items-baseline justify-between gap-2'>
                <span className={source.value ? "min-w-0 truncate" : "min-w-0 truncate text-muted-foreground"}>
                  {nameOf(source.value)}
                </span>
                <span className='shrink-0 text-muted-foreground tabular-nums'>
                  {number.format(source.count)} · {Math.round((source.count / total) * 100)}%
                </span>
              </div>
              <div aria-hidden='true' className='mt-1 h-1.5 rounded-full bg-muted'>
                <div className='h-full rounded-full bg-primary' style={{ width: `${(source.count / total) * 100}%` }} />
              </div>
            </li>
          ))}
          {rest > 0 && (
            <li className='text-muted-foreground text-xs'>và {number.format(rest)} lượt mở từ những nơi khác</li>
          )}
        </ul>
      )}
    </section>
  );
};

/** Both lists side by side, or stacked on a phone. */
const VisitSources = ({ countries, referrers }: { countries: VisitSource[]; referrers: VisitSource[] }) => (
  <div className='space-y-2'>
    <div className='grid gap-5 sm:grid-cols-2'>
      <SourceList nameOf={countryName} sources={countries} title='Theo quốc gia' />
      <SourceList nameOf={siteName} sources={referrers} title='Theo nguồn giới thiệu' />
    </div>
    <p className='text-muted-foreground text-xs'>
      Chỉ đếm số lượt, không lưu gì về người mở. Lượt mở từ trước khi hệ thống bắt đầu ghi quốc gia và nguồn không nằm
      trong hai danh sách này.
    </p>
  </div>
);

export { countryName, VisitSources };
