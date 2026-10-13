---
name: Telegram Serverless workflow
description: Standing project constraints for changes to the existing tgcloud Telegram bot.
---

Use Replit as a coding assistant only; do not host or migrate this bot to Replit. Preserve the existing Telegram Serverless (tgcloud) architecture, module system, database integration, and GitHub Actions deployment workflow. For each feature, inspect the current code, make only requested changes, work on a separate feature branch rather than `main`, run appropriate syntax checks and tests, and show changed files and the diff before merge or deployment. Never run database migrations, merge, or deploy without explicit permission. Never expose or hardcode secrets.

**Why:** the user explicitly set these constraints to protect the bot’s existing architecture, deployment process, and data.

**How to apply:** follow these rules for every change in this Telegram bot repository; describe the steps simply and do not assume the user can manually write substantial code.
