# Frozen Blooded — Bot Split Report

Date: 2026-10-20 · Branch: `arena/24237e80-java` · Base: `3092a9b` (main)

The combined TGCloud JavaScript bot was split into two fully independent
projects. The framework/architecture is unchanged (TGCloud serverless JS,
`tgcloud/` modules, `web/` Mini App, `schema.js` DSL).

| | ExFrozen (Study) | MissFrozen (Gaming) |
|---|---|---|
| Bot | @exfrozen_bot | @missfrozen_bot |
| TGCloud app | `app8868570312` | `app8888370613` |
| Mini App | https://app8868570312.tgcloud.ai/ | https://app8888370613.tgcloud.ai/ |
| Project | `exfrozen-study/` → `exfrozen-study.zip` (76 files, 249 KB) | `missfrozen-gaming/` → `missfrozen-gaming.zip` (107 files, 376 KB) |
| CI secret | `TGCLOUD_TOKEN_EXFROZEN` | `TGCLOUD_TOKEN_MISSFROZEN` |
| Schema tables | 25 | 36 |

No live deployment, migration, secret change, or database reset was performed.
Nothing was committed or pushed.

## 1. Final command ownership

**ExFrozen only:** `/study` `/tracker` `/studytime` `/todo` `/duel` `/report`
`/reminder` `/hnc` `/qu` `/topic` `/addadmingrp` `/imfrozen` `/announce`
(+ contextual `/done` `/cancel` inside announcement sessions).
**MissFrozen only:** `/games` `/xoxo` `/xoxo_cancel` `/cancel_xoxo`
`/xoxo_stats` `/rps` `/rps_cancel` `/cancel_rps` `/rps_stats` `/map` `/mission`
`/patrol` `/shinobi_store` `/buy` `/inventory` `/equip` `/unequip` `/ability`
`/abilities` `/claim` `/daily` `/profile` `/transfer` `/gift_store` `/gift`
`/hug` `/slap` `/punch` `/pat` `/mt` `/kill` `/rob` `/protect` `/byakugan`
`/search_tsuna` `/redeem` `/addcoins` `/create_cc` `/list_cc` `/edit_cc` `/eco`.
**Both (independent data):** `/start` `/help` `/balance` `/leaderboard` `/lb`
`/owner` `/awwsheesh` `/support_pause` `/support_stop` `/stats` `/groups`
`/approved_list` `/backup` `/backup_all` `/ow_announce`.

Each bot's router registers only its own handlers; the other bot's commands
fall through silently (verified by tests + import scan). `/linkchannel` and
`/diss_grp` were not invented (absent from source).

## 2. Welcome / help

- The Game/Study mode chooser is removed in both bots and both Mini Apps.
  `/start` shows that bot's welcome; `/help` opens that bot's own menu directly.
- ExFrozen welcome shows a study mini-profile (balance, study coins, chapters,
  todos, rank) and keeps the `/imfrozen` **admin welcome** for registered admins.
- MissFrozen welcome keeps the gaming mini-profile; the admin-welcome branch
  was removed (no `/imfrozen` records exist there).
- Frozen Blooded branding + Contact Owner (`si:menu:`) preserved in both.

## 3. Economies

- **ExFrozen:** `lib/economy.js` is study-only (`getBalance`/`adjustBalance`/
  `getStudyCoins`). Existing reward amounts are untouched: study goals/todos
  (±500) and tracker chapter completion (+5000) credit this bot's own `users`
  table with `{ study: true }`. `/balance` + group/global `/leaderboard`
  (with `lb:global` callback) are implemented in `lib/common_handler.js`.
  No `/claim`, no store/purchases.
- **MissFrozen:** full gaming economy unchanged (daily claim, store, RPG,
  games); `study_coins` tracking and the column were removed.

## 4. `/eco` (MissFrozen) and `/imfrozen` (ExFrozen)

- MissFrozen `canManageGroup` = bot owner **or live Telegram group admin**
  (`getChatMember` → creator/administrator). It reads no registration table;
  `group_admins`/`admin_confirmations` don't exist in its schema. Ordinary
  users are denied; anonymous admins still can't be verified (unchanged).
  The existing economy lock (message-level + store-callback-level) is preserved.
- ExFrozen keeps the original `/imfrozen` flow (DM confirmation, `imf:ok:<id>`,
  admin welcome) and does not register `/eco` at all.

## 5. Mini App & callback separation

- **ExFrozen endpoint** (`miniapp`): actions `bootstrap`, `todo_update`,
  `study_report_submit`, `study_goal_complete`, `tracker_toggle`,
  `tracker_adjust`. Bootstrap returns `{profile, balance{coins,studyCoins,rank},
  study{today,tracker,trackerRows,todos,goals}}` — no store/inventory/purchase.
  No `getProfile` endpoint. Web pages: home (study hub), tracker, reports, HNC.
- **MissFrozen endpoint**: actions `bootstrap`, `claim`, `purchase`; bootstrap
  returns gaming profile/balance/inventory/store/abilities/levels/gifts plus
  top-level `today`. `getProfile` retained. Web pages: home (game hub),
  profile, inventory, store, abilities, levels, gifts.
- Both keep platform-verified `ctx.initData.user` auth; client-supplied IDs are
  never trusted; unknown actions throw `UNKNOWN_ACTION`.
- Deep links: ExFrozen `mini_todo|mini_studytime|mini_study|mini_duel|
  mini_tracker|mini_owner|owner`; MissFrozen `mini_map|mini_owner|owner`.
