# Deploying ONyc Terminal

ONyc Terminal is independent and read-only. It has three long-running services, five static web apps and one local tool:

| Piece          | What it is                                          | Where it runs                     |
| -------------- | --------------------------------------------------- | --------------------------------- |
| Postgres       | the only store                                      | Neon (or any Postgres 16)         |
| `apps/worker`  | polls the upstream sources, writes data and events  | one container                     |
| `apps/api`     | the `/v1` JSON API, SSE stream and OpenAPI document | one container                     |
| `apps/bot`     | Telegram and webhook alert delivery                 | one container                     |
| `apps/web-*`   | five separate Vite single-page apps                 | five Vercel projects              |
| `packages/mcp` | read-only MCP server over stdio                     | on the machine of whoever uses it |

Nothing here sends transactions or holds keys. The only secrets are the database URL, the optional Telegram token, the optional
Helius key and the optional webhook signing secret.

## Current deployment (22 October 2026)

| Piece       | Where                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Postgres 16 | Neon project `onyc-terminal` (aws-us-east-2)                                                      |
| API         | Render web service `onyc-api` (free plan): https://onyc-api.onrender.com                          |
| Worker      | Render background worker `onyc-worker` (starter plan)                                             |
| Web apps    | Vercel: `onyc-calm`, `onyc-platinum`, `onyc-cobalt`, `onyc-matrix`, `onyc-pastel` (`.vercel.app`) |
| Bot, MCP    | not deployed                                                                                      |

`render.yaml` describes the two Render services; `DATABASE_URL` is set in the Render dashboard, not in the repository. The Render build
runs the repository `Dockerfile` and has been verified there (the images were never built locally: no Docker on the development
machine). The web apps were built locally with `VITE_API_URL=https://onyc-api.onrender.com` and deployed as prebuilt static output, so a
new API URL needs a rebuild and redeploy. The free API plan sleeps when idle; the first request after a pause can take about a minute.

## 1. Postgres on Neon

