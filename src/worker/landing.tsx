import { raw } from "hono/html";
import {
  AlsoEnglish,
  ArrowRightIcon,
  Footer,
  Icon,
  LinkIcon,
  type Site,
  TopBand,
  VisitorPage,
  WithAddress
} from "./visitor-page";
import { named, textsFor } from "./visitor-text";

/**
 * What answers at `/`: what these links are, for the visitor who trimmed a Link down to its domain
 * and for the colleague who is about to be given an account. In the Organization's language, with
 * English beneath where a visitor reads it; the part about working with Links is in its language
 * only, as the admin UI is.
 */

const STYLE = `
.hero{display:grid;gap:2.5rem;align-items:center;padding-top:3.5rem;padding-bottom:3rem}
@media (min-width:56rem){.hero{grid-template-columns:1.1fr .9fr;padding-top:5rem;padding-bottom:4rem}}
.eyebrow{display:inline-block;margin-bottom:1rem;padding:.25rem .7rem;border-radius:99rem;background:var(--brand-soft);color:var(--brand);font-size:.8rem;font-weight:600}
.hero h1{font-size:clamp(2rem,5vw,3rem);line-height:1.15;letter-spacing:-.02em}
.hero h1 span{color:var(--brand)}
.lead{margin-top:1.1rem;font-size:1.1rem}
.hero .en{margin-top:.75rem}
.hero .actions{margin-top:1.75rem}
.demo{padding:1.25rem;box-shadow:0 20px 40px -24px rgb(15 27 45 / .35)}
.demo .row{display:flex;align-items:center;gap:.75rem}
.demo .dot{flex:none;display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:.6rem;background:var(--brand-soft);color:var(--brand)}
.demo .grow{min-width:0;flex:1}
.demo .down{display:flex;justify-content:center;padding:.6rem 0;color:var(--muted)}
.demo .was{opacity:.55;text-decoration:line-through}
.demo .tag{flex:none;padding:.1rem .5rem;border-radius:99rem;background:var(--brand-soft);color:var(--brand);font-size:.72rem;font-weight:600}
.demo .note{margin-top:1rem;padding-top:1rem;border-top:1px dashed var(--border);font-size:.88rem}
section.block{padding:3rem 0;border-top:1px solid var(--border)}
.block h2{font-size:1.5rem;line-height:1.3;letter-spacing:-.01em}
.block>.wrap>p{max-width:42rem;margin-top:.5rem}
.steps,.features{display:grid;gap:1rem;margin:1.75rem 0 0;padding:0;list-style:none}
@media (min-width:44rem){.steps{grid-template-columns:repeat(3,1fr)}.features{grid-template-columns:repeat(2,1fr)}}
@media (min-width:62rem){.features{grid-template-columns:repeat(3,1fr)}}
.steps li,.features li{padding:1.25rem}
.num{display:grid;place-items:center;width:2rem;height:2rem;margin-bottom:.8rem;border-radius:99rem;background:var(--brand);color:var(--brand-ink);font-weight:700}
.features .dot{display:grid;place-items:center;width:2.5rem;height:2.5rem;margin-bottom:.8rem;border-radius:.7rem;background:var(--brand-soft);color:var(--brand)}
.steps h3,.features h3{font-size:1.05rem;line-height:1.35}
.steps p,.features p{margin-top:.35rem;color:var(--muted);font-size:.95rem}
.visitor{display:grid;gap:1.5rem;padding:1.5rem}
@media (min-width:48rem){.visitor{grid-template-columns:1fr 1fr;padding:2rem}}
.visitor h3{font-size:1.1rem}
.visitor p{margin-top:.4rem}
`;

const BuildingIcon = () => (
  <Icon>
    <path d='M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z' />
    <path d='M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2' />
    <path d='M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2' />
    <path d='M10 6h4' />
    <path d='M10 10h4' />
    <path d='M10 14h4' />
    <path d='M10 18h4' />
  </Icon>
);

const HistoryIcon = () => (
  <Icon>
    <path d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' />
    <path d='M3 3v5h5' />
    <path d='M12 7v5l4 2' />
  </Icon>
);

const QrIcon = () => (
  <Icon>
    <rect height='5' rx='1' width='5' x='3' y='3' />
    <rect height='5' rx='1' width='5' x='16' y='3' />
    <rect height='5' rx='1' width='5' x='3' y='16' />
    <path d='M21 16h-3a2 2 0 0 0-2 2v3' />
    <path d='M21 21v.01' />
    <path d='M12 7v3a2 2 0 0 1-2 2H7' />
    <path d='M3 12h.01' />
    <path d='M12 3h.01' />
    <path d='M12 16v.01' />
    <path d='M16 12h1' />
    <path d='M21 12v.01' />
    <path d='M12 21v-1' />
  </Icon>
);

