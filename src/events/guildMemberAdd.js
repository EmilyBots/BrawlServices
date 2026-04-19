// src/events/guildMemberAdd.js
const { Events, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { COLORS } = require('../utils/constants');

module.exports = {
  name: Events.GuildMemberAdd,

  async execute(member) {
    const { guild } = member;

    // ── Invite tracking ───────────────────────────────────────────────────────
    let inviterUser = null;
    let usedCode = null;
    let inviterTotal = 0;

    try {
      // Fetch current invites and compare with cached
      const newInvites = await guild.invites.fetch();
      const { rows: cachedInvites } = await db.query(
        `SELECT * FROM invites WHERE guild_id=$1`, [guild.id]
      );

      // Find which invite was used (use count increased)
      for (const [code, invite] of newInvites) {
        const cached = cachedInvites.find(i => i.invite_code === code);
        if (cached && invite.uses > cached.uses) {
          usedCode = code;
          inviterUser = invite.inviter;

          // Update DB invite uses
          await db.query(
            `UPDATE invites SET uses=$1 WHERE invite_code=$2`,
            [invite.uses, code]
          );

          // Log the invite
          await db.query(
            `INSERT INTO invite_logs (guild_id, user_id, inviter_id, invite_code)
             VALUES ($1,$2,$3,$4)`,
            [guild.id, member.user.id, invite.inviter?.id || null, code]
          );

          // Get total invites for this inviter
          const { rows: [totals] } = await db.query(
            `SELECT COUNT(*) as total FROM invite_logs WHERE guild_id=$1 AND inviter_id=$2`,
            [guild.id, invite.inviter?.id]
          );
          inviterTotal = parseInt(totals?.total || 0);
          break;
        }
      }

      // Also check for new invites not yet cached
      for (const [code, invite] of newInvites) {
        const cached = cachedInvites.find(i => i.invite_code === code);
        if (!cached && invite.uses > 0) {
          usedCode = code;
          inviterUser = invite.inviter;
          await db.query(
            `INSERT INTO invites (invite_code, guild_id, inviter_id, uses) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [code, guild.id, invite.inviter?.id || 'unknown', invite.uses]
          );
          await db.query(
            `INSERT INTO invite_logs (guild_id, user_id, inviter_id, invite_code) VALUES ($1,$2,$3,$4)`,
            [guild.id, member.user.id, invite.inviter?.id || null, code]
          );
          const { rows: [totals] } = await db.query(
            `SELECT COUNT(*) as total FROM invite_logs WHERE guild_id=$1 AND inviter_id=$2`,
            [guild.id, invite.inviter?.id]
          );
          inviterTotal = parseInt(totals?.total || 0);
          break;
        }
      }

      // Sync all current invites to DB
      for (const [code, invite] of newInvites) {
        await db.query(
          `INSERT INTO invites (invite_code, guild_id, inviter_id, uses)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (invite_code) DO UPDATE SET uses=$4`,
          [code, guild.id, invite.inviter?.id || 'unknown', invite.uses]
        );
      }

    } catch (err) {
      console.error('[guildMemberAdd] Invite tracking error:', err.message);
    }

    // ── Welcome message ───────────────────────────────────────────────────────
    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
    if (!welcomeChannelId) return;

    const welcomeChannel = guild.channels.cache.get(welcomeChannelId);
    if (!welcomeChannel) return;

    try {
      // Get member count
      const memberCount = guild.memberCount;

      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`👋 Welcome to ${guild.name}!`)
        .setDescription(
          `Hey ${member}! Welcome to **${guild.name}** 🎉\n\n` +
          `You are our **${memberCount.toLocaleString()}${ordinal(memberCount)}** member!\n\n` +
          (inviterUser
            ? `📨 You were invited by **${inviterUser.username}** who now has **${inviterTotal}** invite${inviterTotal !== 1 ? 's' : ''}!`
            : `📨 Joined via invite link **${usedCode || 'unknown'}**`)
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `Brawl Services™ • ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` })
        .setTimestamp();

      await welcomeChannel.send({
        content: `${member}`,
        embeds: [embed],
        files: [{ attachment: 'assets/logo.png', name: 'logo.png' }],
      });

      // Assign auto-role if configured
      if (process.env.AUTO_ROLE_ID) {
        await member.roles.add(process.env.AUTO_ROLE_ID).catch(() => {});
      }

    } catch (err) {
      console.error('[guildMemberAdd] Welcome message error:', err.message);
    }
  },
};

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
