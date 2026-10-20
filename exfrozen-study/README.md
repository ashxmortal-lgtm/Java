# ExFrozen — Study Bot 📚

Independent Telegram **study** bot split out of Frozen Blooded.

| | |
|---|---|
| Bot | [@exfrozen_bot](https://t.me/exfrozen_bot) |
| TGCloud app | `app8868570312` |
| Mini App | https://app8868570312.tgcloud.ai/ |
| CI secret | `TGCLOUD_TOKEN_EXFROZEN` (issued for **this app only**) |

Study features only: `/study` `/tracker` `/studytime` `/todo` `/duel` `/report`
`/reminder` `/hnc` `/qu` `/topic` `/addadmingrp`, study-coin `/balance` +
`/leaderboard` (`/lb`), admin registration via `/imfrozen`, `/announce`,
plus common commands (`/start` `/help` `/owner` `/stats` `/groups` `/backup`
`/backup_all` `/ow_announce` `/support_pause` `/support_stop`).
No gaming features, no `/eco`, no `/claim`.

## Setup (fresh database — no data is migrated)

```bash
npm ci
npm run validate          # syntax + imports + snapshot + tests
npx tgcloud login         # link THIS folder to app8868570312 / @exfrozen_bot
npx tgcloud status        # confirm the target app before doing anything else
npx tgcloud migrate       # create this bot's own tables (fresh DB of app8868570312)
npx tgcloud push          # deploy code + Mini App (web/)
```

⚠️ `migrate` and `push` act on the **live app your token points at**. Verify
the app id in `tgcloud/lib/config.js` (`app8868570312`) and in the TGCloud
dashboard first. Never use the MissFrozen token here.

## Manual checks before first deploy

1. **BotFather** — bot username is `@exfrozen_bot`; Mini App / menu-button URL
   (if set) is `https://app8868570312.tgcloud.ai/`.
2. **GitHub secret** — `TGCLOUD_TOKEN_EXFROZEN` contains a token issued for
   `app8868570312` only. The workflow refuses tokens embedding a different app id.
3. **Support inbox** — `tgcloud/lib/topic_config.js` still points at the shared
   support supergroup/topic used by Frozen Blooded. Change it if ExFrozen needs
   its own support group, and add the bot there as admin.
4. **Storage channel** — study todos/reminders copy media to the storage chat
   configured in `tgcloud/lib/study/todo.js` / `topic_config.js`; make sure
   @exfrozen_bot is a member/admin there or update the IDs.

## Economy

Coins come only from study: completed study goals, todos (±500) and finished
tracker chapters (+5000) — same amounts and mechanics as before the split.
Balances live in this app's own `users` table; MissFrozen is never touched.

## Layout

`tgcloud/` = deployed code (schema, lib, handlers, endpoints) · `web/` = Mini
App · `test/`, `scripts/validate.js` = local validation. See `AGENTS.md`.