- Callback routers register only their own prefixes (study `tracker_ study_
  todo_ duel_ report_ rem_`, `imf:`, HNC/topic vs games/map/combat/store/
  gift/inventory `lb:` etc.) plus common ones (`si:`, `wel:`/`hp:`, `ann:`,
  owner stats/groups, reactions). Unknown callbacks are acknowledged safely.
- Sweeps: ExFrozen runs reminder/due-task sweeps only; MissFrozen runs clone,
  Tsunade, activity and map sweeps only. `/backup*` dumps only the receiver's DB.

## 6. Database / schema summary

Fresh-start schemas (no data copied, no `.deprecated()` drops anywhere):

- **ExFrozen (25):** `users` (study variant: balance + study_coins),
  `group_members`, `cleanup`, quiz/topic tables (7), `study_goals`,
  `study_duels`, `study_todos`, `biology_tracker`, **`study_reminders` (newly
  declared; runtime CREATE IF NOT EXISTS kept)**, `group_admins`,
  `admin_confirmations`, announce tables (4), `reply_bridge`, `known_groups`,
  `support_conversations`, `support_message_links`, `topic_settings`.
- **MissFrozen (36):** `users` (gaming variant, no study_coins),
  `user_equipped`, `inventory`, `purchases`, `activities`, `group_members`,
  `cleanup`, `topic_settings` (support inbox), `group_settings` (/eco),
  announce tables (4, owner mode), `reply_bridge`, `known_groups`, map tables
  (incl. **newly declared `map_mission_selection`**), game tables (6),
  `shinobi_state`, `user_skills`, `tsunade_search`, `clone_pending`, `rpg_tx`,
  `coupons`, `coupon_redemptions`, support tables (2).

Every schema named-import and every raw-SQL table reference in each tree was
machine-checked against that tree's schema (all resolve; only `sqlite_master`
in backup dumps is external, by design). Isolation comes from each TGCloud
app's own database + token, not from URLs: run `npx tgcloud login/status` in
each folder and confirm the app id before `migrate`/`push`.

## 7. Deployment & configuration

- Each project has `.github/workflows/deploy.yml` targeting only its app,
  using only its secret, with a pre-deploy guard: if the token embeds an
  `app<digits>` id it must match the expected app, and `config.js` must
  contain the expected app id. (If TGCloud tokens are opaque, the guard warns
  and relies on secret scoping — verify the issuing app in the dashboard.)
- Root legacy workflow: push/PR triggers removed; manual `workflow_dispatch`
  now requires typing `DEPLOY-LEGACY-COMBINED`. The old combined app cannot
  deploy accidentally.
- Required env/secrets: only the GitHub Actions secret per bot (above) or a
  local `TGCLOUD_TOKEN` for CLI use. No secrets in source (test-verified).

### Manual steps still required (not done here)

1. `npx tgcloud login` in each extracted folder; confirm app ids.
2. Create the two GitHub secrets with tokens issued for the correct apps.
3. BotFather: verify both usernames and Mini App/menu URLs.
4. `npx tgcloud migrate` then `npx tgcloud push` per bot (fresh DBs). Note:
   MissFrozen's app previously hosted the combined bot — pushing replaces its
   code; `push` never deletes DB rows, but confirm cutover intent first.
5. Support inbox: `tgcloud/lib/topic_config.js` in both bots still points at
   the existing shared support supergroup/topic and storage chat — split these
   IDs (and add each bot as admin) if you want per-bot support/storage.
6. Add @exfrozen_bot to the study storage channel (todos/reminders media).

## 8. Validation — commands and actual results

Run inside each project (and again from clean ZIP extractions in /tmp):

```
npm ci && npm run validate     # = node scripts/validate.js && npm test
```

| Project | Syntax | Imports | Snapshot | Tests |
|---|---|---|---|---|
| exfrozen-study | ✓ 52 files | ✓ | ✓ 60 files | **14 pass / 0 fail** |
| missfrozen-gaming | ✓ 79 files | ✓ | ✓ 89 files | **29 pass / 0 fail** |

Test coverage: retained original economy/RPG/profile/backup/CLI-patch tests
(MissFrozen) and backup/CLI-patch tests (ExFrozen, required-file list adapted),
plus a new `test/split.test.js` in each project asserting identity (app id,
username, Mini App URL), command ownership, no mode chooser, `/eco` live-admin
authorization, `/imfrozen` presence/absence, independent study/gaming
economies, schema table sets with no destructive deprecations, Mini App
action surfaces + initData auth, absence of cross-bot modules/callbacks,
no secrets, and per-app deployment config. Extraction test: both ZIPs were
unzipped to a clean directory, `npm ci && npm run validate` passed there with
identical counts, proving self-containment. ZIPs contain no `node_modules`,
`.env`, `.git`, or tokens (listing-scanned).

Not executed (by design): any live `tgcloud push/migrate/fetch`, Bot API calls,
or production DB work. Handler behaviour against the real Telegram/TGCloud
runtime can only be confirmed after the manual deploy steps above; the local
suite is static/contract-level, matching the original repo's test style.

## 9. Known limitations

- Token app-id "prefix" validation depends on TGCloud token format (see §7).
- Support-group and storage-chat IDs are shared config values until split (§7.5).
- The legacy combined source remains at the repo root for reference/rollback;
  its workflow is manual-only. Root `npm run validate` still validates the
  legacy tree (it does not recurse into the two new project folders' tests).
- Renaming note: ExFrozen display name in welcome/Mini App is "Ex Fr❄️zen";
  adjust in `tgcloud/lib/welcome_ui.js` / `web/` if different branding is wanted.
