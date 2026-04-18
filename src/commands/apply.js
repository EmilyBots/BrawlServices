// src/commands/apply.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isAdmin } = require('../utils/permissions');
const { applicationsMainPanel, applicationReviewPanel } = require('../panels/applications');
const { v4: uuidv4 } = require('uuid');

// Question sets per role
const QUESTIONS = {
  staff: [
    'What is your age and timezone?',
    'How many hours per week can you dedicate to staff duties?',
    'Do you have previous Discord moderation or staff experience? If yes, describe it.',
    'Why do you want to join Brawl Services™ as Staff?',
    'How would you handle a dispute between a customer and a booster?',
  ],
  booster: [
    'What is your current rank and highest rank reached?',
    'How many hours per week can you dedicate to boosting?',
    'Do you have previous boosting experience? If yes, where?',
    'What brawlers/modes are you best at?',
    'Why do you want to boost for Brawl Services™?',
  ],
  coach: [
    'What is your current rank and highest rank reached?',
    'Do you have previous coaching or teaching experience?',
    'How many sessions per week can you take on?',
    'What is your coaching style and approach?',
    'Why do you want to coach for Brawl Services™?',
  ],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Application management')

    .addSubcommand(s => s
      .setName('panel')
      .setDescription('[Admin] Send the applications panel to a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to send to').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('staff')
      .setDescription('Apply for a Staff position')
    )

    .addSubcommand(s => s
      .setName('booster')
      .setDescription('Apply for a Booster position')
    )

    .addSubcommand(s => s
      .setName('coach')
      .setDescription('Apply for a Coach position')
    )

    .addSubcommand(s => s
      .setName('list')
      .setDescription('[Admin] List applications')
      .addStringOption(o => o.setName('status').setDescription('Filter by status').setRequired(false)
        .addChoices(
          { name: 'Pending',  value: 'pending'  },
          { name: 'Accepted', value: 'accepted' },
          { name: 'Declined', value: 'declined' },
        ))
      .addStringOption(o => o.setName('type').setDescription('Filter by type').setRequired(false)
        .addChoices(
          { name: 'Staff',   value: 'staff'   },
          { name: 'Booster', value: 'booster' },
          { name: 'Coach',   value: 'coach'   },
        ))
    )

    .addSubcommand(s => s
      .setName('view')
      .setDescription('[Admin] View a specific application')
      .addStringOption(o => o.setName('id').setDescription('Application ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('withdraw')
      .setDescription('Withdraw your pending application')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();

    // ── panel ─────────────────────────────────────────────────────────────
    if (sub === 'panel') {
      await interaction.deferReply({ ephemeral: true });
      if (!isAdmin(interaction.member))
        return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
      const ch = interaction.options.getChannel('channel') || interaction.channel;
      await ch.send(applicationsMainPanel());
      return interaction.editReply({ embeds: [success('Panel Sent', `Applications panel sent to ${ch}`)] });
    }

    // ── Apply commands — show modal ────────────────────────────────────────
    if (sub === 'staff' || sub === 'booster' || sub === 'coach') {
      // Check for existing pending application
      const { rows: existing } = await db.query(
        `SELECT * FROM applications WHERE user_id=$1 AND guild_id=$2 AND type=$3 AND status='pending'`,
        [interaction.user.id, interaction.guild.id, sub]
      );
      if (existing.length) {
        return interaction.reply({
          embeds: [error('Already Applied', `You already have a pending **${sub}** application!\nYou'll be notified of the decision via DM.`)],
          ephemeral: true,
        });
      }

      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const questions = QUESTIONS[sub];
      const modal = new ModalBuilder()
        .setCustomId(`app_modal_${sub}`)
        .setTitle(`${sub.charAt(0).toUpperCase() + sub.slice(1)} Application`);

      // Discord modals allow max 5 inputs
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('q1').setLabel(questions[0].slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('q2').setLabel(questions[1].slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('q3').setLabel(questions[2].slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('q4').setLabel(questions[3].slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('q5').setLabel(questions[4].slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
        ),
      );

      return interaction.showModal(modal);
    }

    // ── list ──────────────────────────────────────────────────────────────
    if (sub === 'list') {
      await interaction.deferReply({ ephemeral: true });
      if (!isAdmin(interaction.member))
        return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });

      const status = interaction.options.getString('status');
      const type   = interaction.options.getString('type');

      let query = `SELECT * FROM applications WHERE guild_id=$1`;
      const params = [interaction.guild.id];
      if (status) { params.push(status); query += ` AND status=$${params.length}`; }
      if (type)   { params.push(type);   query += ` AND type=$${params.length}`; }
      query += ` ORDER BY created_at DESC LIMIT 20`;

      const { rows } = await db.query(query, params);
      const statusEmoji = { pending: '🟡', accepted: '🟢', declined: '🔴' };

      const embed = base(COLORS.INFO)
        .setTitle(`${em.STAFF} Applications`)
        .setDescription(rows.length
          ? rows.map(a =>
            `${statusEmoji[a.status] || '⚪'} \`#${a.id.slice(0,8).toUpperCase()}\` <@${a.user_id}> — **${a.type.toUpperCase()}** | <t:${Math.floor(new Date(a.created_at).getTime()/1000)}:R>`
          ).join('\n')
          : '*No applications found.*'
        );
      return interaction.editReply({ embeds: [embed] });
    }

    // ── view ──────────────────────────────────────────────────────────────
    if (sub === 'view') {
      await interaction.deferReply({ ephemeral: true });
      if (!isAdmin(interaction.member))
        return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });

      const id = interaction.options.getString('id');
      const { rows } = await db.query(`SELECT * FROM applications WHERE id=$1 OR id::text ILIKE $2`, [
        id.length === 36 ? id : '00000000-0000-0000-0000-000000000000',
        `%${id.toUpperCase()}%`,
      ]);
      if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Application not found.')] });

      const app = rows[0];
      const answers = app.answers || {};
      const qaLines = Object.entries(answers).map(([q, a]) => `**${q}**\n> ${a}`).join('\n\n');

      const embed = base(COLORS.INFO)
        .setTitle(`📋 Application \`#${app.id.slice(0,8).toUpperCase()}\``)
        .setDescription(
          `**Applicant:** <@${app.user_id}>\n` +
          `**Type:** ${app.type.toUpperCase()}\n` +
          `**Status:** ${app.status.toUpperCase()}\n` +
          `**Submitted:** <t:${Math.floor(new Date(app.created_at).getTime()/1000)}:F>\n\n` +
          `## Answers\n${qaLines}`
        );
      return interaction.editReply({ embeds: [embed] });
    }

    // ── withdraw ──────────────────────────────────────────────────────────
    if (sub === 'withdraw') {
      await interaction.deferReply({ ephemeral: true });
      const { rows } = await db.query(
        `UPDATE applications SET status='withdrawn' WHERE user_id=$1 AND guild_id=$2 AND status='pending' RETURNING *`,
        [interaction.user.id, interaction.guild.id]
      );
      if (!rows.length) return interaction.editReply({ embeds: [error('No Application', 'You have no pending applications to withdraw.')] });
      return interaction.editReply({ embeds: [success('Withdrawn', `Your **${rows[0].type}** application has been withdrawn.`)] });
    }
  },
};
