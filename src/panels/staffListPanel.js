// src/panels/staffListPanel.js

const {
  AttachmentBuilder,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { COLORS } = require('../utils/constants');
const { base }   = require('../utils/embeds');

// ─── LOGO HELPERS ──────────────────────────────────────────────────────────

// Used on initial post — uploads the file as an attachment
const logo = () => new AttachmentBuilder(
  path.resolve('assets/logo.png'),
  { name: 'logo.png' }
);

// Used on edits — converts the file to a base64 data URI so Discord
// can render it as a thumbnail without needing a re-upload
function logoDataURI() {
  const buf = fs.readFileSync(path.resolve('assets/logo.png'));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// ─── STAFF ROLE CONFIG ─────────────────────────────────────────────────────
/**
 * Reads the 13 staff roles from env vars (highest rank first).
 *
 * Required env vars (repeat pattern for 1–13):
 *   STAFF_ROLE_1_NAME=Owner
 *   STAFF_ROLE_1_ID=123456789012345678
 *   STAFF_ROLE_2_NAME=Co-Owner
 *   STAFF_ROLE_2_ID=987654321098765432
 *   … up to STAFF_ROLE_13_NAME / STAFF_ROLE_13_ID
 */
function loadStaffRoles() {
  const roles = [];
  for (let i = 1; i <= 13; i++) {
    const id   = process.env[`STAFF_ROLE_${i}_ID`];
    const name = process.env[`STAFF_ROLE_${i}_NAME`];
    if (id && name) roles.push({ id, name, priority: i }); // lower number = higher rank
  }
  return roles;
}

// ─── STAFF LIST PANEL ──────────────────────────────────────────────────────
/**
 * Builds and returns the staff list embed payload.
 * Members are grouped by their single highest staff role.
 * Roles with no members are silently skipped.
 *
 * @param {import('discord.js').Guild} guild
 * @param {{ filesIncluded?: boolean }} [opts]
 *   filesIncluded – true  → initial post, uploads logo as attachment
 *                   false → edit, uses base64 data URI for thumbnail
 */
async function staffListPanel(guild, { filesIncluded = true } = {}) {
  const staffRoles = loadStaffRoles();

  // ── Graceful fallback if env is misconfigured ────────────────────────────
  if (staffRoles.length === 0) {
    const embed = base(COLORS.INFO)
      .setTitle('👥 Staff List – Brawl Services™')
      .setDescription(
        `⚠️ **No staff roles configured.**\n\n` +
        `Set \`STAFF_ROLE_1_ID\` and \`STAFF_ROLE_1_NAME\` … ` +
        `\`STAFF_ROLE_13_ID\` and \`STAFF_ROLE_13_NAME\` in your Railway env.`
      )
      .setThumbnail(filesIncluded ? 'attachment://logo.png' : logoDataURI())
      .setFooter({ text: 'Brawl Services™ Staff List' })
      .setTimestamp();

    const payload = { embeds: [embed], components: [] };
    if (filesIncluded) payload.files = [logo()];
    return payload;
  }

  // ── Force-refresh member cache ───────────────────────────────────────────
  await guild.members.fetch();

  // ── Build lookup maps ────────────────────────────────────────────────────
  const staffRoleIds = new Set(staffRoles.map(r => r.id));
  const roleById     = Object.fromEntries(staffRoles.map(r => [r.id, r]));

  // roleGroups: roleId → array of usernames
  const roleGroups = Object.fromEntries(staffRoles.map(r => [r.id, []]));

  guild.members.cache.forEach(member => {
    const held = member.roles.cache
      .filter(r => staffRoleIds.has(r.id))
      .map(r => roleById[r.id]);

    if (held.length === 0) return;

    // Assign member to their single highest-priority staff role
    const highest = held.reduce((best, r) =>
      r.priority < best.priority ? r : best
    );

    roleGroups[highest.id].push(member.user.username);
  });

  // ── Build embed description ──────────────────────────────────────────────
  const sections = [];
  let totalStaff = 0;

  for (const role of staffRoles) {
    const members = roleGroups[role.id].sort((a, b) => a.localeCompare(b));
    if (members.length === 0) continue;

    totalStaff += members.length;
    sections.push(
      `**${role.name}**\n` +
      members.map(name => `╰ ${name}`).join('\n')
    );
  }

  const description =
    `> Staff members are listed under their **highest role**.\n` +
    `> **Total staff in roster:** ${totalStaff}\n\n` +
    (sections.length > 0
      ? sections.join('\n\n')
      : `*No staff members found with the configured roles.*`
    );

  // ── Assemble final embed ─────────────────────────────────────────────────
  const embed = base(COLORS.INFO)
    .setTitle('👥 Staff List – Brawl Services™')
    .setDescription(description)
    .setThumbnail(filesIncluded ? 'attachment://logo.png' : logoDataURI())
    .setFooter({ text: 'Auto-updates every 5 minutes  •  Brawl Services™' })
    .setTimestamp();

  const payload = { embeds: [embed], components: [] };
  if (filesIncluded) payload.files = [logo()];
  return payload;
}

// ─── AUTO-UPDATE TASK ──────────────────────────────────────────────────────
const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let   autoUpdateInterval  = null;

/**
 * Starts the 5-minute auto-edit loop.
 * Safe to call multiple times — clears any previous interval first.
 *
 * @param {import('discord.js').Client} client
 */
function startStaffListAutoUpdate(client) {
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
    autoUpdateInterval = null;
  }

  const run = async () => {
    const channelId = process.env.STAFF_LIST_CHANNEL_ID;
    const messageId = process.env.STAFF_LIST_MESSAGE_ID;

    if (!channelId || !messageId) return; // silently skip until /stafflist post is run

    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return console.warn('[StaffList] Channel not found — check STAFF_LIST_CHANNEL_ID.');

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) return console.warn('[StaffList] Message not found — check STAFF_LIST_MESSAGE_ID.');

      const payload = await staffListPanel(channel.guild, { filesIncluded: false });
      await message.edit(payload);

      console.log(`[StaffList] Auto-updated at ${new Date().toISOString()}`);
    } catch (err) {
      console.error('[StaffList] Auto-update error:', err);
    }
  };

  run();
  autoUpdateInterval = setInterval(run, UPDATE_INTERVAL_MS);
  console.log('[StaffList] Auto-update task started (5-min interval).');
}

/**
 * Triggers one immediate refresh outside of the interval.
 * Used by the /stafflist refresh subcommand.
 *
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function forceRefreshStaffList(client) {
  const channelId = process.env.STAFF_LIST_CHANNEL_ID;
  const messageId = process.env.STAFF_LIST_MESSAGE_ID;

  if (!channelId || !messageId) {
    return {
      ok: false,
      error: '`STAFF_LIST_CHANNEL_ID` or `STAFF_LIST_MESSAGE_ID` is not set. Run `/stafflist post` first.',
    };
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return { ok: false, error: 'Channel not found. Check `STAFF_LIST_CHANNEL_ID`.' };

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return { ok: false, error: 'Message not found. Check `STAFF_LIST_MESSAGE_ID`.' };

    const payload = await staffListPanel(channel.guild, { filesIncluded: false });
    await message.edit(payload);

    return { ok: true };
  } catch (err) {
    console.error('[StaffList] Force-refresh error:', err);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  staffListPanel,
  startStaffListAutoUpdate,
  forceRefreshStaffList,
};
