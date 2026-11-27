import { QR_STYLES } from "../domain/qr-style";

/**
 * The API an API Key speaks, as OpenAPI 3.1 - the six things AGENTS.md lists and nothing more.
 * Served at `/api/openapi.json` and read by the Swagger page under `/app/api-docs`. Written for
 * the developer a Unit hands a key to, who may have no account, so it is public; it holds nothing
 * a key does not already reveal. `api-docs.test.ts` checks it against the real routes.
 */

const json = (schema: object) => ({ "application/json": { schema } });

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const refusal = (description: string, errors: string[]) => ({
  content: json({
    properties: { error: { enum: errors, type: "string" }, problem: { type: "string" } },
    required: ["error"],
    type: "object"
  }),
  description
});

/** What every call can be answered with, whatever it asks. */
const ALWAYS = {
  401: refusal("The API Key is missing, wrong or revoked.", ["not-signed-in"]),
  429: {
    content: json(ref("Error")),
    description: "The key has made more than 120 calls this minute. `Retry-After` says how many seconds to wait.",
    headers: { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } }
  }
};

const ON_A_LINK = {
  ...ALWAYS,
  403: refusal("The Link belongs to another Unit than the key's.", ["forbidden"]),
  404: refusal("No Link has this code.", ["unknown-link"])
};

const CODE = {
  description: "The Link Code, matched whatever its case.",
  example: "conference-2027",
  in: "path",
  name: "code",
  required: true,
  schema: { type: "string" }
};

const LINK = { content: json(ref("Link")), description: "The Link after the change." };

/** One country or referring site and how many Visits came from it. */
const SOURCE = {
  properties: { count: { type: "integer" }, value: { example: "VN", type: "string" } },
  type: "object"
};

