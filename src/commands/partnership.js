// src/commands/partnership.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isAdmin, isStaff } = require('../utils/permissions');
const { partnershipPanel } = require('../panels/partnership');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('partnership')
    .setDescription('Partnership management')

    .addSubcommand(s => s
      .setName('panel')
      .setDescription('[Admin] Send the partnership panel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to send to').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('list')
      .setDescription('[Staff] List partnership requests')
      .addStringOption(o => o.setName('status').setDescription('Filter by status').setRequired(false)
        .addChoices(
          { name: 'Pending',  value: 'pending'  },
          { name: 'Accepted', value: 'accepted' },
          { name: 'Declined', value: 'declined' },
        ))
    )
    .addSubcommand(s => s
      .setName('view')
      .setDescription('[Staff] View a partnership request')
      .addStringOption(o => o.setName('id').setDescription('Partnership ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'panel') {
      if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
      const ch = interaction.options.getChannel('channel') || interaction.channel;
      await ch.send(partnershipPanel());
      return interaction.editReply({ embeds: [success('Sent', `Partnership panel sent to ${ch}`)] });
    }

    if (sub === 'list') {
      if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
      const status = interaction.options.getString('status');
      const { rows } = await db.query(
        status
          ? `SELECT * FROM partnerships WHERE guild_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT 20`
          : `SELECT * FROM partnerships WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 20`,
        status ? [interaction.guild.id, status] : [interaction.guild.id]
      );
      const statusEmoji = { pending: '🟡', accepted: '🟢', declined: '🔴' };
      const embed = base(COLORS.INFO).setTitle(`🤝 Partnership Requests`)
        .setDescription(rows.length
          ? rows.map(p => `${statusEmoji[p.status] || '⚪'} \`#${p.id.slice(0,8).toUpperCase()}\` <@${p.user_id}> | ${p.status.toUpperCase()} | <t:${Math.floor(new Date(p.created_at).getTime()/1000)}:R>`).join('\n')
          : '*No partnership requests.*'
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'view') {
      if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
      const id = interaction.options.getString('id');
      const { rows } = await db.query(`SELECT * FROM partnerships WHERE id=$1`, [id]);
      if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Partnership request not found.')] });
      const p = rows[0];
      const answers = p.answers || {};
      const qaLines = Object.entries(answers).map(([q, a]) => `**${q}**\n> ${a}`).join('\n\n');
      const embed = base(COLORS.INFO).setTitle(`🤝 Partnership #${p.id.slice(0,8).toUpperCase()}`)
        .setDescription(`**From:** <@${p.user_id}>\n**Status:** ${p.status.toUpperCase()}\n\n${qaLines}`);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
