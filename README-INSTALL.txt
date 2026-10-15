FROZEN BLOODED — JAVA SERVERLESS MINI APP

This PR integrates the Mini App frontend and its getProfile endpoint into the existing Java Telegram Serverless project. It does not deploy, merge, set secrets, or change production settings.

FILES
- web/index.html: dark icy-blue Game Mode and Study Mode interface.
- tgcloud/endpoints/getProfile.js: authenticated profile endpoint.
- tgcloud/lib/profile.js: shared profile data used by both /profile and the endpoint.
- tgcloud.jsonc: static hosting configuration for the web/ directory.

PROFILE SECURITY AND DATA
The endpoint uses only ctx.initData.user, which Telegram Serverless verifies before the endpoint runs. It ignores any user ID in the browser input and returns only that caller's profile. It reuses the Java bot's existing users and inventory tables and the same profile calculations. Missing user/inventory rows receive the same safe defaults as /profile. Database exceptions are not exposed to the browser. No database schema change or migration is required.

The endpoint call is Telegram.WebApp.Serverless.call('getProfile', input, callback), and the static site and endpoint are hosted by the same Serverless app. References: https://core.telegram.org/bots/serverless#endpoints and https://core.telegram.org/bots/webapps#serverless.

COMMAND SHORTCUTS
The Mini App does not silently send bot commands. For bot-chat commands, it copies the command when the clipboard is available, opens @exfrozen_bot, and tells the user to send it. Group-only commands display the exact command and explain that it must be sent in a group where the bot is present. Study links open through Telegram's supported link handling.

AFTER THE PR IS REVIEWED AND MERGED
1. In Termux, update the repository: cd ~/Java-bot && git switch main && git pull --ff-only origin main.
2. Review npx tgcloud status. When ready to deploy, run npx tgcloud push from the project root. This deploys the bot endpoint and static web/ files together; it does not apply a schema migration.
3. Use the URL printed by tgcloud push as the Mini App URL in BotFather, then open the app from Telegram and live-test the endpoint.

The PR has not been deployed or live-tested. A successful build or merged PR alone does not make the Mini App live.
