# Sentry runbook

Operational guide for the Sentry error-tracking integration shipped in PR #144 (2026-05-21). This is a short, opinionated runbook — not a Sentry tutorial. If you need the SDK API surface, read the [Sentry Node docs](https://docs.sentry.io/platforms/javascript/guides/node/).

## What we capture

| Source | Tagged as | Notes |
|---|---|---|
| Unhandled exceptions caught by `HttpExceptionFilter` | `kind: unhandled` | Anything that wasn't a Nest `HttpException` — bugs, library errors, third-party failures. |
| 5xx `HttpException`s explicitly thrown by app code | `status: 5xx` | Includes `ServiceUnavailableException` from health probes, `BadGatewayException` from upstream failures. |
| 4xx `HttpException`s | **not captured** | Client-driven noise (validation, 404, 401, etc.) — would flood Sentry with no signal. |

Every event carries: `method`, `url` (extra), and `user.id` (the JWT `sub` if the request was authenticated, `anonymous` otherwise).

## Configuration

Two env vars, both consumed by `apps/api/src/instrument.ts`:

| Var | Where it lives | When to set |
|---|---|---|
| `SENTRY_DSN` | `.env.production` on the VPS | Once the Sentry project is provisioned. Empty value = SDK is a no-op (init is skipped). |
| `SENTRY_RELEASE` | Injected by the deploy workflow as `${{ github.sha }}` | Automatic — every prod deploy auto-tags. Empty in dev. |

`SENTRY_DSN` is the only manual step. Everything else is wired.

## First-time setup (DSN provisioning)

1. **Create the Sentry project.** sentry.io → Create Project → Platform: Node.js → name: `teka-rdc-api` → Team: your default. Copy the DSN (format: `https://<key>@<org>.ingest.sentry.io/<project-id>`).
2. **SSH into the VPS** and append the DSN to `.env.production`:
   ```sh
   ssh <vps>
   cd /home/deploy/teka-rdc
   # Edit .env.production — find the SENTRY_DSN= line (added by the
   # 2026-05-21 commit) and paste the DSN as its value. Save.
   ```
3. **Restart the api container** so `instrument.ts` re-runs with the DSN in scope:
   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml restart api
   ```
   This is a hard restart, not a rolling swap — there's a ~2s gap where the api 502s. Schedule for low-traffic.
4. **Verify** via the test endpoint (admin auth required):
   ```sh
   # Login first (whatever method — browser cookie or curl + saved cookies)
   curl -sS -b cookies.txt https://api.teka.cd/api/v1/health/sentry-test
   # Expected: HTTP 500 with a French error envelope. Sentry should receive
   # the event within ~30s — open the Issues tab, look for the
   # "Intentional Sentry verification error" message.
   ```

If the event appears in Sentry: pipeline is live. If not, common culprits in order of likelihood:

- DSN typo / wrong project → check `docker compose logs api | grep -i sentry` for SDK init warnings.
- `SENTRY_DSN` not in the container's env → `docker compose exec api printenv SENTRY_DSN`.
- DNS / firewall blocking `*.ingest.sentry.io` from the VPS → `docker compose exec api wget -q -O- https://sentry.io 2>&1 | head`.

## Day-2 ops

### When an alert fires

1. Click through to the event in Sentry.
2. Read the stack trace + the breadcrumbs leading up to it.
3. Check `user.id` — anonymous? authenticated? Correlate with `extra.url`.
4. Check the Release tag — is this a regression in the latest deploy, or a pre-existing issue surfacing only now?
5. If regression: `git revert` the merge commit (see [CONTRIBUTING.md](/CONTRIBUTING.md) on how to ship a revert), or push a hotfix branch through the standard `develop → main` flow.
6. If pre-existing: open a GitHub issue, link the Sentry event, triage normally.

### Tuning alert noise

- Sentry's default alert rule fires on every new issue. Tune via Project → Alerts.
- 5xx `HttpException`s from `health/ready` (database flap during cloud DB maintenance) will fire — consider an ignore rule on `transaction:GET /v1/health/ready`.
- Bot traffic occasionally throws unhandled errors via the validation pipe. If volume becomes a problem, an `ignoreErrors` array in `instrument.ts` can suppress them.

### Quota

- Free tier is 5K events / month. The DRC traffic volume is low enough that this is probably enough during launch.
- If you hit the cap, Sentry just drops events — no alert. Check the quota usage page weekly during the first month.

## What's intentionally not done

- **No source-map upload.** The SDK reports stack traces in compiled JS. If readability becomes an issue, add `@sentry/cli` source-map upload to the Docker build step.
- **No performance tracing.** `tracesSampleRate: 0`. Errors-only is enough today; revisit if we need to investigate slow endpoints.
- **No frontend Sentry.** The 3 Next.js apps and the 2 Flutter apps are unwired. Adding them is a separate initiative — start with `@sentry/nextjs` for buyer-web (biggest surface area) if that becomes a priority.
- **No PII scrubbing config.** The default SDK scrubbers handle obvious cases (auth tokens, common credit card patterns). We do not currently send request bodies or full headers — only `{ method, url, user.id }` — so PII leakage is bounded.

## Code references

- `apps/api/src/instrument.ts` — SDK init (gated by `SENTRY_DSN`).
- `apps/api/src/main.ts` (first line) — imports `./instrument` before anything else, required by SDK v8+ for auto-instrumentation.
- `apps/api/src/common/filters/http-exception.filter.ts` — the actual `captureException` call sites.
- `apps/api/src/health/health.controller.ts` (`sentry-test` endpoint) — verification trigger.
- `docker-compose.prod.yml` (api service `environment:`) — injects `SENTRY_RELEASE` from the deploy SHA.
- `.github/workflows/deploy.yml` (SSH script) — exports `SENTRY_RELEASE="${{ github.sha }}"` before invoking compose.
