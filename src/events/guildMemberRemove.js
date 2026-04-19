// src/events/guildMemberRemove.js
const { Events, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
  name: Events.GuildMemberRemove,

  async execute(member) {
    const { guild } = member;
    const leaveChannelId = process.env.WELCOME_CHANNEL_ID;
    if (!leaveChannelId) return;

    const ch = guild.channels.cache.get(leaveChannelId);
    if (!ch) return;

    try {
      // ── Invite lookup ───────────────────────────────────────────────────────
      let inviteInfo = '';

      try {
        // Find which invite this member used from logs
        const { rows: [log] } = await db.query(
          `SELECT invite_code, inviter_id FROM invite_logs
           WHERE guild_id=$1 AND user_id=$2
           ORDER BY joined_at DESC LIMIT 1`,
          [guild.id, member.user.id]
        );

        if (log) {
          const { invite_code: code, inviter_id: inviterId } = log;

          // Get inviter's current total invites
          const { rows: [totals] } = await db.query(
            `SELECT COUNT(*) as total FROM invite_logs
             WHERE guild_id=$1 AND inviter_id=$2`,
            [guild.id, inviterId]
          );
          const inviterTotal = parseInt(totals?.total || 0);

          // Try to fetch the inviter user for display
          let inviterTag = `<@${inviterId}>`;
          try {
            const inviterUser = await member.client.users.fetch(inviterId);
            inviterTag = `**${inviterUser.username}**`;
          } catch {}

          inviteInfo = `\n📨 Invited by ${inviterTag} via \`${code}\` — they now have **${inviterTotal}** invite${inviterTotal !== 1 ? 's' : ''}`;

          // ── Auto-delete invite if single-use ────────────────────────────────
          try {
            const guildInvites = await guild.invites.fetch();
            const invite = guildInvites.get(code);

            if (invite && invite.maxUses === 1) {
              await invite.delete(`Auto-removed: single-use invite, invitee ${member.user.username} left`);
              inviteInfo += '\n🗑️ Single-use invite auto-deleted.';
            }
          } catch {}

          // Clean up invite_logs entry for this member
          await db.query(
            `DELETE FROM invite_logs WHERE guild_id=$1 AND user_id=$2`,
            [guild.id, member.user.id]
          );
        }

      } catch (err) {
        console.error('[guildMemberRemove] Invite lookup error:', err.message);
      }

      // ── Leave embed ─────────────────────────────────────────────────────────
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(
          `👋 **${member.user.username}** has left the server.\n` +
          `We now have **${guild.memberCount}** members.` +
          inviteInfo
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({
          text: `Brawl Services™ • ${new Date().toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}`,
        })
        .setTimestamp();

      await ch.send({ embeds: [embed] });

    } catch (err) {
      console.error('[guildMemberRemove] Error:', err.message);
    }
  },
};
