/**
 * Central command metadata for dynamic help / welcome lists.
 * access: 'user' | 'admin' | 'owner'
 */
export const COMMANDS = [
  { cmd: '/start', desc: 'Start the bot', access: 'user' },
  { cmd: '/help', desc: 'Command list', access: 'user' },
  { cmd: '/study', desc: 'Study hub', access: 'user' },
  { cmd: '/tracker', desc: 'Biology tracker', access: 'user' },
  { cmd: '/studytime', desc: 'Log study time', access: 'user' },
  { cmd: '/todo', desc: 'Study todos', access: 'user' },
  { cmd: '/duel', desc: 'Study duel', access: 'user' },
  { cmd: '/report', desc: 'Study report', access: 'user' },
  { cmd: '/reminder', desc: 'Set a timed reminder', access: 'user' },
  { cmd: '/hnc', desc: 'HNC menu', access: 'user' },
  { cmd: '/balance', desc: 'Check your study-coin balance & rank', access: 'user' },
  { cmd: '/leaderboard', desc: 'Top study balances (alias /lb)', access: 'user' },
  { cmd: '/lb', desc: 'Top study balances (alias /leaderboard)', access: 'user' },
  { cmd: '/owner', desc: 'Contact the owner (alias /awwsheesh)', access: 'user' },
  { cmd: '/imfrozen', desc: 'Register as bot admin of this group', access: 'admin' },
  { cmd: '/announce', desc: 'Announce to your registered groups (DM)', access: 'admin' },
  { cmd: '/topic', desc: 'Topic admin panel (DM)', access: 'admin' },
  { cmd: '/qu', desc: 'Quiz topic suggestions', access: 'admin' },
  { cmd: '/addadmingrp', desc: 'Add an admin group for quiz topics', access: 'admin' },
  { cmd: '/stats', desc: 'Bot usage statistics', access: 'owner' },
  { cmd: '/groups', desc: 'List groups the bot is in (alias /approved_list)', access: 'owner' },
  { cmd: '/ow_announce', desc: 'Owner broadcast to groups/DMs', access: 'owner' },
  { cmd: '/backup', desc: 'Database backup', access: 'owner' },
  { cmd: '/backup_all', desc: 'Full source + project snapshot backup', access: 'owner' },
];

export function listCommands(accessFilter) {
  if (accessFilter === 'user') return COMMANDS.filter((c) => c.access === 'user');
  if (accessFilter === 'admin') return COMMANDS.filter((c) => c.access === 'user' || c.access === 'admin');
  if (accessFilter === 'owner') return COMMANDS.filter((c) => c.access === 'owner' || c.access === 'admin');
  return COMMANDS.filter((c) => c.access === 'user');
}

export function formatCommandList(cmds) {
  return cmds.map((c) => `${c.cmd} — ${c.desc}`).join('\n');
}
