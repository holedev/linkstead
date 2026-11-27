import { raw } from "hono/html";
import {
  AlsoEnglish,
  ArrowRightIcon,
  Footer,
  Icon,
  pair,
  type Site,
  TopBand,
  VisitorPage,
  WithAddress
} from "./visitor-page";
import { type NoticeKind, named, textsFor } from "./visitor-text";

/**
 * The pages a visitor can meet instead of a redirect, in the Organization's language with English
 * beneath (`visitor-text.ts`). Each says which address was opened and what these links are, and
 * offers the introduction - but never sends the visitor there by itself: an unknown, switched-off
 * or deleted Link does not fall back to a home page. A Link whose Target the daily check found
 * unsafe warns, and leaves going on to the visitor.
 */

const STYLE = `
.notice{max-width:38rem;margin:6vh auto 0;padding:1.75rem}
.badge{display:grid;place-items:center;width:3rem;height:3rem;margin-bottom:1.1rem;border-radius:.9rem;background:var(--warn-soft);color:var(--warn)}
.notice h1{font-size:1.5rem;line-height:1.3}
.notice .sub{margin-top:.15rem}
.notice .stack>*+*{margin-top:1rem}
.danger{background:var(--danger-soft);color:var(--danger)}
.hint{padding:.85rem 1rem;border-left:3px solid var(--warn);border-radius:.4rem;background:var(--warn-soft);font-size:.92rem}
.about{display:flex;gap:.8rem;max-width:38rem;margin:1rem auto 0;padding:1rem 1.25rem;font-size:.92rem}
.about b{display:block}
@media (max-width:30rem){.notice{margin-top:2vh;padding:1.25rem}.notice .actions .btn{flex:1}}
`;

const UnknownIcon = () => (
  <Icon size={24}>
    <circle cx='11' cy='11' r='8' />
    <path d='m21 21-4.3-4.3' />
    <path d='m13.5 8.5-5 5' />
    <path d='m8.5 8.5 5 5' />
  </Icon>
);

const DeletedIcon = () => (
  <Icon size={24}>
    <path d='M3 6h18' />
    <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
    <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
  </Icon>
);

const ExpiredIcon = () => (
  <Icon size={24}>
    <circle cx='12' cy='12' r='9' />
    <path d='M12 7v5l3 2' />
  </Icon>
);

const WarningIcon = () => (
  <Icon size={24}>
    <path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' />
    <path d='M12 9v4' />
    <path d='M12 17h.01' />
  </Icon>
);

const ICONS: Record<NoticeKind, () => unknown> = {
  deleted: () => <DeletedIcon />,
  disabled: () => <DisabledIcon />,
  expired: () => <ExpiredIcon />,
  unknown: () => <UnknownIcon />,
  unsafe: () => <WarningIcon />
};

const DisabledIcon = () => (
  <Icon size={24}>
    <path d='M18.36 6.64A9 9 0 0 1 20.77 15' />
    <path d='M6.16 6.16a9 9 0 1 0 12.68 12.68' />
    <path d='M12 2v4' />
    <path d='m2 2 20 20' />
  </Icon>
);

/** What fits on a phone: an address past this is cut, and is wrong anyway. */
const MAX_SHOWN = 80;

/**
 * The address as the visitor would recognise it: the host and the path, with %-escapes decoded so
 * "/hội-thảo" reads as typed. Only ever rendered as text, so whatever it holds stays text.
 */
const shownAddress = (url: string): string => {
  const { host, pathname } = new URL(url);
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A broken escape is shown as it came.
  }
  const address = `${host}${path}`;
  return address.length > MAX_SHOWN ? `${address.slice(0, MAX_SHOWN - 1)}…` : address;
};

/** Going on anyway, for the one kind that allows it: the Target shown in full, never a hidden hop. */
const GoOn = ({ target, site }: { target: string; site: Site }) => {
  const { main, english } = textsFor(site.language);
  return (
    <div>
      <span class='label'>{pair(main.destination, english?.destination)}</span>
      <code class='address'>{target}</code>
      <p style='margin-top:.6rem'>
        <a href={target} rel='noreferrer nofollow'>
          {pair(main.continueAnyway, english?.continueAnyway)}
        </a>
      </p>
    </div>
  );
};

const Notice = ({ kind, url, target, site }: { kind: NoticeKind; url: string; target?: string; site: Site }) => {
  const { main, english } = textsFor(site.language);
  const text = main.notice[kind];
  const englishText = english?.notice[kind];
  const example = `${new URL(url).host}/…`;
  return (
    <VisitorPage
      description={`${text.title} - ${site.name}`}
      head={<style>{raw(STYLE)}</style>}
      site={site}
      title={`${text.title} - ${site.name}`}
    >
      <TopBand site={site} />
      <main class='wrap'>
        <section class='card notice'>
          <div class={kind === "unsafe" ? "badge danger" : "badge"}>{ICONS[kind]()}</div>
          <div class='stack'>
            <div>
              <h1>{text.title}</h1>
              {englishText ? <AlsoEnglish class='en sub'>{englishText.title}</AlsoEnglish> : null}
            </div>
            <div>
              <span class='label'>{pair(main.addressOpened, english?.addressOpened)}</span>
              <code class='address'>{shownAddress(url)}</code>
            </div>
            <p>{text.body}</p>
            {englishText ? <AlsoEnglish>{englishText.body}</AlsoEnglish> : null}
            <div class='hint'>
              <p>{text.advice}</p>
              {englishText ? <AlsoEnglish>{englishText.advice}</AlsoEnglish> : null}
            </div>
            {kind === "unsafe" && target ? <GoOn site={site} target={target} /> : null}
            <div class='actions'>
              <a class='btn primary' href='/'>
                {named(main.aboutLinks, site.name)}
                <ArrowRightIcon />
              </a>
            </div>
          </div>
        </section>
        <aside class='card about'>
          <div>
            <b>{main.whatIsThis}</b>
            <p class='muted'>
              <WithAddress address={example} name={site.name} text={main.whatIsThisBody} />
            </p>
            {english ? (
              <AlsoEnglish>
                <WithAddress address={example} name={site.name} text={english.whatIsThisBody} />
              </AlsoEnglish>
            ) : null}
          </div>
        </aside>
      </main>
      <Footer site={site} />
    </VisitorPage>
  );
};

export { Notice, shownAddress };
