# Migration: @exfrozen_bot → @missfrozen_bot

## 1. What changed

Bot identity and Mini App host were updated for the new Telegram bot and tgcloud application.

### Code / config updates

| File | Change |
|------|--------|
| `tgcloud/lib/config.js` | `MINI_APP_URL` → `https://app8888370613.tgcloud.ai/` (and derived tracker/store URLs) |
| `tgcloud/lib/economy_handler.js` | `BOT_USERNAME` → `missfrozen_bot` (command targeting + DM claim message) |
| `tgcloud/lib/rich.js` | Group-add deep link `domain=missfrozen_bot` |
| `tgcloud/lib/support_inbox.js` | `BOT_USERNAME` → `missfrozen_bot` (mention detection / reply-to-bot) |
| `tgcloud/lib/welcome_ui.js` | Fallback username after `api.getMe()` → `missfrozen_bot` (dynamic preferred) |
| `tgcloud/lib/study/hub.js` | `BOT_USERNAME` → `missfrozen_bot` (tracker deep links) |
| `web/js/contract.js` | Mini App contract `BOT_USERNAME` → `missfrozen_bot` |
| `test/bot_ui_regressions.test.js` | Expected Mini App store URL updated |
| `tgcloud/lib/source_snapshot.js` | Regenerated via `npm run generate:snapshot` |

### Confirmed values applied

- New bot username: `missfrozen_bot` / `@missfrozen_bot`
- New tgcloud app ID: `app8888370613`
- New Mini App base URL: `https://app8888370613.tgcloud.ai/`
- Owner ID left unchanged: `8716863150`

## 2. What was deliberately left unchanged

- Full JavaScript / tgcloud Serverless architecture, handlers, schema, economy, shinobi/RPG, games, study features, support inbox, menus, Mini App UI/logic.
- Unrelated channel/group invite links (discussion, library, quizzes, frozenBlooded, etc.).
- No secrets, tokens, or credentials added.
- Database schema unchanged (identity migration does not require schema changes).
- `.github/workflows/deploy.yml` left as-is (still uses `TGCLOUD_TOKEN` secret; no deploy performed).
- No `tgcloud push`, fetch, or live database work was run as part of this package.

## 3. Test / validation results

```
npm run validate
```

- Syntax check: all JS files OK
- Relative imports: OK
- Source snapshot: regenerated and verified (107 files)
- `npm test`: **45 passed, 0 failed**

## 4. Configuration you must verify before deploy

These values are already set in source from your confirmation. Still verify on the live tgcloud / BotFather side:

1. Bot username is exactly `missfrozen_bot` and is linked to the tgcloud app `app8888370613`.
2. Mini App is served at `https://app8888370613.tgcloud.ai/` (static SPA from `web/`).
3. Local / CI `TGCLOUD_TOKEN` targets **app8888370613**, not the old app `app8868570312`.
4. Owner Telegram user ID `8716863150` is still correct for owner tools.

If anything differs, edit `tgcloud/lib/config.js` and the `BOT_USERNAME` constants before deploying.

## 5. Exact Termux installation instructions

```bash
# 1. Place the ZIP on the device, then:
cd ~
# or your preferred project parent
unzip -o missfrozen_bot_migrated.zip -d missfrozen_bot
cd missfrozen_bot

# 2. Install Node deps (Termux: pkg install nodejs if needed)
npm ci

# 3. Optional: confirm identity strings
grep -rn "missfrozen_bot\|app8888370613" tgcloud/lib/config.js web/js/contract.js tgcloud/lib/economy_handler.js

# 4. Validate only (no deploy)
npm run validate
```

Do **not** run `npm run deploy` / `tgcloud push` until the checklist below is complete.

## 6. How to verify the tgcloud target before any deployment

```bash
# Ensure CLI is available
npx tgcloud --help

# Authenticate if needed (token for the NEW app only)
export TGCLOUD_TOKEN="your_token_for_app8888370613"

# Inspect current remote app / status — confirm app id matches app8888370613
npx tgcloud status
```

If `status` shows the old app or a different ID, stop. Do not push.

## 7. Safe deployment checklist (separate from install)

1. [ ] BotFather: bot is `@missfrozen_bot`.
2. [ ] tgcloud dashboard: app ID is `app8888370613`.
3. [ ] Mini App URL opens and loads the SPA.
4. [ ] `TGCLOUD_TOKEN` is scoped to the **new** app only.
5. [ ] `npm run validate` passes locally.
6. [ ] Optional: dry-run / review `npx tgcloud status` and any pending revision.
7. [ ] Only then: `npx tgcloud push` (or GitHub Actions with the correct secret).
8. [ ] After push: open bot, `/start`, Mini App store/tracker, group add link, and a claim/support path.

**Warning:** This ZIP is production-ready for **code identity migration** only. It is **not** deployed. Deploying to the wrong app ID or with the old token can affect the previous bot. Confirm the target app yourself before any push.
