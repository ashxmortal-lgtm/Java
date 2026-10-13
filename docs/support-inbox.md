# Support inbox (`/awwsheesh`)

## What it does

- `/awwsheesh` in a private chat displays **Start convo** and **Stop convo** buttons. Starting creates one forum topic for the user on first use; later starts reuse the stored topic. Conversations have no time-based expiry.
- Active non-command private messages are copied into that user's support topic. The user keeps their original message and gets a fresh confirmation with a **Pause convo** button only after Telegram accepts the copy. Existing bot slash commands continue to work normally.
- An authorized admin can reply in the topic. The bot copies the reply to the user's private chat. Replying to a copied user message is preserved as a Telegram reply when a stored message mapping exists.
- `/support_pause` and `/support_stop` in a user's topic let an authorized admin pause or stop that conversation. The user can resume either state through `/awwsheesh` → **Start convo**.
- Only IDs in `ADMIN_IDS` can send topic messages to users through this feature. Messages in other groups, other users' topics, and unrecognized topics are never used for delivery.
- `#newuser` goes to the configured `users` topic. `#blockbot` goes to the affected user's topic if one exists, otherwise to `users`.

## Configuration

Edit `tgcloud/lib/topic_config.js` before deployment:

1. Set `SUPPORT_GROUP_ID` to the numeric ID of the dedicated supergroup (normally a negative ID such as `-100…`).
2. Set `SUPPORT_USERS_TOPIC_ID` to the numeric `message_thread_id` for the pre-created `users` topic.
3. Add the numeric Telegram user IDs of support admins to `ADMIN_IDS`. The owner is already included.

Create a dedicated **supergroup with Topics enabled** and create a topic named `users` in Telegram. Add the bot as an administrator and grant it **Manage Topics** plus permission to send messages. The first Start convo call checks that `getChat` reports a forum supergroup, then creates the user's topic; if configuration or permissions are missing, it reports a handled error instead of creating a fallback or routing to a different chat.

Telegram's `copyMessage` supports most ordinary message types while excluding certain service, paid-media, giveaway, and invoice messages. Such failures are handled without claiming delivery. The confirmation itself is text, so it remains separate from the copied user message.

## Migration and deployment

This feature adds `support_conversations` and `support_message_links`; it does not drop or recreate existing tables. From the project root, after reviewing the schema diff:

```sh
npx tgcloud status
npx tgcloud migrate   # interactive, applies the schema migration
npx tgcloud push      # deploys the modules
npx tgcloud webhook   # confirm the deployed webhook matches handlers
```

Migration and deployment are intentionally not run by the contributor. Apply them only from the bot owner's configured tgcloud project after reviewing the platform's migration preview and confirming the target bot.

## Test plan

1. With the support group ID set incorrectly or to a non-forum chat, press **Start convo**. The user should receive a handled error, and no DM should claim that support started successfully.
2. Configure the forum and `users` topic. Send `/start` as a new user and confirm `#newuser` is posted in `users`, not in the owner's private chat.
3. Send `/awwsheesh` repeatedly, then press **Start convo**. Confirm only one per-user topic is created. Press Start again and confirm the stored topic is reused.
4. Send text, formatted text, a photo with caption, a document, a video, and a voice message while active. Confirm each appears in the user's topic with its caption/formatting preserved where Telegram supports it. Confirm the original private messages remain.
5. After each successful copy, confirm the previous bot receipt is deleted and exactly one fresh receipt with **Pause convo** remains. Force a Bot API copy error and confirm the bot does not claim the message was forwarded.
6. Reply from an ID in `ADMIN_IDS` within that user's topic. Confirm it arrives in the user's private chat. Reply directly to a copied user message and confirm the bot reply is threaded to the matching original DM when possible.
7. Send a reply from an ordinary group member and from an admin in another topic. Confirm neither can deliver a message to a user.
8. Press **Pause convo**. Send another non-command private message and confirm it is not copied. Resume through `/awwsheesh` → **Start convo** and confirm the same topic/history is reused. Test **Stop convo** and admin `/support_pause` and `/support_stop` similarly.
9. Have a user block the bot and verify `#blockbot` is routed to their support topic when mapped; repeat for a user without a topic and verify the `users` topic fallback. Confirm neither alert goes to the owner's private chat.
10. After schema migration, verify rows persist across separate handler invocations and that unrelated commands and game handlers still work.