1. Create a Neon project, Postgres 16, in the region closest to the containers. Use a UTF-8 database (Neon's default).
2. Copy the **pooled** connection string and keep `?sslmode=require`. Put it in `DATABASE_URL` for all three services.
3. Apply the migrations once, from any machine with the repo checked out and the variable set:

   ```bash
   DATABASE_URL="postgres://…neon.tech/neondb?sslmode=require" pnpm db:migrate
   ```

   Or from a built container: `docker run --rm -e DATABASE_URL=… onyc-api node node_modules/@onyc/db/dist/migrate-cli.js`.
   The migration is safe to run again on every release.

Sizing: the daily leaderboard crawl stores about 25,000 rows a day, roughly 1 GB a year. Neon's free tier is enough to start; plan for
the paid tier within a year, or lower `LEADERBOARD_BREAKDOWN_TOP`.

**Local development** uses `pnpm db:local` (an embedded Postgres 16, no Docker) or `docker compose up -d postgres`. A Postgres cluster
created on Windows without options uses WIN1252 and cannot store the minus sign in event titles; `pnpm db:local` now creates UTF-8, and
`pnpm db:utf8` recreates an old local database as UTF-8 (it drops it: development data only).

## 2. The three services

One image recipe builds all three. It compiles only what the service needs and copies a self-contained folder (`pnpm deploy`) into a
small runtime image that runs as a non-root user:

```bash
docker build --build-arg APP=api    -t onyc-api    .
docker build --build-arg APP=worker -t onyc-worker .
docker build --build-arg APP=bot    -t onyc-bot    .
```

> The `Dockerfile` was written but **not built** in the environment that produced this repository (no Docker there). What was run: the same
> `pnpm --filter @onyc/api deploy --prod <dir>` step, then `node dist/main.js` from that folder, which answered `/healthz` against a real
> database. Build the images once and read the first logs before relying on them.

Run each as its own service on Fly.io, Railway or any container host. Run **one** worker (it is the only writer of source data; two
would double the load on the upstreams) and one bot. The API is stateless and can scale out; its cache and rate limiter are per process.

### Environment

| Variable                                                                          | Used by          | Default                 | Notes                                                                                                    |
| --------------------------------------------------------------------------------- | ---------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                    | api, worker, bot | none, required          | Neon pooled string                                                                                       |
| `PORT`                                                                            | api              | `4000`                  | the platform usually sets it                                                                             |
| `CORS_ORIGINS`                                                                    | api              | `*`                     | comma-separated origins of your five web apps; `*` is acceptable because the API is public and read-only |
| `RATE_LIMIT_PER_MINUTE`                                                           | api              | `120`                   | per client address                                                                                       |
| `API_PUBLIC_URL`                                                                  | api, bot         | `http://localhost:4000` | the public URL of the API; the bot reads wallets and the redemption log from it                          |
| `HELIUS_API_KEY`                                                                  | api, worker      | unset                   | optional; without it on-chain balances show "not configured"                                             |
| `LIQUIDITY_TARGET`, `SOLVENCY_STALE_HOURS`, `WALLET_CACHE_SECONDS`                | api              | `0.15`, `24`, `60`      | settings, not data                                                                                       |
| `DISCOUNT_ALERT_BPS`, `SOLVENCY_STALE_HOURS`, `OPPORTUNITY_APY_EVENT_MIN_DELTA`   | worker           | `50`, `24`, `0.005`     | thresholds for the events the worker writes                                                              |
| `WORKER_JOBS`                                                                     | worker           | all                     | comma-separated job names, to run a subset                                                               |
| `LEADERBOARD_PAGE_SIZE`, `LEADERBOARD_BREAKDOWN_TOP`, `LEADERBOARD_PAGE_DELAY_MS` | worker           | `250`, `1000`, `500`    | the crawl is one request at a time                                                                       |
| `TELEGRAM_BOT_TOKEN`                                                              | bot              | unset                   | optional; without it Telegram rules are recorded but not sent, webhooks still deliver                    |
| `WEB_PUBLIC_URL`                                                                  | bot              | unset                   | a link printed under each alert                                                                          |
| `WEBHOOK_SECRET`                                                                  | bot              | unset                   | signs webhook bodies (`X-Onyc-Signature: sha256=…`)                                                      |
| `DELIVERY_INTERVAL_MS`, `DERIVE_INTERVAL_MS`                                      | bot              | `15000`, `60000`        |                                                                                                          |
| `LOG_LEVEL`                                                                       | all              | `info`                  |                                                                                                          |

### Health

- API: `GET /healthz` answers `{ "ok": true }` when the database answers. Point the platform's health check at it.
- Worker: no port. Its health is `GET /v1/health/sources` on the API (every source, last success and error) and the Data Health page.
- Bot: logs `alert bot starting`, then `alerts delivered` lines. A bot without a token says so once at start.

## 3. The five web apps on Vercel

Create **five projects** from the same repository, one per direction, with the root directory set to the app and "Include source
files outside of the Root Directory" on (the apps use the shared packages). Each app has a `vercel.json` with the install and build
commands, the single-page rewrite and basic security headers, so nothing else needs configuring in the dashboard except one variable:

| Project       | Root directory      |
| ------------- | ------------------- |
| Calm Fintech  | `apps/web-calm`     |
| Cobalt Field  | `apps/web-cobalt`   |
| Dot Matrix    | `apps/web-matrix`   |
| Platinum Rail | `apps/web-platinum` |
| Pastel Blocks | `apps/web-pastel`   |

Set `VITE_API_URL` (build-time) to the public URL of the API, for example `https://api.example.com`, and put the five web origins in the
API's `CORS_ORIGINS` if you do not want `*`. Locally the apps proxy `/v1` to `localhost:4000`, so they run with no variable set.

The apps do not set a Content-Security-Policy: Recharts, Tremor and ECharts write inline styles. A policy that allows `style-src
'unsafe-inline'` and `connect-src` for the API origin is the next hardening step.

## 4. The Telegram bot

1. Talk to `@BotFather`, `/newbot`, copy the token into `TELEGRAM_BOT_TOKEN`. Leave the bot's group privacy at its default: the bot only
   answers private chats, because a rule belongs to a person.
2. Start the bot container. Send it `/help`. The commands are the list in `@onyc/sdk` (`ALERT_RULES`), the same list the Activity page shows.
3. `/webhook <https url> <rule> [arguments]` registers a webhook. URLs must be `https`, on port 443, with no credentials, and the host
   must resolve only to public addresses at delivery time; redirects are not followed. Set `WEBHOOK_SECRET` so receivers can verify the
   signature. The check happens after DNS resolution and before the request, so a hostile DNS record that changes between the two is the
   remaining gap: put the bot behind an egress filter if you offer webhooks to strangers.
4. Rules reference events the worker writes (`discount_breach`, `nav_downtick`, `layer_*`, `opportunity_apy_change`, `solvency_stale`)
   and two the bot derives from the API once a minute (`wallet_rank`, `large_redemption`). A discount rule below `DISCOUNT_ALERT_BPS`
   never fires, because the worker only writes the event past that threshold: lower the worker setting if you want finer rules.

## 5. The MCP server

Build the repository, then give your assistant this configuration (Claude Desktop shown; any MCP client that starts a stdio server works):

```json
{
  "mcpServers": {
    "onyc-terminal": {
      "command": "node",
      "args": ["/path/to/repo/packages/mcp/dist/main.js"],
      "env": { "API_PUBLIC_URL": "https://api.example.com" }
    }
  }
}
```

It offers 21 read-only tools (`get_overview`, `get_nav`, `get_wallet`, …), one per API endpoint, and nothing that writes.

## 6. Verify a deployment

```bash
curl -s  https://api.example.com/healthz                       # {"ok":true}
curl -s  https://api.example.com/v1/overview | head -c 300     # { "data": …, "meta": … }
curl -s  https://api.example.com/v1/health/sources             # every source "ok" after a few minutes
curl -sI https://api.example.com/v1/openapi.json               # 200
```

Then open each web app: the Overview should fill within seconds, every chart should end with "Source: … updated … ago", and Data Health
should list no source as down. History-based charts (market premium, redemption flow, opportunity APY history) start empty on a new
database and say "collecting since"; that is correct, not a fault.

Bot check: send `/subscribe downtick` to the bot, then `/list`. To fire a test alert end to end without waiting for the market, run the
integration test `pnpm --filter @onyc/bot test`, which writes a simulated peg breach through the worker's real evaluator and watches it
arrive (it needs a local `DATABASE_URL`).

## 7. Operating notes

- **Be polite to upstreams.** The worker identifies itself with a User-Agent, caches, backs off and opens a circuit breaker per source.
  Do not lower the intervals in `apps/worker/src/jobs`, and do not run more than one worker.
- **CI** (`.github/workflows/ci.yml`) runs typecheck, lint, format check, tests and build against a Postgres 16 service. It has not been
  run on GitHub yet.
- **Backups**: Neon keeps point-in-time history; export a dump before any manual migration.
- **Upgrades**: deploy the worker first (it writes the new columns), then the API, then the web apps. The API validates every response
  against the contract in `@onyc/sdk`, so a mismatch fails loudly instead of showing a wrong number.
- **Not configured is a state, not an error.** Without Helius the Wallet Lab says on-chain balances are not configured; without a Telegram
  token the Activity page still documents the rules but nothing is sent.