const openApiDocument = (origin: string, organizationName: string) => ({
  components: {
    schemas: {
      Error: {
        properties: {
          error: { description: "Why, as a code a program can read.", type: "string" },
          problem: { description: "More detail, when there is any.", type: "string" }
        },
        required: ["error"],
        type: "object"
      },
      Link: {
        properties: {
          archived: {
            description: "Put away from the Unit's list. The Link still opens as usual.",
            type: "boolean"
          },
          code: { description: "The Link Code. Never changes.", example: "conference-2027", type: "string" },
          createdAt: { format: "date-time", type: "string" },
          disabledBySystem: {
            description: "Switched off by a System Administrator: only one can switch it back on.",
            type: "boolean"
          },
          enabled: {
            description: "Switched on. A switched-off Link shows a notice instead of sending visitors on.",
            type: "boolean"
          },
          expiresAt: {
            description: "When the Link expires and stops opening; null when it never does. Set in the UI.",
            format: "date-time",
            type: ["string", "null"]
          },
          groupId: { description: "The Unit's Group the Link is sorted into, if any.", type: ["integer", "null"] },
          hasPassword: {
            description: "Visitors must give a password before they are sent on. Set in the UI.",
            type: "boolean"
          },
          logoChoice: { enum: ["inherit", "none", "custom"], type: "string" },
          name: { description: "The Link Name: what it is for. Only the Unit's members see it.", type: "string" },
          note: { type: "string" },
          preview: {
            description:
              "Title, description and image shown when the Link is pasted in a chat. Empty: the Target's own.",
            properties: { description: { type: "string" }, image: { type: "string" }, title: { type: "string" } },
            type: "object"
          },
          qrShape: {
            description: "How the QR's modules are drawn: squares or dots.",
            enum: ["square", "dots"],
            type: "string"
          },
          redirectType: {
            description:
              "The HTTP status the Link answers with when it sends visitors on. 302 and 307 are temporary; 301 and 308 tell search engines and some apps the address has moved for good. Every one is sent with `Cache-Control: no-store`. Changed in the UI.",
            enum: [301, 302, 307, 308],
            type: "integer"
          },
          target: { description: "The Target: where visitors are sent.", format: "uri", type: "string" },
          unitId: { type: "integer" },
          unsafeSince: {
            description:
              "Since when the daily check has found the Target on Google Safe Browsing's list of unsafe sites. Visitors then see a warning instead of being sent on. Null when it has not.",
            format: "date-time",
            type: ["string", "null"]
          },
          url: { description: "The full address, to print or send.", format: "uri", type: "string" },
          visits: { description: "All Visits so far, an estimate.", type: "integer" }
        },
        type: "object"
      }
    },
    securitySchemes: {
      apiKey: {
        bearerFormat: "lsk_...",
        description:
          "An API Key a Unit Manager issues in the UI (API Keys). Send it as `Authorization: Bearer <key>`. A key works on its own Unit's Links only.",
        scheme: "bearer",
        type: "http"
      }
    }
  },
  info: {
    description: [
      `Permanent links and QR codes of ${organizationName}, whose Target can change after they have been printed.`,
      "",
      "An API Key does exactly the six things below, and only on the Links of the Unit that issued it. Accounts, Units and keys are managed in the UI only. Every change made through the API is recorded under the key that made it. Each key may make up to 120 calls a minute."
    ].join("\n"),
    title: `${organizationName} - linkstead API`,
    version: "1"
  },
  openapi: "3.1.0",
  paths: {
    "/api/links": {
      get: {
        description: "Newest first.",
        operationId: "listLinks",
        responses: {
          200: {
            content: json({ properties: { links: { items: ref("Link"), type: "array" } }, type: "object" }),
            description: "The Unit's Links."
          },
          ...ALWAYS
        },
        summary: "List the Unit's Links",
        tags: ["Link"]
      },
      post: {
        description:
          "The Link belongs to the key's Unit. Leave `code` out for a generated 6-character one. A code once used is never given out again, even when its Link is switched off.",
        operationId: "createLink",
        requestBody: {
          content: json({
            properties: {
              code: {
                description: "Lowercase unaccented letters, digits and hyphens; 3 to 50 characters.",
                example: "conference-2027",
                type: "string"
              },
              groupId: {
                description: "The Unit's Group to sort the Link into (Groups are made in the UI). Left out: none.",
                type: ["integer", "null"]
              },
              name: { example: "Conference poster, A3 print", maxLength: 200, type: "string" },
              note: { maxLength: 1000, type: "string" },
              redirectType: {
                default: 302,
                description:
                  "The HTTP status to send visitors on with. Left out: 302. A permanent one (301, 308) tells search engines and some apps the address has moved for good, though the Target can still be changed.",
                enum: [301, 302, 307, 308],
                type: "integer"
              },
              target: { example: "https://example.org/call-for-papers", format: "uri", type: "string" }
            },
            required: ["name", "target"],
            type: "object"
          }),
          required: true
        },
        responses: {
          201: { content: json(ref("Link")), description: "The new Link." },
          409: refusal("Another Link already has this code.", ["code-taken"]),
          422: refusal(
            "The name, note, Target, code, Group or Redirect Type cannot be taken. `problem` says why: for the Target `not-a-url`, `not-https`, `points-at-self`, `too-long` or `unsafe` (listed by Google Safe Browsing); for the code `too-short`, `too-long`, `bad-characters` or `reserved`.",
            ["bad-name", "bad-note", "bad-target", "bad-code", "unknown-group", "bad-redirect"]
          ),
          503: refusal("No code could be generated. Try again.", ["no-code-available"]),
          ...ALWAYS
        },
        summary: "Create a Link",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/disable": {
      post: {
        description: "Visitors see a notice instead of being sent to the Target. The Link Code stays taken.",
        operationId: "disableLink",
        parameters: [CODE],
        responses: { 200: LINK, ...ON_A_LINK },
        summary: "Switch a Link off",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/enable": {
      post: {
        operationId: "enableLink",
        parameters: [CODE],
        responses: {
          200: LINK,
          ...ON_A_LINK,
          403: refusal(
            "The Link belongs to another Unit, or a System Administrator switched it off - then only one can switch it back on.",
            ["forbidden", "disabled-by-system"]
          )
        },
        summary: "Switch a Link back on",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/qr": {
      get: {
        description:
          "A QR always carries the Link's address, never its Target, so it keeps working after the Target changes. SVG only; the logo is the one the Link and its Unit chose.",
        operationId: "linkQr",
        parameters: [
          CODE,
          {
            description:
              "The look. Black on white by default. There are no free colours, so that a QR always has the contrast a phone needs to read it.",
            in: "query",
            name: "style",
            required: false,
            schema: { default: "dark-on-light", enum: Object.keys(QR_STYLES), type: "string" }
          }
        ],
        responses: {
          200: { content: { "image/svg+xml": { schema: { type: "string" } } }, description: "The QR, as SVG." },
          ...ON_A_LINK,
          422: refusal("No such look.", ["bad-style"])
        },
        summary: "Get the QR",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/target": {
      put: {
        description:
          "Visitors are sent to the new Target at once. Send `expectedTarget`, the Target you can see: if someone changed it just before, nothing is overwritten and the answer says what it is now.",
        operationId: "changeTarget",
        parameters: [CODE],
        requestBody: {
          content: json({
            properties: {
              expectedTarget: { format: "uri", type: "string" },
              resetPreview: {
                description:
                  "`true` drops the title, description and image set by hand for the old Target; a pasted Link then shows the new Target's own.",
                type: "boolean"
              },
              target: { example: "https://example.org/programme", format: "uri", type: "string" }
            },
            required: ["target"],
            type: "object"
          }),
          required: true
        },
        responses: {
          200: LINK,
          ...ON_A_LINK,
          409: {
            content: json({
              properties: { error: { enum: ["target-changed"], type: "string" }, target: { type: "string" } },
              type: "object"
            }),
            description: "The Target was changed before this request arrived; `target` is the current one."
          },
          422: refusal(
            "The Target cannot be taken: `problem` is `not-a-url`, `not-https`, `points-at-self`, `too-long`, `unsafe` or `unchanged`.",
            ["bad-target"]
          )
        },
        summary: "Change the Target",
        tags: ["Link"]
      }
    },
    "/api/links/{code}/visits": {
      get: {
        description:
          "By day in the Organization's time zone, oldest first; a day without Visits has no row. An estimate: the openings chat apps such as Zalo and Facebook make to build a preview are left out where they can be recognised.",
        operationId: "linkVisits",
        parameters: [CODE],
        responses: {
          200: {
            content: json({
              properties: {
                browsers: {
                  description:
                    "By browser family (`chrome`, `safari`, `zalo`, `facebook`, ... or `other`), most first. Only the family is kept, never the user agent.",
                  items: SOURCE,
                  type: "array"
                },
                countries: {
                  description: "By country (two letters), most first. An empty `value` is not known.",
                  items: SOURCE,
                  type: "array"
                },
                days: {
                  items: {
                    properties: { count: { type: "integer" }, day: { example: "2027-03-01", type: "string" } },
                    type: "object"
                  },
                  type: "array"
                },
                devices: {
                  description: "By kind of device (`mobile`, `tablet`, `desktop`, `other`), most first.",
                  items: SOURCE,
                  type: "array"
                },
                referrers: {
                  description:
                    "By referring site (host only), most first. An empty `value` is not known: a scanned QR, a typed address and most chat apps send none.",
                  items: SOURCE,
                  type: "array"
                },
                total: { type: "integer" }
              },
              type: "object"
            }),
            description: "Visits by day, country, referring site, device and browser, and in all."
          },
          ...ON_A_LINK
        },
        summary: "Read the Visits",
        tags: ["Link"]
      }
    }
  },
  security: [{ apiKey: [] }],
  servers: [{ description: "This installation", url: origin }],
  tags: [{ description: "The six things an API Key can do, on its own Unit's Links.", name: "Link" }]
});

export { openApiDocument };
