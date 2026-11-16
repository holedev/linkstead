import type { Context } from "hono";
import type { LogoFiles, Store } from "./store";

/**
 * Who is asking. Two kinds and never a blend: a person signed in through the UI, or an
 * application holding a Khóa API - which acts for one Đơn vị and nobody in particular.
 */
type Actor =
  | { kind: "account"; accountId: number; email: string; isSystemAdmin: boolean; sessionHash: string }
  | { kind: "key"; apiKeyId: number; unitId: number };

type AppDeps = {
  store: Store;
  /**
   * Runs work the response must not wait for - counting a Lượt mở. On Workers this is
   * `ctx.waitUntil`; elsewhere it can simply let the promise run.
   */
  defer: (work: Promise<unknown>) => void;
  now?: () => Date;
  /**
   * Reads a Đích's page for the preview a chat app shows (`fetch-page.ts`). Replaceable so tests
   * need not reach the internet; unset means the real one.
   */
  fetchPage?: (url: string) => Promise<{ html: string; url: string } | null>;
  /** Where logo files are kept. Unset where no file storage is attached: QR then carry no logo. */
  logos?: LogoFiles;
  /**
   * What lets the very first Quản trị hệ thống be created. Unset means that door stays shut, and
   * it shuts for good once one exists.
   */
  bootstrapToken?: string;
  /**
   * Answers a request under `/app` with the UI's files - the built page for any path that is not
   * a file, since the UI routes in the browser. Unset where no UI has been built.
   */
  serveUi?: (request: Request) => Promise<Response>;
};

type AppEnv = { Variables: { actor: Actor | null } };
type AppContext = Context<AppEnv>;

export type { Actor, AppContext, AppDeps, AppEnv };
