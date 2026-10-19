import { db } from 'sdk';
import { sql } from 'sdk/db';
import { fmt } from './store.js';
import { adjustBalance } from './economy.js';
import { style } from './texts.js';
import { OWNER_ID } from './config.js';
import { api } from './message_api.js';

const now = () => Math.floor(Date.now() / 1000);

export async function handleCreateCoupon(message, text) {
  if (message.from?.id !== OWNER_ID) return false;
  const args = text.trim().split(/\s+/).slice(1);
  if (!args.length) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style('Usage: /create_cc <code> <coins> [chakra] [days_expiry]\nExample: /create_cc GIFT100 1000 50 7'),
      parse_mode: 'HTML',
    });
    return true;
  }
  const code = args[0].toUpperCase();
  const coins = Number(args[1]) || 0;
  const chakra = Number(args[2]) || 0;
  const days = Number(args[3]) || 0;
  const expiresAt = days > 0 ? now() + days * 86400 : 0;
  const rewards = JSON.stringify({ coins, chakra });

  await db.run(sql`
    INSERT INTO coupons (code, rewards, expires_at, active, created_at, created_by)
    VALUES (${code}, ${rewards}, ${expiresAt}, 1, ${now()}, ${message.from.id})
    ON CONFLICT (code) DO UPDATE SET
      rewards = ${rewards}, expires_at = ${expiresAt}, active = 1
  `);

  const expText = expiresAt > 0 ? `Expires in ${days} days` : 'No expiration';
  await api.sendMessage({
    chat_id: message.chat.id,
    text: style(`🎟️ <b>Coupon Created!</b>\n\nCode: <code>${code}</code>\n🍥 Coins: ${fmt(coins)}\n⚡ Chakra: ${fmt(chakra)}\n⏳ ${expText}`),
    parse_mode: 'HTML',
  });
  return true;
}

export async function handleListCoupons(message) {
  if (message.from?.id !== OWNER_ID) return false;
  const rows = await db.all(sql`
    SELECT c.code, c.rewards, c.expires_at, c.active,
           (SELECT COUNT(*) FROM coupon_redemptions WHERE code = c.code) AS redemptions
    FROM coupons c
    ORDER BY c.created_at DESC
    LIMIT 20
  `);

  if (!rows || !rows.length) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style('No coupons created yet. Use /create_cc to create one.'),
      parse_mode: 'HTML',
    });
    return true;
  }

  let text = '🎟️ <b>Coupon Codes</b>\n\n';
  const t = now();
  for (const r of rows) {
    let rew = { coins: 0, chakra: 0 };
    try { rew = JSON.parse(r.rewards); } catch (_) {}
    const status = r.active === 0 ? '❌ Disabled' : (r.expires_at > 0 && r.expires_at < t ? '⏳ Expired' : '✅ Active');
    text += `• <code>${r.code}</code> (${status})\n  🍥 ${fmt(rew.coins || 0)} | ⚡ ${fmt(rew.chakra || 0)} | 👥 ${r.redemptions} used\n\n`;
  }
  await api.sendMessage({
    chat_id: message.chat.id,
    text: style(text),
    parse_mode: 'HTML',
  });
  return true;
}

export async function handleEditCoupon(message, text) {
  if (message.from?.id !== OWNER_ID) return false;
  const args = text.trim().split(/\s+/).slice(1);
  if (args.length < 2) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style('Usage: /edit_cc <code> <enable|disable|delete> [coins]\nExample: /edit_cc GIFT100 disable'),
      parse_mode: 'HTML',
    });
    return true;
  }
  const code = args[0].toUpperCase();
  const action = args[1].toLowerCase();

  if (action === 'delete') {
    await db.run(sql`DELETE FROM coupons WHERE code = ${code}`);
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style(`🗑️ Coupon <code>${code}</code> deleted.`),
      parse_mode: 'HTML',
    });
    return true;
  }

  const active = action === 'enable' || action === 'active' ? 1 : 0;
  if (args[2]) {
    const coins = Number(args[2]) || 0;
    const rewards = JSON.stringify({ coins });
    await db.run(sql`UPDATE coupons SET active = ${active}, rewards = ${rewards} WHERE code = ${code}`);
  } else {
    await db.run(sql`UPDATE coupons SET active = ${active} WHERE code = ${code}`);
  }

  await api.sendMessage({
    chat_id: message.chat.id,
    text: style(`✅ Coupon <code>${code}</code> updated (${active ? 'Active' : 'Disabled'}).`),
    parse_mode: 'HTML',
  });
  return true;
}

export async function handleRedeemCoupon(message, text) {
  const user = message.from;
  const args = text.trim().split(/\s+/).slice(1);
  if (!args.length) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style('Usage: /redeem <code>\nExample: /redeem GIFT100'),
      parse_mode: 'HTML',
    });
    return true;
  }
  const code = args[0].toUpperCase();
  const row = await db.get(sql`SELECT code, rewards, expires_at, active FROM coupons WHERE code = ${code}`);
  if (!row) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style(`❌ Invalid coupon code: <code>${code}</code>`),
      parse_mode: 'HTML',
    });
    return true;
  }
  if (row.active === 0) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style(`❌ This coupon is inactive or disabled.`),
      parse_mode: 'HTML',
    });
    return true;
  }
  const t = now();
  if (row.expires_at > 0 && row.expires_at < t) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style(`❌ This coupon has expired.`),
      parse_mode: 'HTML',
    });
    return true;
  }
  const already = await db.get(sql`
    SELECT id FROM coupon_redemptions WHERE code = ${code} AND telegram_id = ${user.id}
  `);
  if (already) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: style(`❌ You have already redeemed coupon <code>${code}</code>.`),
      parse_mode: 'HTML',
    });
    return true;
  }

  let rew = { coins: 0, chakra: 0 };
  try { rew = JSON.parse(row.rewards); } catch (_) {}
  const coins = Number(rew.coins) || 0;
  const chakra = Number(rew.chakra) || 0;

  if (coins > 0) {
    await adjustBalance(user.id, coins);
  }
  if (chakra > 0) {
    await db.run(sql`
      INSERT INTO inventory (telegram_id, item_type, item_name, qty)
      VALUES (${user.id}, 'chakra', 'Chakra', ${chakra})
      ON CONFLICT (telegram_id, item_name) DO UPDATE SET qty = qty + ${chakra}
    `);
  }

  await db.run(sql`
    INSERT INTO coupon_redemptions (code, telegram_id, redeemed_at)
    VALUES (${code}, ${user.id}, ${t})
  `);

  await api.sendMessage({
    chat_id: message.chat.id,
    text: style(`🎉 <b>Coupon Redeemed!</b>\n\n+${fmt(coins)} 🍥 Coins\n${chakra > 0 ? `+${fmt(chakra)} ⚡ Chakra\n` : ''}Use /balance to check.`),
    parse_mode: 'HTML',
  });
  return true;
}
