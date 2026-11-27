import type { Context } from "hono";
import type { EventCount, VisitEvent } from "../domain/visit-events";
import type { SafetyCheck } from "./safety";
import type { LogoFiles, Store } from "./store";

/**
 * Who is asking. Two kinds and never a blend: a person signed in through the UI, or an
 * application holding an API Key - which acts for one Unit and nobody in particular.
 */
type Actor =
  | { kind: "account"; accountId: number; email: string; isSystemAdmin: boolean; sessionHash: string }
  | { kind: "key"; apiKeyId: number; unitId: number };

/**
 * Where Visits go as events, and how they are read back (ADR-0008) - Workers Analytics Engine on
 * Cloudflare, behind this seam like logo files are. `write` never waits and never fails a redirect.
 */
type VisitEvents = {
  write: (event: VisitEvent) => void;
  /** Visits between two moments by quarter-hour and Link, for one Link, one Unit, or all. */
  counts: (range: { from: Date; to: Date; linkId?: number; unitId?: number }) => Promise<EventCount[]>;
};

type AppDeps = {
  store: Store;
  /**
   * Runs work the response must not wait for - counting a Visit. On Workers this is
   * `ctx.waitUntil`; elsewhere it can simply let the promise run.
   */
  defer: (work: Promise<unknown>) => void;
  now?: () => Date;
  /**
   * Reads a Target's page for the preview a chat app shows (`fetch-page.ts`). Replaceable so tests
   * need not reach the internet; unset means the real one.
   */
  fetchPage?: (url: string) => Promise<{ html: string; url: string } | null>;
  /**
   * Looks a Target up in a list of unsafe sites (`safety.ts`). Unset where none is set up: then
   * nothing is refused for being unsafe.
   */
  checkSafety?: SafetyCheck;
  /** Where logo files are kept. Unset where no file storage is attached: QR then carry no logo. */
  logos?: LogoFiles;
  /**
   * What lets the very first System Administrator be created. Unset means that door stays shut, and
   * it shuts for good once one exists.
   */
  bootstrapToken?: string;
  /**
   * Answers a request under `/app` with the UI's files - the built page for any path that is not
   * a file, since the UI routes in the browser. Unset where no UI has been built.
   */
  serveUi?: (request: Request) => Promise<Response>;
  /**
   * Visits as events, where Analytics Engine is set up. Unset, each Visit is counted in the Store
   * directly, and there is no view by hour.
   */
  visitEvents?: VisitEvents;
};

type AppEnv = { Variables: { actor: Actor | null } };
type AppContext = Context<AppEnv>;

export type { Actor, AppContext, AppDeps, AppEnv, VisitEvents };