const ChartIcon = () => (
  <Icon>
    <path d='M3 3v18h18' />
    <path d='M18 17V9' />
    <path d='M13 17V5' />
    <path d='M8 17v-3' />
  </Icon>
);

const ShieldIcon = () => (
  <Icon>
    <path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' />
  </Icon>
);

const CodeIcon = () => (
  <Icon>
    <path d='m16 18 6-6-6-6' />
    <path d='m8 6-6 6 6 6' />
  </Icon>
);

const FEATURE_ICONS = [
  <BuildingIcon key='building' />,
  <HistoryIcon key='history' />,
  <QrIcon key='qr' />,
  <ChartIcon key='chart' />,
  <ShieldIcon key='shield' />,
  <CodeIcon key='code' />
];

/** The example a visitor sees: one printed address, and the two places it led to over time. */
const Demo = ({ host, site }: { host: string; site: Site }) => {
  const { demo } = textsFor(site.language).main.landing;
  return (
    <div aria-label={demo.label} class='card demo' role='img'>
      <div class='row'>
        <span class='dot'>
          <LinkIcon />
        </span>
        <div class='grow'>
          <span class='label'>{demo.printed}</span>
          <code class='address'>{host}/conference-2027</code>
        </div>
      </div>
      <div class='down'>
        <Icon size={22}>
          <path d='M12 5v14' />
          <path d='m19 12-7 7-7-7' />
        </Icon>
      </div>
      <span class='label'>{demo.leadsTo}</span>
      <div class='row'>
        <code class='address was grow'>example.org/call-for-papers</code>
        <span class='tag'>{demo.before}</span>
      </div>
      <div class='row' style='margin-top:.5rem'>
        <code class='address grow'>example.org/programme</code>
        <span class='tag'>{demo.today}</span>
      </div>
      <p class='note muted'>{demo.note}</p>
    </div>
  );
};

const Landing = ({ url, site }: { url: string; site: Site }) => {
  const { host, origin } = new URL(url);
  const { main, english } = textsFor(site.language);
  const text = main.landing;
  const description = named(text.description, site.name);
  const example = `${host}/…`;
  return (
    <VisitorPage
      description={description}
      head={
        <>
          <meta content='website' property='og:type' />
          <meta content={site.name} property='og:title' />
          <meta content={description} property='og:description' />
          <meta content={`${origin}/`} property='og:url' />
          <style>{raw(STYLE)}</style>
        </>
      }
      indexable
      site={site}
      title={site.name}
    >
      <TopBand site={site}>
        <a class='btn primary' href='/app'>
          {text.signIn}
        </a>
      </TopBand>
      <main>
        <div class='wrap hero'>
          <div>
            <span class='eyebrow'>{site.name}</span>
            <h1>
              {text.headline} <span>{text.headlineStress}</span>
            </h1>
            <p class='lead muted'>{named(text.lead, site.name)}</p>
            {english ? <AlsoEnglish>{named(english.landing.description, site.name)}</AlsoEnglish> : null}
            <div class='actions'>
              <a class='btn primary' href='/app'>
                {text.signInToManage}
                <ArrowRightIcon />
              </a>
              <a class='btn' href='#how-it-works'>
                {text.howItWorks}
              </a>
            </div>
          </div>
          <Demo host={host} site={site} />
        </div>

        <section class='block' id='how-it-works'>
          <div class='wrap'>
            <h2>{text.howItWorks}</h2>
            <p class='muted'>{text.howItWorksLead}</p>
            <ol class='steps'>
              {text.steps.map((step, index) => (
                <li class='card' key={step.title}>
                  <span class='num'>{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section class='block'>
          <div class='wrap'>
            <h2>{named(text.forUnits, site.name)}</h2>
            <p class='muted'>{text.forUnitsLead}</p>
            <ul class='features'>
              {text.features.map((feature, index) => (
                <li class='card' key={feature.title}>
                  <span class='dot'>{FEATURE_ICONS[index]}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </li>
              ))}
            </ul>
            <p class='muted' style='margin-top:1.25rem'>
              {text.developers} <a href='/app/api-docs'>{text.apiDocs}</a>.
            </p>
          </div>
        </section>

        <section class='block'>
          <div class='wrap'>
            <div class='card visitor'>
              <div>
                <h3>{text.openedOne}</h3>
                <p class='muted'>
                  <WithAddress address={example} name={site.name} text={text.openedOneBody} />
                </p>
              </div>
              {english ? (
                <div lang='en'>
                  <h3>{english.landing.openedOne}</h3>
                  <p class='muted'>
                    <WithAddress address={example} name={site.name} text={english.landing.openedOneBody} />
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
      <Footer site={site} />
    </VisitorPage>
  );
};

export { Landing };
