// src/commands/giveaway.js
//
// Full giveaway system — all in one file.
//
// Subcommands (20 total, max 25 allowed):
//   Direct:  start · end · reroll · cancel · pause · resume · edit · list · info · entries · winners · panel
//   bonus:   bonus add · bonus remove · bonus list
//   blacklist: blacklist add · blacklist remove · blacklist list
//   config:  config ping · config channel · config managerrole
//
// Extra entries:
//   • Each role can be assigned a bonus entry count via /giveaway bonus add.
//   • All matching roles are stacked (additive).
//   • Blacklisted users cannot enter.
//   • Required-role check happens at entry time.
//
// Scheduler:
//   • setInterval every 15 s checks for giveaways whose ends_at has passed.
//   • Stored winners in DB so /giveaway winners is always accurate.

'use strict';

const {
  SlashCommandBuilder,
  Events,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  ChannelType,
  time,
  TimestampStyles,
} = require('discord.js');

const db   = require('../database');
const { base } = require('../utils/embeds');

// ══════════════════════════════════════════════════════════════════════════════
// DATABASE
// ══════════════════════════════════════════════════════════════════════════════

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id              SERIAL      PRIMARY KEY,
      guild_id        TEXT        NOT NULL,
      channel_id      TEXT        NOT NULL,
      message_id      TEXT        UNIQUE,
      host_id         TEXT        NOT NULL,
      prize           TEXT        NOT NULL,
      winner_count    INT         NOT NULL DEFAULT 1,
      ends_at         TIMESTAMPTZ NOT NULL,
      ended           BOOLEAN     NOT NULL DEFAULT FALSE,
      paused          BOOLEAN     NOT NULL DEFAULT FALSE,
      required_role   TEXT,
      winners         TEXT[]      NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id  INT  NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL,
      entries      INT  NOT NULL DEFAULT 1,
      PRIMARY KEY (giveaway_id, user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS giveaway_bonus_rules (
      id        SERIAL PRIMARY KEY,
      guild_id  TEXT   NOT NULL,
      role_id   TEXT   NOT NULL,
      entries   INT    NOT NULL DEFAULT 1,
      UNIQUE (guild_id, role_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS giveaway_blacklist (
      guild_id  TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS giveaway_config (
      guild_id           TEXT PRIMARY KEY,
      ping_role_id       TEXT,
      default_channel_id TEXT,
      manager_role_id    TEXT
    )
  `);
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a duration string like "1d2h30m" → milliseconds.
 * Supports: d (days), h (hours), m (minutes), s (seconds).
 */
function parseDuration(str) {
  const map = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const re  = /(\d+)([smhd])/g;
  let ms = 0, match;
  while ((match = re.exec(str)) !== null) ms += Number(match[1]) * map[match[2]];
  return ms || null;
}

/** Format ms → human-readable e.g. "1d 2h 30m". */
function formatDuration(ms) {
  const d = Math.floor(ms / 86_400_000); ms %= 86_400_000;
  const h = Math.floor(ms / 3_600_000);  ms %= 3_600_000;
  const m = Math.floor(ms / 60_000);     ms %= 60_000;
  const s = Math.floor(ms / 1_000);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0s';
}

async function getConfig(guildId) {
  const { rows } = await db.query(
    `SELECT * FROM giveaway_config WHERE guild_id = $1`, [guildId]
  );
  return rows[0] ?? {};
}

async function getTotalEntries(giveawayId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(entries), 0)::int AS total FROM giveaway_entries WHERE giveaway_id = $1`,
    [giveawayId]
  );
  return rows[0].total;
}

async function getTotalParticipants(giveawayId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM giveaway_entries WHERE giveaway_id = $1`,
    [giveawayId]
  );
  return rows[0].total;
}

/**
 * Calculate total entries for a member in a guild by stacking all matching
 * bonus rules on top of the base 1 entry.
 */
async function calculateEntries(member, guildId) {
  let entries = 1;
  const { rows } = await db.query(
    `SELECT role_id, entries FROM giveaway_bonus_rules WHERE guild_id = $1`,
    [guildId]
  );
  for (const rule of rows) {
    if (member.roles.cache.has(rule.role_id)) entries += rule.entries;
  }
  return entries;
}

/**
 * Build a weighted entry pool and draw `count` unique winners.
 */
async function drawWinners(giveawayId, count) {
  const { rows } = await db.query(
    `SELECT user_id, entries FROM giveaway_entries WHERE giveaway_id = $1`,
    [giveawayId]
  );
  const pool = rows.flatMap(r => Array(r.entries).fill(r.user_id));
  if (!pool.length) return [];

  // Fisher-Yates shuffle, then pick first `count` unique
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [...new Set(pool)].slice(0, count);
}

// ══════════════════════════════════════════════════════════════════════════════
// EMBEDS & COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function giveawayEmbed(giveaway, totalEntries, participants) {
  const endsAt = new Date(giveaway.ends_at);
  const status = giveaway.ended  ? '🔴 Ended'
               : giveaway.paused ? '⏸️ Paused'
               : '🟢 Active';

  const desc = [
    `**Prize:** ${giveaway.prize}`,
    `**Hosted by:** <@${giveaway.host_id}>`,
    `**Winners:** ${giveaway.winner_count}`,
    `**Entries:** ${totalEntries}${participants != null ? ` (${participants} participants)` : ''}`,
    giveaway.required_role ? `**Required Role:** <@&${giveaway.required_role}>` : null,
    giveaway.ended
      ? `**Ended:** ${time(endsAt, TimestampStyles.ShortDateTime)}`
      : `**Ends:** ${time(endsAt, TimestampStyles.RelativeTime)}`,
    `**Status:** ${status}`,
    !giveaway.ended && !giveaway.paused ? '\n> 🎟️ Click the button below to enter!' : null,
    giveaway.paused ? '\n> ⏸️ This giveaway is currently paused.' : null,
  ].filter(Boolean).join('\n');

  return base(giveaway.ended ? 0x808080 : giveaway.paused ? 0xE67E22 : 0xF1C40F)
    .setTitle(`🎉 Giveaway — ${giveaway.prize}`)
    .setDescription(desc)
    .setFooter({ text: `ID: ${giveaway.id} • Brawl Services™` })
    .setTimestamp();
}

function winnerEmbed(giveaway, winners) {
  return base(0x2ECC71)
    .setTitle(`🎊 Giveaway Ended!`)
    .setDescription(
      `**Prize:** ${giveaway.prize}\n\n` +
      (winners.length
        ? `🏆 **Winner${winners.length > 1 ? 's' : ''}:**\n${winners.map(w => `<@${w}>`).join('\n')}\n\nCongratulations! 🎉`
        : '😔 No valid entries — no winner could be drawn.')
    )
    .setFooter({ text: `ID: ${giveaway.id} • Brawl Services™` })
    .setTimestamp();
}

function enterButton(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway_enter')
      .setLabel('Enter Giveaway')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CORE LOGIC — END A GIVEAWAY
// ══════════════════════════════════════════════════════════════════════════════

async function endGiveaway(client, giveawayId) {
  // Atomic update — only proceeds if not already ended
  const { rows } = await db.query(
    `UPDATE giveaways SET ended = TRUE WHERE id = $1 AND ended = FALSE RETURNING *`,
    [giveawayId]
  );
  if (!rows.length) return; // already ended or not found

  const giveaway    = rows[0];
  const winners     = await drawWinners(giveawayId, giveaway.winner_count);
  const totalEntries = await getTotalEntries(giveawayId);
  const participants = await getTotalParticipants(giveawayId);

  // Persist winners for future /giveaway winners lookups
  await db.query(`UPDATE giveaways SET winners = $1 WHERE id = $2`, [winners, giveawayId]);

  try {
    const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (!channel) return;

    // Edit original embed to ended state
    if (giveaway.message_id) {
      const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
      if (msg) {
        await msg.edit({
          embeds:     [giveawayEmbed({ ...giveaway, ended: true }, totalEntries, participants)],
          components: [enterButton(true)],
        }).catch(() => null);
      }
    }

    // Build ping prefix from config
    const cfg         = await getConfig(giveaway.guild_id);
    const pingContent = [
      cfg.ping_role_id ? `<@&${cfg.ping_role_id}>` : null,
      winners.length   ? winners.map(w => `<@${w}>`).join(' ') : null,
    ].filter(Boolean).join(' ');

    await channel.send({
      content: pingContent || undefined,
      embeds:  [winnerEmbed(giveaway, winners)],
      ...(giveaway.message_id ? { reply: { messageReference: giveaway.message_id, failIfNotExists: false } } : {}),
    });

    console.log(`[Giveaway] Ended #${giveawayId} — winners: ${winners.join(', ') || 'none'}`);
  } catch (err) {
    console.error(`[Giveaway] Error ending giveaway ${giveawayId}:`, err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PERMISSION CHECK
// ══════════════════════════════════════════════════════════════════════════════

async function hasManagePerms(interaction) {
  if (interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const cfg = await getConfig(interaction.guildId);
  if (cfg.manager_role_id && interaction.member.roles.cache.has(cfg.manager_role_id)) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

const handlers = {

  // ── /giveaway start ────────────────────────────────────────────────────────
  async start(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ You need Manage Server or the giveaway manager role.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const cfg          = await getConfig(interaction.guildId);
    const channelOpt   = interaction.options.getChannel('channel');
    const channel      = channelOpt ?? (cfg.default_channel_id
                           ? await interaction.guild.channels.fetch(cfg.default_channel_id).catch(() => null)
                           : interaction.channel);

    if (!channel) return interaction.editReply('❌ No channel specified and no default channel configured.');

    const prize        = interaction.options.getString('prize');
    const durationStr  = interaction.options.getString('duration');
    const winnerCount  = interaction.options.getInteger('winners')       ?? 1;
    const requiredRole = interaction.options.getRole('required_role');

    const ms = parseDuration(durationStr);
    if (!ms)                    return interaction.editReply('❌ Invalid duration. Examples: `1d`, `2h30m`, `90s`.');
    if (ms < 10_000)            return interaction.editReply('❌ Duration must be at least 10 seconds.');
    if (ms > 30 * 86_400_000)   return interaction.editReply('❌ Duration cannot exceed 30 days.');
    if (winnerCount < 1)        return interaction.editReply('❌ Must have at least 1 winner.');

    const endsAt = new Date(Date.now() + ms);

    const { rows } = await db.query(
      `INSERT INTO giveaways (guild_id, channel_id, host_id, prize, winner_count, ends_at, required_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [interaction.guildId, channel.id, interaction.user.id, prize, winnerCount, endsAt, requiredRole?.id ?? null]
    );
    const giveaway = rows[0];

    const msg = await channel.send({
      embeds:     [giveawayEmbed(giveaway, 0, 0)],
      components: [enterButton()],
    });

    await db.query(`UPDATE giveaways SET message_id = $1 WHERE id = $2`, [msg.id, giveaway.id]);

    await interaction.editReply(
      `✅ Giveaway **#${giveaway.id}** started in ${channel}!\n` +
      `📦 **Prize:** ${prize} | ⏱️ **Duration:** ${formatDuration(ms)} | 🏆 **Winners:** ${winnerCount}`
    );
  },

  // ── /giveaway end ─────────────────────────────────────────────────────────
  async end(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('id');

    const { rows } = await db.query(
      `SELECT 1 FROM giveaways WHERE id=$1 AND guild_id=$2 AND ended=FALSE`,
      [id, interaction.guildId]
    );
    if (!rows.length) return interaction.editReply('❌ Active giveaway not found.');

    await endGiveaway(interaction.client, id);
    await interaction.editReply(`✅ Giveaway **#${id}** ended.`);
  },

  // ── /giveaway reroll ──────────────────────────────────────────────────────
  async reroll(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const id    = interaction.options.getInteger('id');
    const count = interaction.options.getInteger('winners') ?? 1;

    const { rows } = await db.query(
      `SELECT * FROM giveaways WHERE id=$1 AND guild_id=$2 AND ended=TRUE`,
      [id, interaction.guildId]
    );
    if (!rows.length) return interaction.editReply('❌ Ended giveaway not found.');

    const winners = await drawWinners(id, count);
    await db.query(`UPDATE giveaways SET winners=$1 WHERE id=$2`, [winners, id]);

    const channel = await interaction.guild.channels.fetch(rows[0].channel_id).catch(() => null);
    if (channel) {
      await channel.send({
        content: winners.map(w => `<@${w}>`).join(' ') || undefined,
        embeds: [
          base(0x3498DB)
            .setTitle('🔁 Giveaway Rerolled')
            .setDescription(
              `**Prize:** ${rows[0].prize}\n\n` +
              (winners.length
                ? `🏆 New winner${winners.length > 1 ? 's' : ''}:\n${winners.map(w => `<@${w}>`).join('\n')}`
                : 'Still no valid entries.')
            )
            .setFooter({ text: `ID: ${id} • Brawl Services™` })
            .setTimestamp(),
        ],
      });
    }

    await interaction.editReply(`✅ Rerolled **${count}** winner(s) for giveaway **#${id}**.`);
  },

  // ── /giveaway cancel ──────────────────────────────────────────────────────
  async cancel(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('id');

    const { rows } = await db.query(
      `DELETE FROM giveaways WHERE id=$1 AND guild_id=$2 AND ended=FALSE RETURNING *`,
      [id, interaction.guildId]
    );
    if (!rows.length) return interaction.editReply('❌ Active giveaway not found.');

    // Try to delete or edit the original message
    try {
      const channel = await interaction.guild.channels.fetch(rows[0].channel_id).catch(() => null);
      const msg     = channel && rows[0].message_id
                        ? await channel.messages.fetch(rows[0].message_id).catch(() => null)
                        : null;
      if (msg) await msg.delete().catch(() => null);
    } catch {}

    await interaction.editReply(`✅ Giveaway **#${id}** cancelled and removed.`);
  },

  // ── /giveaway pause ───────────────────────────────────────────────────────
  async pause(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('id');

    const { rows } = await db.query(
      `UPDATE giveaways SET paused=TRUE
       WHERE id=$1 AND guild_id=$2 AND ended=FALSE AND paused=FALSE RETURNING *`,
      [id, interaction.guildId]
    );
    if (!rows.length) return interaction.editReply('❌ Active, unpaused giveaway not found.');

    const total = await getTotalEntries(id);
    try {
      const channel = await interaction.guild.channels.fetch(rows[0].channel_id).catch(() => null);
      const msg     = channel && await channel.messages.fetch(rows[0].message_id).catch(() => null);
      if (msg) await msg.edit({ embeds: [giveawayEmbed({ ...rows[0], paused: true }, total)], components: [enterButton(true)] });
    } catch {}

    await interaction.editReply(`✅ Giveaway **#${id}** paused. Entries are locked until resumed.`);
  },

  // ── /giveaway resume ──────────────────────────────────────────────────────
  async resume(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('id');

    const { rows } = await db.query(
      `UPDATE giveaways SET paused=FALSE
       WHERE id=$1 AND guild_id=$2 AND ended=FALSE AND paused=TRUE RETURNING *`,
      [id, interaction.guildId]
    );
    if (!rows.length) return interaction.editReply('❌ Paused giveaway not found.');

    const total = await getTotalEntries(id);
    try {
      const channel = await interaction.guild.channels.fetch(rows[0].channel_id).catch(() => null);
      const msg     = channel && await channel.messages.fetch(rows[0].message_id).catch(() => null);
      if (msg) await msg.edit({ embeds: [giveawayEmbed({ ...rows[0], paused: false }, total)], components: [enterButton(false)] });
    } catch {}

    await interaction.editReply(`✅ Giveaway **#${id}** resumed.`);
  },

  // ── /giveaway edit ────────────────────────────────────────────────────────
  async edit(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const id          = interaction.options.getInteger('id');
    const prize       = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winners     = interaction.options.getInteger('winners');

    const sets   = [];
    const values = [];
    let   i      = 1;

    if (prize)       { sets.push(`prize=$${i++}`);        values.push(prize); }
    if (winners)     { sets.push(`winner_count=$${i++}`); values.push(winners); }
    if (durationStr) {
      const ms = parseDuration(durationStr);
      if (!ms) return interaction.editReply('❌ Invalid duration.');
      sets.push(`ends_at = NOW() + ($${i++} * interval '1 millisecond')`);
      values.push(ms);
    }
    if (!sets.length) return interaction.editReply('❌ Provide at least one field to edit.');

    values.push(id, interaction.guildId);
    const { rows } = await db.query(
      `UPDATE giveaways SET ${sets.join(', ')}
       WHERE id=$${i++} AND guild_id=$${i} AND ended=FALSE RETURNING *`,
      values
    );
    if (!rows.length) return interaction.editReply('❌ Active giveaway not found.');

    const total = await getTotalEntries(id);
    try {
      const channel = await interaction.guild.channels.fetch(rows[0].channel_id).catch(() => null);
      const msg     = channel && await channel.messages.fetch(rows[0].message_id).catch(() => null);
      if (msg) await msg.edit({ embeds: [giveawayEmbed(rows[0], total)] });
    } catch {}

    await interaction.editReply(`✅ Giveaway **#${id}** updated.`);
  },

  // ── /giveaway list ────────────────────────────────────────────────────────
  async list(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const { rows } = await db.query(
      `SELECT * FROM giveaways WHERE guild_id=$1 AND ended=FALSE ORDER BY ends_at ASC`,
      [interaction.guildId]
    );
    if (!rows.length) return interaction.editReply('There are no active giveaways.');

    const lines = await Promise.all(rows.map(async g => {
      const total = await getTotalEntries(g.id);
      return (
        `**#${g.id} — ${g.prize}**\n` +
        `↳ <#${g.channel_id}> • ${total} entries • ${g.winner_count} winner(s)` +
        ` • Ends ${time(new Date(g.ends_at), TimestampStyles.RelativeTime)}` +
        (g.paused ? ' • ⏸️ Paused' : '')
      );
    }));

    await interaction.editReply({
      embeds: [
        base(0xF1C40F)
          .setTitle('🎉 Active Giveaways')
          .setDescription(lines.join('\n\n'))
          .setFooter({ text: `${rows.length} active giveaway(s) • Brawl Services™` }),
      ],
    });
  },

  // ── /giveaway info ────────────────────────────────────────────────────────
  async info(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('id');

    const { rows } = await db.query(
      `SELECT * FROM giveaways WHERE id=$1 AND guild_id=$2`, [id, interaction.guildId]
    );
    if (!rows.length) return interaction.editReply('❌ Giveaway not found.');

    const g            = rows[0];
    const total        = await getTotalEntries(id);
    const participants = await getTotalParticipants(id);

    const embed = giveawayEmbed(g, total, participants)
      .addFields(
        { name: 'Channel', value: `<#${g.channel_id}>`, inline: true },
        { name: 'Created', value: time(new Date(g.created_at), TimestampStyles.ShortDateTime), inline: true },
        g.ended && g.winners?.length
          ? { name: 'Winners', value: g.winners.map(w => `<@${w}>`).join('\n'), inline: false }
          : { name: '\u200b', value: '\u200b', inline: false }
      );

    await interaction.editReply({ embeds: [embed] });
  },

  // ── /giveaway entries ─────────────────────────────────────────────────────
  async entries(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const id     = interaction.options.getInteger('id');
    const target = interaction.options.getUser('user') ?? interaction.user;

    const { rows: gRows } = await db.query(
      `SELECT 1 FROM giveaways WHERE id=$1 AND guild_id=$2`, [id, interaction.guildId]
    );
    if (!gRows.length) return interaction.editReply('❌ Giveaway not found in this server.');

    const { rows } = await db.query(
      `SELECT entries FROM giveaway_entries WHERE giveaway_id=$1 AND user_id=$2`,
      [id, target.id]
    );

    const count = rows[0]?.entries ?? 0;
    await interaction.editReply(
      count
        ? `🎟️ ${target} has **${count} entries** in giveaway **#${id}**.`
        : `${target} has not entered giveaway **#${id}**.`
    );
  },

  // ── /giveaway winners ─────────────────────────────────────────────────────
  async winners(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('id');

    const { rows } = await db.query(
      `SELECT * FROM giveaways WHERE id=$1 AND guild_id=$2 AND ended=TRUE`,
      [id, interaction.guildId]
    );
    if (!rows.length) return interaction.editReply('❌ Ended giveaway not found.');

    const g = rows[0];
    await interaction.editReply({
      embeds: [winnerEmbed(g, g.winners ?? [])],
    });
  },

  // ── /giveaway panel ───────────────────────────────────────────────────────
  async panel(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('gpanel_list')
        .setLabel('Active Giveaways')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎉'),
      new ButtonBuilder()
        .setCustomId('gpanel_bonus')
        .setLabel('Bonus Entry Rules')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⭐'),
      new ButtonBuilder()
        .setCustomId('gpanel_myentries')
        .setLabel('My Entries')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎟️'),
    );

    await channel.send({
      embeds: [
        base(0xF1C40F)
          .setTitle('🎉 Giveaway Center')
          .setDescription(
            'Welcome to the giveaway center! Use the buttons below:\n\n' +
            '🎉 **Active Giveaways** — See all ongoing giveaways\n' +
            '⭐ **Bonus Entry Rules** — Learn how to earn extra entries\n' +
            '🎟️ **My Entries** — Check how many entries you have'
          )
          .setFooter({ text: 'Brawl Services™ Giveaways' }),
      ],
      components: [row],
    });

    await interaction.editReply(`✅ Giveaway panel sent to ${channel}.`);
  },

  // ── /giveaway bonus add ───────────────────────────────────────────────────
  async 'bonus-add'(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const role    = interaction.options.getRole('role');
    const entries = interaction.options.getInteger('entries');
    if (entries < 1) return interaction.editReply('❌ Bonus entries must be at least 1.');

    await db.query(
      `INSERT INTO giveaway_bonus_rules (guild_id, role_id, entries)
       VALUES ($1,$2,$3)
       ON CONFLICT (guild_id, role_id) DO UPDATE SET entries=EXCLUDED.entries`,
      [interaction.guildId, role.id, entries]
    );
    await interaction.editReply(`✅ ${role} now grants **+${entries}** bonus entries per giveaway.`);
  },

  // ── /giveaway bonus remove ────────────────────────────────────────────────
  async 'bonus-remove'(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const role = interaction.options.getRole('role');

    const { rowCount } = await db.query(
      `DELETE FROM giveaway_bonus_rules WHERE guild_id=$1 AND role_id=$2`,
      [interaction.guildId, role.id]
    );
    if (!rowCount) return interaction.editReply('❌ No bonus rule found for that role.');
    await interaction.editReply(`✅ Removed bonus entry rule for ${role}.`);
  },

  // ── /giveaway bonus list ──────────────────────────────────────────────────
  async 'bonus-list'(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const { rows } = await db.query(
      `SELECT role_id, entries FROM giveaway_bonus_rules WHERE guild_id=$1 ORDER BY entries DESC`,
      [interaction.guildId]
    );

    if (!rows.length) return interaction.editReply('No bonus entry rules configured.');

    await interaction.editReply({
      embeds: [
        base(0xF1C40F)
          .setTitle('⭐ Bonus Entry Rules')
          .setDescription(rows.map(r => `<@&${r.role_id}> → **+${r.entries}** entries`).join('\n'))
          .setFooter({ text: 'All bonuses stack additively on top of the base 1 entry.' }),
      ],
    });
  },

  // ── /giveaway blacklist add ───────────────────────────────────────────────
  async 'blacklist-add'(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const user = interaction.options.getUser('user');

    await db.query(
      `INSERT INTO giveaway_blacklist (guild_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [interaction.guildId, user.id]
    );
    await interaction.editReply(`✅ ${user} is now blacklisted from all giveaways.`);
  },

  // ── /giveaway blacklist remove ────────────────────────────────────────────
  async 'blacklist-remove'(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const user = interaction.options.getUser('user');

    const { rowCount } = await db.query(
      `DELETE FROM giveaway_blacklist WHERE guild_id=$1 AND user_id=$2`,
      [interaction.guildId, user.id]
    );
    if (!rowCount) return interaction.editReply('❌ That user is not blacklisted.');
    await interaction.editReply(`✅ ${user} removed from the giveaway blacklist.`);
  },

  // ── /giveaway blacklist list ──────────────────────────────────────────────
  async 'blacklist-list'(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const { rows } = await db.query(
      `SELECT user_id FROM giveaway_blacklist WHERE guild_id=$1`,
      [interaction.guildId]
    );

    if (!rows.length) return interaction.editReply('No users are blacklisted.');
    await interaction.editReply({
      embeds: [
        base(0xE74C3C)
          .setTitle('🚫 Blacklisted Users')
          .setDescription(rows.map(r => `<@${r.user_id}>`).join('\n')),
      ],
    });
  },

  // ── /giveaway config ping ─────────────────────────────────────────────────
  async 'config-ping'(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const role = interaction.options.getRole('role');

    await db.query(
      `INSERT INTO giveaway_config (guild_id, ping_role_id) VALUES ($1,$2)
       ON CONFLICT (guild_id) DO UPDATE SET ping_role_id=EXCLUDED.ping_role_id`,
      [interaction.guildId, role?.id ?? null]
    );
    await interaction.editReply(role ? `✅ Ping role set to ${role}.` : '✅ Ping role cleared.');
  },

  // ── /giveaway config channel ──────────────────────────────────────────────
  async 'config-channel'(interaction) {
    if (!await hasManagePerms(interaction))
      return interaction.reply({ content: '❌ Missing permissions.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const channel = interaction.options.getChannel('channel');

    await db.query(
      `INSERT INTO giveaway_config (guild_id, default_channel_id) VALUES ($1,$2)
       ON CONFLICT (guild_id) DO UPDATE SET default_channel_id=EXCLUDED.default_channel_id`,
      [interaction.guildId, channel?.id ?? null]
    );
    await interaction.editReply(channel ? `✅ Default giveaway channel set to ${channel}.` : '✅ Default channel cleared.');
  },

  // ── /giveaway config managerrole ──────────────────────────────────────────
  async 'config-managerrole'(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Only members with Manage Server can set the manager role.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const role = interaction.options.getRole('role');

    await db.query(
      `INSERT INTO giveaway_config (guild_id, manager_role_id) VALUES ($1,$2)
       ON CONFLICT (guild_id) DO UPDATE SET manager_role_id=EXCLUDED.manager_role_id`,
      [interaction.guildId, role?.id ?? null]
    );
    await interaction.editReply(role ? `✅ Giveaway manager role set to ${role}.` : '✅ Manager role cleared.');
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// BUTTON INTERACTION HANDLER
// ══════════════════════════════════════════════════════════════════════════════

async function handleButton(interaction) {
  const { customId, guildId, user, member } = interaction;

  // ── Enter giveaway ────────────────────────────────────────────────────────
  if (customId === 'giveaway_enter') {
    await interaction.deferReply({ ephemeral: true });

    // Find giveaway by message ID
    const { rows: gRows } = await db.query(
      `SELECT * FROM giveaways WHERE message_id=$1 AND guild_id=$2`,
      [interaction.message.id, guildId]
    );
    if (!gRows.length) return interaction.editReply('❌ Giveaway not found.');
    const g = gRows[0];

    if (g.ended)  return interaction.editReply('❌ This giveaway has already ended.');
    if (g.paused) return interaction.editReply('⏸️ This giveaway is currently paused.');

    // Blacklist check
    const { rows: blRows } = await db.query(
      `SELECT 1 FROM giveaway_blacklist WHERE guild_id=$1 AND user_id=$2`,
      [guildId, user.id]
    );
    if (blRows.length) return interaction.editReply('🚫 You are blacklisted from entering giveaways.');

    // Required role check
    if (g.required_role && !member.roles.cache.has(g.required_role))
      return interaction.editReply(`❌ You need the <@&${g.required_role}> role to enter.`);

    // Already entered?
    const { rows: eRows } = await db.query(
      `SELECT entries FROM giveaway_entries WHERE giveaway_id=$1 AND user_id=$2`,
      [g.id, user.id]
    );
    if (eRows.length) {
      return interaction.editReply(`✅ You're already in! You have **${eRows[0].entries}** entries.`);
    }

    // Calculate entries
    const entries = await calculateEntries(member, guildId);

    await db.query(
      `INSERT INTO giveaway_entries (giveaway_id, user_id, entries) VALUES ($1,$2,$3)`,
      [g.id, user.id, entries]
    );

    // Update embed entry count
    const total        = await getTotalEntries(g.id);
    const participants = await getTotalParticipants(g.id);
    await interaction.message.edit({ embeds: [giveawayEmbed(g, total, participants)] }).catch(() => null);

    const bonusNote = entries > 1 ? ` (+${entries - 1} bonus from your roles!)` : '';
    await interaction.editReply(`🎉 You entered with **${entries} entries**!${bonusNote}`);
    return;
  }

  // ── Panel: active giveaways ───────────────────────────────────────────────
  if (customId === 'gpanel_list') {
    await interaction.deferReply({ ephemeral: true });
    const { rows } = await db.query(
      `SELECT * FROM giveaways WHERE guild_id=$1 AND ended=FALSE ORDER BY ends_at ASC`,
      [guildId]
    );
    if (!rows.length) return interaction.editReply('There are no active giveaways right now.');

    const lines = await Promise.all(rows.map(async g => {
      const total = await getTotalEntries(g.id);
      return `**#${g.id} — ${g.prize}**\n↳ <#${g.channel_id}> • ${total} entries • Ends ${time(new Date(g.ends_at), TimestampStyles.RelativeTime)}`;
    }));
    return interaction.editReply({
      embeds: [base(0xF1C40F).setTitle('🎉 Active Giveaways').setDescription(lines.join('\n\n'))],
    });
  }

  // ── Panel: bonus rules ────────────────────────────────────────────────────
  if (customId === 'gpanel_bonus') {
    await interaction.deferReply({ ephemeral: true });
    const { rows } = await db.query(
      `SELECT role_id, entries FROM giveaway_bonus_rules WHERE guild_id=$1 ORDER BY entries DESC`,
      [guildId]
    );
    if (!rows.length) return interaction.editReply('No bonus entry rules are configured.');
    return interaction.editReply({
      embeds: [
        base(0xF1C40F)
          .setTitle('⭐ Bonus Entry Rules')
          .setDescription(rows.map(r => `<@&${r.role_id}> → **+${r.entries}** entries`).join('\n'))
          .setFooter({ text: 'Bonuses stack additively on top of your base 1 entry.' }),
      ],
    });
  }

  // ── Panel: my entries ─────────────────────────────────────────────────────
  if (customId === 'gpanel_myentries') {
    await interaction.deferReply({ ephemeral: true });
    const { rows } = await db.query(
      `SELECT ge.giveaway_id, ge.entries, g.prize
       FROM giveaway_entries ge
       JOIN giveaways g ON g.id = ge.giveaway_id
       WHERE ge.user_id=$1 AND g.guild_id=$2 AND g.ended=FALSE`,
      [user.id, guildId]
    );
    if (!rows.length) return interaction.editReply("You haven't entered any active giveaways.");
    const lines = rows.map(r => `**#${r.giveaway_id} — ${r.prize}**: ${r.entries} entries`);
    return interaction.editReply({
      embeds: [base(0x2ECC71).setTitle('🎟️ Your Active Giveaway Entries').setDescription(lines.join('\n'))],
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND DATA  (slash command definition — registered with Discord)
// ══════════════════════════════════════════════════════════════════════════════

const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Giveaway management')
  .setDefaultMemberPermissions(null) // permissions enforced manually above
  .setDMPermission(false)

  // ── Direct subcommands ────────────────────────────────────────────────────
  .addSubcommand(s => s.setName('start').setDescription('Start a new giveaway')
    .addStringOption(o => o.setName('prize').setDescription('What are you giving away?').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 1d, 2h30m, 90s').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(20))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (uses default if not set)').addChannelTypes(ChannelType.GuildText))
    .addRoleOption(o => o.setName('required_role').setDescription('Role required to enter')))

  .addSubcommand(s => s.setName('end').setDescription('End a giveaway early')
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))

  .addSubcommand(s => s.setName('reroll').setDescription('Reroll winner(s) for an ended giveaway')
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of new winners to draw').setMinValue(1).setMaxValue(20)))

  .addSubcommand(s => s.setName('cancel').setDescription('Cancel an active giveaway and delete its message')
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))

  .addSubcommand(s => s.setName('pause').setDescription('Pause a giveaway (locks entries)')
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))

  .addSubcommand(s => s.setName('resume').setDescription('Resume a paused giveaway')
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))

  .addSubcommand(s => s.setName('edit').setDescription('Edit an active giveaway')
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
    .addStringOption(o => o.setName('prize').setDescription('New prize name'))
    .addStringOption(o => o.setName('duration').setDescription('New duration from now e.g. 2h'))
    .addIntegerOption(o => o.setName('winners').setDescription('New winner count').setMinValue(1).setMaxValue(20)))

  .addSubcommand(s => s.setName('list').setDescription('List all active giveaways'))

  .addSubcommand(s => s.setName('info').setDescription('Detailed info about a giveaway')
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))

  .addSubcommand(s => s.setName('entries').setDescription("Check a user's entries in a giveaway")
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
    .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)')))

  .addSubcommand(s => s.setName('winners').setDescription('Show the winners of an ended giveaway')
    .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))

  .addSubcommand(s => s.setName('panel').setDescription('Post a public giveaway panel embed')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post panel in').addChannelTypes(ChannelType.GuildText)))

  // ── bonus group ───────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g.setName('bonus').setDescription('Manage bonus entry rules')
    .addSubcommand(s => s.setName('add').setDescription('Give a role bonus entries')
      .addRoleOption(o => o.setName('role').setDescription('The role').setRequired(true))
      .addIntegerOption(o => o.setName('entries').setDescription('Bonus entries to grant').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a bonus entry rule')
      .addRoleOption(o => o.setName('role').setDescription('The role').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all bonus entry rules')))

  // ── blacklist group ───────────────────────────────────────────────────────
  .addSubcommandGroup(g => g.setName('blacklist').setDescription('Manage the giveaway blacklist')
    .addSubcommand(s => s.setName('add').setDescription('Blacklist a user from all giveaways')
      .addUserOption(o => o.setName('user').setDescription('User to blacklist').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a user from the blacklist')
      .addUserOption(o => o.setName('user').setDescription('User to unblacklist').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('View all blacklisted users')))

  // ── config group ──────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g.setName('config').setDescription('Server-wide giveaway settings')
    .addSubcommand(s => s.setName('ping').setDescription('Set or clear the role pinged when giveaways end')
      .addRoleOption(o => o.setName('role').setDescription('Role to ping (leave blank to clear)')))
    .addSubcommand(s => s.setName('channel').setDescription('Set or clear the default giveaway channel')
      .addChannelOption(o => o.setName('channel').setDescription('Default channel (leave blank to clear)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('managerrole').setDescription('Set a role that can manage giveaways without Manage Server')
      .addRoleOption(o => o.setName('role').setDescription('Manager role (leave blank to clear)'))));

// ══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS  (compatible with a standard command handler)
// ══════════════════════════════════════════════════════════════════════════════

let schedulerStarted = false;

module.exports = {
  data,

  // Called by your command handler on bot ready / first load
  async init(client) {
    await ensureTables();

    if (!schedulerStarted) {
      schedulerStarted = true;
      setInterval(async () => {
        try {
          const { rows } = await db.query(
            `SELECT id FROM giveaways WHERE ended=FALSE AND paused=FALSE AND ends_at <= NOW()`
          );
          for (const row of rows) await endGiveaway(client, row.id);
        } catch (err) {
          console.error('[Giveaway] Scheduler error:', err);
        }
      }, 15_000);
      console.log('[Giveaway] Scheduler started (15 s interval).');
    }
  },

  // Chat input command
  async execute(interaction) {
    await ensureTables();

    const group = interaction.options.getSubcommandGroup(false);
    const sub   = interaction.options.getSubcommand();
    const key   = group ? `${group}-${sub}` : sub;

    const handler = handlers[key];
    if (!handler) return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });

    try {
      await handler(interaction);
    } catch (err) {
      console.error(`[Giveaway] Error in /${key}:`, err);
      const reply = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
      interaction.deferred || interaction.replied
        ? await interaction.editReply(reply).catch(() => null)
        : await interaction.reply(reply).catch(() => null);
    }
  },

async handleButton(interaction) {
    try {
      await handleButton(interaction);
    } catch (err) {
      console.error('[Giveaway] Button error:', err);
      const reply = { content: '❌ Something went wrong.', ephemeral: true };
      interaction.deferred || interaction.replied
        ? await interaction.editReply(reply).catch(() => null)
        : await interaction.reply(reply).catch(() => null);
    }
  },
