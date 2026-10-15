FROZEN BLOODED MINI APP — DEPLOYMENT AND LIVE VERIFICATION

CURRENT IMPLEMENTATION

The current Mini App is served from https://app8868570312.tgcloud.ai/ and its static source is web/. The backend endpoint is tgcloud/endpoints/miniapp.js. tgcloud.jsonc maps the static site to web/ and enables SPA serving.

The frontend uses Telegram.WebApp.Serverless.call('miniapp', input, callback). The Serverless platform routes this to POST /api/miniapp on the same host, supplies verified ctx.initData to the endpoint, and serializes the returned object as the callback result. The endpoint authorizes exclusively with ctx.initData.user; it does not accept a browser-supplied user ID.

The endpoint reads profile and inventory data through the existing bot database and profile helpers. It also reuses the bot's existing daily-claim, purchase, tracker, todo, and study-goal records. The Mini App provides those actions, live account pages, and fixed bot deep links for todo and study flows. It does not use clipboard-based command execution. There are no schema changes or migration steps for this feature.

SAFE DEPLOYMENT WORKFLOW

Run these steps from the project directory that is linked to the correct Telegram bot and has the TGCloud CLI's local snapshot. GitHub clones do not contain the ignored .tgcloud/ link and revision state.

1. Install the declared CLI dependency with npm ci.
2. Run npx tgcloud status. If the project is not linked or has no snapshot, stop; status cannot tell you what is live, and pushing from an unlinked clone is not a safe deployment plan.
3. Run npx tgcloud fetch and review the cloud-side changes and revision before reconciling local files. If the cloud has moved ahead, bring that state into the working copy with npx tgcloud pull, then review and resolve the resulting changes. Do not use --force to bypass a revision mismatch.
4. Confirm the reviewed local tree contains the intended tgcloud/endpoints/ code and web/index.html, and that the linked app is the one whose URL is app8868570312.tgcloud.ai.
5. Only after the remote revision and local diff are understood, run npx tgcloud push from that linked project. A full push deploys the endpoint modules and the configured web/ static files together. This project uses plain HTML, so there is no frontend build command. A push does not apply database migrations; none are required for the current Mini App changes.

LIVE VERIFICATION

A matching HTML hash proves only that the static file is current; it does not prove the endpoint modules are current. Verify the Mini App from inside Telegram, opened through the correct bot/app link, so Telegram supplies valid init data. Confirm that bootstrap displays the signed-in account's profile, coins, chakra, rank, inventory, and study records. Then test the requested claim, purchase, tracker, todo, and study-report flows with an account where those actions are appropriate, and confirm the resulting data is reflected by the bot.

A direct unauthenticated POST to /api/miniapp is expected to return HTTP 401 because the platform rejects calls without valid Telegram init data. That response confirms neither a successful profile load nor a missing endpoint. Do not treat a browser-only request, an unauthenticated curl request, a matching HTML hash, or a merged GitHub PR as end-to-end verification.

The official API contract and CLI revision workflow are documented at https://core.telegram.org/bots/serverless#endpoints and https://core.telegram.org/bots/serverless#staying-in-sync.
