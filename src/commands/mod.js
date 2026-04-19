// src/commands/mod.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isStaff, isAdmin } = require('../utils/permissions');
const { logger } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation commands')

    .addSubcommand(s => s
      .setName('warn')
      .setDescription('Warn a user')
      .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('mute')
      .setDescription('Timeout a user')
      .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
      .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('unmute')
      .setDescription('Remove timeout from a user')
      .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('kick')
      .setDescription('Kick a user')
      .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('ban')
      .setDescription('Ban a user')
      .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
      .addIntegerOption(o => o.setName('days').setDescription('Delete messages from last N days (0-7)').setRequired(false).setMinValue(0).setMaxValue(7))
    )
    .addSubcommand(s => s
      .setName('unban')
      .setDescription('Unban a user by ID')
      .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('warnings')
      .setDescription('View warnings for a user')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('clearwarnings')
      .setDescription('Clear all warnings for a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('blacklist')
      .setDescription('Blacklist a user from services')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('unblacklist')
      .setDescription('Remove a user from the blacklist')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    if (!isStaff(interaction.member))
      return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });

    try {
      if (sub === 'warn') {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.editReply({ embeds: [error('Not Found', 'User not in server.')] });

        await db.query(
          `INSERT INTO staff_actions (staff_id, action, target_id, details) VALUES ($1,'warn',$2,$3)`,
          [interaction.user.id, target.id, JSON.stringify({ reason })]
        );

        try { await target.send({ embeds: [base(COLORS.WARNING).setTitle(`⚠️ Warning — Brawl Services™`).setDescription(`You have received a warning.\n**Reason:** ${reason}`)] }); } catch {}

        logger.warn(interaction.client, interaction.guild.id, target, interaction.user, reason);
        return interaction.editReply({ embeds: [success('Warned', `${target} has been warned.\n**Reason:** ${reason}`)] });
      }

      if (sub === 'mute') {
        const target = interaction.options.getUser('user');
        const minutes = interaction.options.getInteger('minutes');
        const reason = interaction.options.getString('reason') || 'No reason';
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.editReply({ embeds: [error('Not Found', 'User not in server.')] });

        await member.timeout(minutes * 60 * 1000, reason);

        const duration = minutes >= 1440 ? `${Math.floor(minutes/1440)}d` : minutes >= 60 ? `${Math.floor(minutes/60)}h` : `${minutes}m`;
        try { await target.send({ embeds: [base(COLORS.ERROR).setTitle(`🔇 You have been muted`).setDescription(`**Duration:** ${duration}\n**Reason:** ${reason}`)] }); } catch {}

        logger.mute(interaction.client, interaction.guild.id, target, interaction.user, duration, reason);
        return interaction.editReply({ embeds: [success('Muted', `${target} muted for **${duration}**.\n**Reason:** ${reason}`)] });
      }

      if (sub === 'unmute') {
        const target = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.editReply({ embeds: [error('Not Found', 'User not in server.')] });
        await member.timeout(null);
        logger.unmute(interaction.client, interaction.guild.id, target, interaction.user);
        return interaction.editReply({ embeds: [success('Unmuted', `${target} has been unmuted.`)] });
      }

      if (sub === 'kick') {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason';
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.editReply({ embeds: [error('Not Found', 'User not in server.')] });
        try { await target.send({ embeds: [base(COLORS.ERROR).setTitle(`👢 Kicked from ${interaction.guild.name}`).setDescription(`**Reason:** ${reason}`)] }); } catch {}
        await member.kick(reason);
        logger.kick(interaction.client, interaction.guild.id, target, interaction.user, reason);
        return interaction.editReply({ embeds: [success('Kicked', `${target} has been kicked.\n**Reason:** ${reason}`)] });
      }

      if (sub === 'ban') {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason';
        const days = interaction.options.getInteger('days') || 0;
        try { await target.send({ embeds: [base(COLORS.ERROR).setTitle(`🔨 Banned from ${interaction.guild.name}`).setDescription(`**Reason:** ${reason}`)] }); } catch {}
        await interaction.guild.members.ban(target.id, { reason, deleteMessageDays: days });
        await db.query(`INSERT INTO users (id, guild_id, username, banned, ban_reason) VALUES ($1,$2,$3,TRUE,$4) ON CONFLICT (id) DO UPDATE SET banned=TRUE, ban_reason=$4`, [target.id, interaction.guild.id, target.username, reason]);
        logger.ban(interaction.client, interaction.guild.id, target, interaction.user, reason);
        return interaction.editReply({ embeds: [success('Banned', `${target} has been banned.\n**Reason:** ${reason}`)] });
      }

      if (sub === 'unban') {
        const userId = interaction.options.getString('user_id');
        await interaction.guild.members.unban(userId).catch(() => {});
        await db.query(`UPDATE users SET banned=FALSE, ban_reason=NULL WHERE id=$1`, [userId]);
        logger.unban(interaction.client, interaction.guild.id, `<@${userId}>`, interaction.user);
        return interaction.editReply({ embeds: [success('Unbanned', `<@${userId}> has been unbanned.`)] });
      }

      if (sub === 'warnings') {
        const target = interaction.options.getUser('user');
        const { rows } = await db.query(`SELECT * FROM staff_actions WHERE target_id=$1 AND action='warn' ORDER BY created_at DESC`, [target.id]);
        const embed = base(COLORS.WARNING).setTitle(`⚠️ Warnings — ${target.username}`)
          .setDescription(rows.length
            ? rows.map((w, i) => `**${i+1}.** <@${w.staff_id}> — *${JSON.parse(w.details || '{}').reason || 'No reason'}* — <t:${Math.floor(new Date(w.created_at).getTime()/1000)}:R>`).join('\n')
            : '*No warnings found.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'clearwarnings') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const target = interaction.options.getUser('user');
        await db.query(`DELETE FROM staff_actions WHERE target_id=$1 AND action='warn'`, [target.id]);
        return interaction.editReply({ embeds: [success('Cleared', `All warnings for ${target} have been cleared.`)] });
      }

      if (sub === 'blacklist') {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        await db.query(`INSERT INTO users (id, guild_id, username, banned, ban_reason) VALUES ($1,$2,$3,TRUE,$4) ON CONFLICT (id) DO UPDATE SET banned=TRUE, ban_reason=$4, updated_at=NOW()`, [target.id, interaction.guild.id, target.username, reason]);
        logger.ban(interaction.client, interaction.guild.id, target, interaction.user, `[BLACKLIST] ${reason}`);
        return interaction.editReply({ embeds: [success('Blacklisted', `${target} has been blacklisted from services.\n**Reason:** ${reason}`)] });
      }

      if (sub === 'unblacklist') {
        const target = interaction.options.getUser('user');
        await db.query(`UPDATE users SET banned=FALSE, ban_reason=NULL, updated_at=NOW() WHERE id=$1`, [target.id]);
        return interaction.editReply({ embeds: [success('Removed', `${target} has been removed from the blacklist.`)] });
      }

    } catch (err) {
      console.error('[mod]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
