import { useEffect, useState } from "react";
import { ErrorText, formatNumber } from "@/components/app";
import { cn } from "@/lib/utils";
import type { HourlyVisits } from "../api";
import { text } from "../i18n";
import { messageOf } from "../messages";

/**
 * Visits by the hour of the day, on the Organization's clocks, over the last 7, 30 or 90 days -
 * offered only where Visits go through Analytics Engine, which alone keeps the time of a Visit,
 * and for three months only (ADR-0008).
 */

const RANGES = [7, 30, 90] as const;

const HourlyVisitsChart = ({ load, stamp }: { load: (days: number) => Promise<HourlyVisits>; stamp: string }) => {
  const t = text().hourly;
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<HourlyVisits | null>(null);
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is the same call on every render; `stamp` and `days` say when to read again
  useEffect(() => {
    let current = true;
    setError("");
    load(days)
      .then((answer) => current && setData(answer))
      .catch((failure) => current && setError(messageOf(failure)));
    return () => {
      current = false;
    };
  }, [stamp, days]);

  const hours = data?.hours ?? [];
  const peak = Math.max(1, ...hours);
  const busiest = hours.indexOf(Math.max(...hours));
  const total = hours.reduce((sum, count) => sum + count, 0);

  return (
    <section className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='font-medium'>{t.title}</h2>
        <fieldset className='flex gap-1 rounded-lg border bg-muted/40 p-1'>
          <legend className='sr-only'>{text().stats.range}</legend>
          {RANGES.map((range) => (
            <button
              aria-pressed={range === days}
              className={cn(
                "h-8 rounded-md px-2.5 font-medium text-sm",
                range === days ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              key={range}
              onClick={() => setDays(range)}
              type='button'
            >
              {text().stats.rangeDays(range)}
            </button>
          ))}
        </fieldset>
      </div>
      <ErrorText>{error}</ErrorText>
      {data && total === 0 && <p className='text-muted-foreground text-sm'>{text().stats.noVisits}</p>}
      {data && total > 0 && (
        <>
          <div
            aria-label={t.summary(busiest, formatNumber(total))}
            className='flex h-32 items-end gap-0.5 border-b'
            role='img'
          >
            {hours.map((count, hour) => (
              <div
                className={cn("min-w-0 flex-1 rounded-t-sm bg-primary/70", count === 0 && "bg-transparent")}
                // biome-ignore lint/suspicious/noArrayIndexKey: the index is the hour, and the bars never move
                key={hour}
                style={{ height: `${(count / peak) * 100}%` }}
                title={t.bar(hour, formatNumber(count))}
              />
            ))}
          </div>
          <div aria-hidden='true' className='flex justify-between text-muted-foreground text-xs tabular-nums'>
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
          <p className='text-muted-foreground text-xs'>{t.note}</p>
        </>
      )}
    </section>
  );
};

export { HourlyVisitsChart };
