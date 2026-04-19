// src/commands/welcome.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isAdmin, isStaff } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Welcome system management')

    .addSubcommand(s => s
      .setName('test')
      .setDescription('[Admin] Test the welcome message for yourself')
    )
    .addSubcommand(s => s
      .setName('invites')
      .setDescription('Check your invite count')
      .addUserOption(o => o.setName('user').setDescription('User to check (staff only for others)').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('leaderboard')
      .setDescription('Top inviters in the server')
    )
    .addSubcommand(s => s
      .setName('resetinvites')
      .setDescription('[Admin] Reset invite count for a user')
      .addUserOption(o => o.setName('user').setDescription('User to reset').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('config')
      .setDescription('[Admin] Show current welcome config')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'test') {
      if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
      // Fire the welcome event manually
      const guildMemberAddEvent = require('../events/guildMemberAdd');
      await guildMemberAddEvent.execute(interaction.member);
      return interaction.editReply({ embeds: [success('Tested', 'Welcome message sent to the welcome channel!')] });
    }

    if (sub === 'invites') {
      const target = interaction.options.getUser('user');
      if (target && target.id !== interaction.user.id && !isStaff(interaction.member))
        return interaction.editReply({ embeds: [error('Access Denied', 'Staff only for other users.')] });
      const userId = target?.id || interaction.user.id;
      const { rows: [stats] } = await db.query(
        `SELECT COUNT(*) as total FROM invite_logs WHERE guild_id=$1 AND inviter_id=$2`,
        [interaction.guild.id, userId]
      );
      const { rows: recent } = await db.query(
        `SELECT user_id, created_at FROM invite_logs WHERE guild_id=$1 AND inviter_id=$2 ORDER BY created_at DESC LIMIT 5`,
        [interaction.guild.id, userId]
      );
      const embed = base(COLORS.INFO)
        .setTitle(`📨 Invite Stats — ${target?.username || interaction.user.username}`)
        .addFields(
          { name: 'Total Invites', value: stats?.total || '0', inline: true },
        )
        .setDescription(recent.length
          ? `**Recent invites:**\n` + recent.map(r => `<@${r.user_id}> — <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`).join('\n')
          : '*No invites tracked yet.*'
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'leaderboard') {
      const { rows } = await db.query(
        `SELECT inviter_id, COUNT(*) as total FROM invite_logs WHERE guild_id=$1 AND inviter_id IS NOT NULL GROUP BY inviter_id ORDER BY total DESC LIMIT 10`,
        [interaction.guild.id]
      );
      const embed = base(COLORS.PRIMARY).setTitle(`${em.CROWN} Invite Leaderboard`)
        .setDescription(rows.length
          ? rows.map((r, i) => `**${i+1}.** <@${r.inviter_id}> — **${r.total}** invite${r.total !== '1' ? 's' : ''}`).join('\n')
          : '*No invite data yet.*'
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'resetinvites') {
      if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
      const user = interaction.options.getUser('user');
      await db.query(`DELETE FROM invite_logs WHERE guild_id=$1 AND inviter_id=$2`, [interaction.guild.id, user.id]);
      return interaction.editReply({ embeds: [success('Reset', `Invite count for ${user} has been reset to 0.`)] });
    }

    if (sub === 'config') {
      if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
      const embed = base(COLORS.INFO).setTitle(`👋 Welcome Config`)
        .addFields(
          { name: 'Welcome Channel', value: process.env.WELCOME_CHANNEL_ID ? `<#${process.env.WELCOME_CHANNEL_ID}>` : '❌ Not set', inline: true },
          { name: 'Auto Role',       value: process.env.AUTO_ROLE_ID ? `<@&${process.env.AUTO_ROLE_ID}>` : '❌ Not set', inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
