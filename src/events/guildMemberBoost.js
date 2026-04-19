// src/events/guildMemberBoost.js
//
// Fires an announcement whenever a member starts boosting the server.
//
// Safety guarantees:
//   • Only triggers when premiumSince goes from null → a date.
//     Nickname, tag, avatar, role, or any other profile change will
//     never satisfy that condition, so no false announcements.
//   • The (user_id, guild_id, boosted_since) triplet is stored in DB
//     after the first announcement. If the bot restarts and the event
//     re-fires for the same boost period, the DB check skips it.
//   • If a member stops and re-boosts, premiumSince resets to a new
//     timestamp, which is a different triplet → correctly re-announces.

const { Events, AttachmentBuilder } = require('discord.js');
const path = require('path');
const db   = require('../database');
const { COLORS } = require('../utils/constants');
const { base }   = require('../utils/embeds');

// ─── ENSURE TABLE EXISTS ───────────────────────────────────────────────────
// Called once on first use. Safe to call repeatedly (IF NOT EXISTS).
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS boost_announcements (
      user_id       TEXT        NOT NULL,
      guild_id      TEXT        NOT NULL,
      boosted_since TIMESTAMPTZ NOT NULL,
      announced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, guild_id, boosted_since)
    )
  `);
}

// ─── ANNOUNCEMENT EMBED ────────────────────────────────────────────────────
function boostEmbed(member, totalBoosters) {
  return base(0xFF73FA) // Discord boost pink
    .setTitle('💖 New Server Boost!')
    .setDescription(
      `${member} just boosted **${member.guild.name}**! 🚀\n\n` +
      `Thank you for supporting us — you're amazing! 💜\n\n` +
      `> 🌟 **Total boosters:** ${totalBoosters}`
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: 'Brawl Services™ • Thank you for boosting!' })
    .setTimestamp();
}

// ─── EVENT ─────────────────────────────────────────────────────────────────
module.exports = {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember) {
    // ── Guard: only act on a brand-new boost ──────────────────────────────
    // premiumSince is null when not boosting, a Date when boosting.
    // Any other member update (nick, roles, avatar …) leaves premiumSince
    // unchanged, so this condition stays false and we return immediately.
    const wasNotBoosting = !oldMember.premiumSince;
    const isNowBoosting  = !!newMember.premiumSince;
    if (!wasNotBoosting || !isNowBoosting) return;

    const boostedSince = newMember.premiumSince.toISOString();

    try {
      await ensureTable();

      // ── Guard: already announced for this exact boost period ─────────────
      const { rows } = await db.query(
        `SELECT 1 FROM boost_announcements
         WHERE user_id=$1 AND guild_id=$2 AND boosted_since=$3
         LIMIT 1`,
        [newMember.id, newMember.guild.id, boostedSince]
      );
      if (rows.length) return; // duplicate — skip

      // ── Mark as announced before sending (prevents races) ────────────────
      await db.query(
        `INSERT INTO boost_announcements (user_id, guild_id, boosted_since)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [newMember.id, newMember.guild.id, boostedSince]
      );

      // ── Resolve channel ───────────────────────────────────────────────────
      const channelId = process.env.BOOST_ANNOUNCEMENT_CHANNEL_ID;
      if (!channelId) {
        return console.warn('[Boost] BOOST_ANNOUNCEMENT_CHANNEL_ID is not set — skipping announcement.');
      }

      const channel = await newMember.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return console.warn(`[Boost] Channel ${channelId} not found — check BOOST_ANNOUNCEMENT_CHANNEL_ID.`);
      }

      // ── Count current boosters ────────────────────────────────────────────
      const totalBoosters = newMember.guild.premiumSubscriptionCount ?? 0;

      // ── Send announcement ─────────────────────────────────────────────────
      await channel.send({
        content: `<@${newMember.id}>`,   // ping so they see the shoutout
        embeds:  [boostEmbed(newMember, totalBoosters)],
      });

      console.log(`[Boost] Announced boost from ${newMember.user.tag} (${newMember.id})`);

    } catch (err) {
      console.error('[Boost] Error handling boost announcement:', err);
    }
  },
};
