/**
 * /hnc — multi-level rich menu
 * - Home / study hub: callback buttons
 * - Book categories: category name = URL button
 * - Short notes + Groups: embedded links in text (no Open buttons)
 */

const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
const head = (text, size = 2) => ({ type: 'heading', text, size });
const divider = { type: 'divider' };
const cb = (text, data, style) => (style ? { text, callback_data: data, style } : { text, callback_data: data });
const urlBtn = (text, url, style) => (style ? { text, url, style } : { text, url });
const link = (text, url) => ({ type: 'url', text, url });

const back = (to = 'hnc:home') => row(cb('◂ Back', to));

export const menus = {
  home: [
    head('HNC'),
    para('Pick what you are looking for:'),
    row(cb('STUDY MATERIAL', 'hnc:study', 'primary')),
    row(cb('GRP/CHNL LINKS OF HNC', 'hnc:links', 'primary')),
  ],

  study: [
    head('Study Material'),
    para(
      'Join this channel first: ',
      link('t.me/+o_5e9GYDQDYwMzRl', 'https://t.me/+o_5e9GYDQDYwMzRl'),
    ),
    para('After joining, you can open the resources below.'),
    divider,
    row(
      cb('Book PDF', 'hnc:books', 'primary'),
      cb('Short notes', 'hnc:notes', 'primary'),
    ),
    back('hnc:home'),
  ],

  // Category name itself is the button
  books: [
    head('Book Categories'),
    row(urlBtn('✦ PYQ ✦', 'https://t.me/c/4471291233/243', 'primary')),
    row(urlBtn('✦ MODULE ✦', 'https://t.me/c/4471291233/152', 'primary')),
    row(urlBtn('✦ OTHER BOOKS ✦', 'https://t.me/c/4471291233/368', 'primary')),
    divider,
    back('hnc:study'),
  ],

  // Embedded links only — no Open buttons
  notes: [
    head('Short Notes'),
    para(
      '11th Bio short notes — ',
      link('open', 'https://t.me/c/2994306672/735'),
    ),
    para(
      '12th Bio short notes — ',
      link('open', 'https://t.me/c/2994306672/752'),
    ),
    para(
      'Chemistry short notes [11+12th] — ',
      link('open', 'https://t.me/c/2994306672/778'),
    ),
    para(
      '11th Physics short notes — ',
      link('open', 'https://t.me/c/2994306672/823'),
    ),
    para(
      '12th Physics short notes — ',
      link('open', 'https://t.me/c/2994306672/824'),
    ),
    divider,
    back('hnc:study'),
  ],

  // Embedded links only — no buttons for destinations
  links: [
    head('All Groups & Channels'),
    para(
      'Study material — ',
      link('https://t.me/+Dkf7sqGgUWY0MTU1', 'https://t.me/+Dkf7sqGgUWY0MTU1'),
    ),
    para(
      'Discussion — ',
      link('https://t.me/+ChxNR6ShlzRjMjA1', 'https://t.me/+ChxNR6ShlzRjMjA1'),
    ),
    para(
      'NEET library — ',
      link('https://t.me/+lxR4mMxK-1s4MGJl', 'https://t.me/+lxR4mMxK-1s4MGJl'),
    ),
    para(
      'To-do — ',
      link('https://t.me/+hRDedaMqU2liNmM1', 'https://t.me/+hRDedaMqU2liNmM1'),
    ),
    para(
      'YPT app group — ',
      link('open', 'https://link.yeolpumta.com/P3R5cGU9Z3JvdXBJbnZpdGUmaWQ9NjE3OTA4Mw=='),
    ),
    para(
      'Regain app group — ',
      link('open', 'https://join.regainapp.ai/lf1u31z4'),
    ),
    para(
      'Yapping group — ',
      link('https://t.me/+mlp94tMHi29jMmFl', 'https://t.me/+mlp94tMHi29jMmFl'),
    ),
    para(
      'NEET Quiz — ',
      link('https://t.me/The_Migrator_Quizzes', 'https://t.me/The_Migrator_Quizzes'),
    ),
    para(
      'NEET MCQs — ',
      link('https://t.me/konoha_quizzes', 'https://t.me/konoha_quizzes'),
    ),
    para(
      'Aww sheesh — ',
      link('https://t.me/aww_sheesh', 'https://t.me/aww_sheesh'),
    ),
    divider,
    back('hnc:home'),
  ],
};
