# TEJA — Repair and integration audit

## Changes in this repair copy

- Fixed the session cookie for local HTTP previews: browsers reject `Secure` cookies on plain HTTP. The cookie now uses `Secure` when the request URL is HTTPS (production) and omits it for HTTP local previews. `HttpOnly` and `SameSite=Lax` remain enabled.
- Added `npm run check:project`, a dependency-free static sanity check for key app/config files and the cookie configuration.
- Kept the existing Cloudflare Workers + Vinext + D1 + R2 architecture intact so existing application features are not silently broken.

## Confirmed architectural constraints

- The current app is a Cloudflare Worker/Vinext application. `db/index.ts` imports `cloudflare:workers` and uses Drizzle's D1 adapter. API handlers directly call `env.DB.prepare(...)`; uploads use `env.BUCKET`.
- MongoDB's standard Node.js driver requires a Node-compatible runtime and network access that is not available in the current Cloudflare Workers runtime as used by this project. Merely adding `MONGODB_URI` or installing `mongodb` would not migrate the SQL queries and could break startup.
- Therefore this repair copy does **not** claim MongoDB has been integrated. A real migration requires converting all SQL statements and data model operations to MongoDB collections, moving to a Node.js-capable deployment (or selecting a supported external database gateway), then migrating existing D1 data and testing auth, order/stock atomicity, payments, and file storage.
- Public access is controlled by the hosting platform. `.openai/hosting.json` declares D1/R2 bindings but does not control the site's audience setting. Change the site's audience/access policy in the hosting dashboard; do not try to expose the site by weakening application authentication.

## Important unverified areas

- Dependency installation, production build, and browser end-to-end tests were not run in this environment.
- Real MongoDB connectivity, production D1/R2 bindings, SMS delivery, and Payme/Click merchant callbacks were not tested.
- Do not set payment readiness flags to true until provider sandbox callbacks and settlement/cancellation flows pass.

## How to check locally (Windows PowerShell)

```powershell
npm install
npm run check:project
npm run build
```

If dependencies are already managed by the project's prescribed setup, use that install workflow instead of running concurrent package installers. For local database-backed preview, follow the D1 migration instructions in `README.md` before testing registration and login.
