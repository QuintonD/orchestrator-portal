# Assistant platform foundation validation

Date: 9 September 2026

Branch: `feat/assistant-platform-integrations`, based on `fac0cb3`.
This is branch QA, not a release or proof of universal provider compatibility.
The existing front-page design checkout was left unchanged.

## Scope checked

- New subscription/local Chat Completions adapter, registered in connection and
  prepared-team catalogs, using an explicitly configured model.
- Authenticated connection creation, encrypted settings, model check, messaging,
  separate connection histories, deletion and recoverable failures.
- Subscription/local policy matching for assistant reports, with metered and
  unconfirmed configurations rejected before dispatch.
- Existing desktop and mobile workflows after the connection-form addition and
  a fix for long connection names in the conversation header.

## Executed checks

| Command or inspection | Result |
| --- | --- |
| `npm ci` | Passed; audit reported zero known vulnerabilities for the installed lockfile |
| `npx vitest run src/compatible-api.test.ts src/adapters.test.ts src/connections.test.ts` from `apps/server` | 57 passed |
| `npx vitest run src/alpha.test.ts` from `apps/server` | 14 passed, including policy mismatch and a matching subscription report |
| `npm run check` | Type checks passed; 143 server, 2 web and 2 contract tests passed |
| `npm run build` | Contracts, adapter SDK, web and server production builds passed |
| `npm run release:check` | Passed; alpha 3 identity agrees across package, lockfile, gateway and Android |
| `npm run desktop:test` | 4 passed; data paths, ports and production staging checks |
| `npx playwright test tests/e2e/compatible-api.spec.ts` | 2 passed; desktop and Pixel 7 browser profiles |
| `npm run test:e2e` | 77 passed; 3 existing platform-specific skips, no failures |
| Screenshot review | Inspected desktop/mobile setup and mobile conversation captures; re-inspected the mobile header after its fix |
| `git diff --check` | Passed using the repository's normal CRLF handling |

The three browser skips are intentional: mobile navigation is skipped in the
desktop project; desktop overflow and desktop appearance checks are skipped in
the mobile project. The new connection journey runs in both projects.

Browser evidence is generated under
`test-results/web/compatible-api-subscriptio-bf89c-ries-a-claimed-conversation-{desktop,mobile}/`:
`subscription-setup.png` and `subscription-conversation.png`. These local captures
use synthetic accounts, keys and content. Baseline documentation screenshots
rewritten by existing tests were restored rather than included in this change.

## Adversarial review and addressed findings

This was the implementing agent's review, supported by reproducible fixtures;
it is not an independent external audit.

| Challenge | Evidence or resolution |
| --- | --- |
| Connection name can be longer than the mobile viewport | Screenshot review found clipped controls despite a passing document-width check. Constrained the selector, allowed header wrapping, and asserted the control's actual bounds. Re-ran browser regression and inspected the result. |
| A connection can be mislabelled by its assistant profile | Added a dispatch guard and fixture proving that a local profile cannot dispatch through a subscription-labelled connection. A matching profile produces a claimed report. |
| History could be sent without being disclosed | Updated conversation help to disclose attached text and relevant history. The compatible route states its 20-message bound. API fixtures verify separate connections never share history. |
| A healthy model catalog could be mistaken for tested generation | Setup copy and guide distinguish a model check from a first turn. Browser fixtures assert that setup sends zero generation requests. No live provider is marked tested. |
| Error bodies or transport exceptions could contain credentials | Errors use fixed messages; fixtures challenge provider bodies, invalid JSON, transport exceptions and persisted audit responses. Configuration stays encrypted. |
| A tool call or partial response could become verified work | Tool/empty/malformed responses stay unknown. Partial text is retained as unknown, including after browser reload. HTML-like output remains inert text. No tools execute. |
| Quota failure could cause spending or duplicate dispatch | HTTP 429, failures and a stalled request produce one request only. No fallback model/provider is accepted or selected. Upstream proxy billing remains an explicit trust boundary. |
| A remote URL could redirect the client's secret | Embedded credentials, query/fragment URLs and remote plaintext HTTP are rejected. Requests disable redirects. Subscription and remote connections require a client token. |
| A source could exhaust resources | Requests have a 256 KiB limit, responses a 1 MiB limit, bounded model catalogs, output-token limits and cancellation/deadline handling. Fixtures exercise oversized data and stalled requests. |

## Unverified and deferred

- Live CLIProxyAPI and individual provider accounts were not used. The evidence
  covers the HTTP contract using mocks and a local synthetic server. Exact proxy
  releases, model aliases, subscription eligibility, upstream authentication,
  quota and billing settings remain unverified.
- Native Codex, Claude, Gemini, Antigravity, Grok Build, Cursor, Copilot and
  OpenCode sessions, tools, approvals and cancellation are planned work, not
  features delivered by this adapter.
- Streaming, native usage reporting, enforceable shared metered budgets and
  durable dispatch reconciliation are not implemented here.
- No desktop archive, Android APK, emulator run or in-place release upgrade was
  performed at this initial integration checkpoint. Subsequent native packaging,
  Android and upgrade results are recorded in [alpha 4 validation](alpha-4-validation.md).
  Pixel 7 browser QA alone is not native Android QA; publication requires matching
  final-commit artifacts and in-place upgrade evidence.
- No T3 side-by-side performance benchmark, screen-reader audit, independent
  penetration test or multi-user product trial was performed. Passing local
  checks does not establish parity with T3 Code or general product effectiveness.

See [coverage and delivery order](assistant-platforms.md) for the remaining work.

## Scope clarification follow-up

The owner's follow-up gives coding agents and general assistants equal first-wave
priority and explicitly includes Muse Assistant. Updated the product direction,
coverage inventory and delivery milestone accordingly. Muse is provisionally
identified as Meta's service at muse.ai, based on its product announcement; an
external integration API remains unverified. Reviewed the primary product pages
and checked the documentation diff. This follow-up changes documentation only,
so functional and platform tests from the implementation were not repeated.
