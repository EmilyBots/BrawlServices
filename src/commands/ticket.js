// src/commands/ticket.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error, info } = require('../utils/embeds');
const { isStaff, isAdmin } = require('../utils/permissions');
const { createTicket, closeTicket } = require('../utils/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system management')

    .addSubcommand(s => s
      .setName('open')
      .setDescription('Open a new support ticket')
      .addStringOption(o => o.setName('category').setDescription('Ticket category').setRequired(false)
        .addChoices(
          { name: '📦 Order Support', value: 'order' },
          { name: '💳 Payment Issue', value: 'payment' },
          { name: '🎓 Coaching',      value: 'coaching' },
          { name: '🎮 Account',       value: 'account' },
          { name: '🛡️ Report',        value: 'report' },
          { name: '❓ General',       value: 'general' },
        ))
      .addStringOption(o => o.setName('reason').setDescription('Briefly describe your issue').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('close')
      .setDescription('Close the current ticket')
      .addStringOption(o => o.setName('reason').setDescription('Reason for closing').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('claim')
      .setDescription('[Staff] Claim this ticket')
    )

    .addSubcommand(s => s
      .setName('unclaim')
      .setDescription('[Staff] Unclaim this ticket')
    )

    .addSubcommand(s => s
      .setName('add')
      .setDescription('[Staff] Add a user to the ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('remove')
      .setDescription('[Staff] Remove a user from the ticket')
      .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('rename')
      .setDescription('[Staff] Rename the ticket channel')
      .addStringOption(o => o.setName('name').setDescription('New channel name').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('list')
      .setDescription('[Staff] List all open tickets')
      .addStringOption(o => o.setName('category').setDescription('Filter by category').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('priority')
      .setDescription('[Staff] Set ticket priority')
      .addStringOption(o => o.setName('level').setDescription('Priority level').setRequired(true)
        .addChoices(
          { name: '🟢 Low',    value: 'low' },
          { name: '🟡 Normal', value: 'normal' },
          { name: '🔴 High',   value: 'high' },
          { name: '🚨 Urgent', value: 'urgent' },
        ))
    )

    .addSubcommand(s => s
      .setName('transcript')
      .setDescription('[Staff] Save a transcript of this ticket')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    try {
      // ── open ────────────────────────────────────────────────────────────
      if (sub === 'open') {
        const category = interaction.options.getString('category') || 'general';
        const reason = interaction.options.getString('reason') || '';

        // check if user already has open ticket
        const { rows: existing } = await db.query(
          `SELECT * FROM tickets WHERE user_id=$1 AND guild_id=$2 AND status='open' LIMIT 1`,
          [interaction.user.id, interaction.guild.id]
        );
        if (existing.length) {
          return interaction.editReply({ embeds: [error('Already Open', `You already have an open ticket: <#${existing[0].channel_id}>`)] });
        }

        const channel = await createTicket(interaction.guild, interaction.user, category);
        if (reason) await channel.send(`**Reason:** ${reason}`);

        return interaction.editReply({ embeds: [success('Ticket Opened', `Your ticket has been created: ${channel}`)] });
      }

      // ── close ────────────────────────────────────────────────────────────
      if (sub === 'close') {
        const { rows } = await db.query(`SELECT * FROM tickets WHERE channel_id=$1 AND status='open'`, [interaction.channel.id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not a Ticket', 'This channel is not an open ticket.')] });

        const ticket = rows[0];
        if (ticket.user_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Only the ticket owner or staff can close this.')] });

        const reason = interaction.options.getString('reason') || 'No reason provided';
        await interaction.editReply({ embeds: [success('Closing...', 'This ticket will be closed in 5 seconds.')] });
        await closeTicket(interaction.channel, interaction.user.toString(), reason);
      }

      // ── claim ─────────────────────────────────────────────────────────
      if (sub === 'claim') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { rows } = await db.query(`SELECT * FROM tickets WHERE channel_id=$1`, [interaction.channel.id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not a Ticket', 'This is not a ticket channel.')] });
        if (rows[0].claimed_by) return interaction.editReply({ embeds: [error('Already Claimed', `Claimed by <@${rows[0].claimed_by}>`)] });

        await db.query(`UPDATE tickets SET claimed_by=$1 WHERE channel_id=$2`, [interaction.user.id, interaction.channel.id]);
        await interaction.channel.send({ embeds: [info('Ticket Claimed', `${em.STAFF} This ticket has been claimed by ${interaction.user}`)] });
        return interaction.editReply({ embeds: [success('Claimed', 'You have claimed this ticket.')] });
      }

      // ── unclaim ───────────────────────────────────────────────────────
      if (sub === 'unclaim') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        await db.query(`UPDATE tickets SET claimed_by=NULL WHERE channel_id=$1`, [interaction.channel.id]);
        return interaction.editReply({ embeds: [success('Unclaimed', 'Ticket unclaimed.')] });
      }

      // ── add ────────────────────────────────────────────────────────────
      if (sub === 'add') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const user = interaction.options.getUser('user');
        await interaction.channel.permissionOverwrites.create(user.id, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
        });
        await interaction.channel.send({ embeds: [info('User Added', `${user} has been added to this ticket.`)] });
        return interaction.editReply({ embeds: [success('Added', `${user} added to ticket.`)] });
      }

      // ── remove ─────────────────────────────────────────────────────────
      if (sub === 'remove') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const user = interaction.options.getUser('user');
        await interaction.channel.permissionOverwrites.delete(user.id);
        return interaction.editReply({ embeds: [success('Removed', `${user} removed from ticket.`)] });
      }

      // ── rename ─────────────────────────────────────────────────────────
      if (sub === 'rename') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const name = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0,100);
        await interaction.channel.setName(name);
        return interaction.editReply({ embeds: [success('Renamed', `Channel renamed to **${name}**`)] });
      }

      // ── list ────────────────────────────────────────────────────────────
      if (sub === 'list') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const cat = interaction.options.getString('category');
        const { rows } = await db.query(
          cat
            ? `SELECT * FROM tickets WHERE guild_id=$1 AND status='open' AND category=$2 ORDER BY created_at DESC LIMIT 25`
            : `SELECT * FROM tickets WHERE guild_id=$1 AND status='open' ORDER BY created_at DESC LIMIT 25`,
          cat ? [interaction.guild.id, cat] : [interaction.guild.id]
        );
        const embed = base(COLORS.INFO)
          .setTitle(`${em.TICKET} Open Tickets (${rows.length})`)
          .setDescription(rows.length
            ? rows.map(t => `<#${t.channel_id}> — <@${t.user_id}> | ${t.category} | ${t.claimed_by ? `Claimed by <@${t.claimed_by}>` : 'Unclaimed'}`).join('\n')
            : '*No open tickets.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── priority ────────────────────────────────────────────────────────
      if (sub === 'priority') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const level = interaction.options.getString('level');
        await db.query(`UPDATE tickets SET priority=$1 WHERE channel_id=$2`, [level, interaction.channel.id]);
        const emoji = { low: '🟢', normal: '🟡', high: '🔴', urgent: '🚨' }[level];
        return interaction.editReply({ embeds: [success('Priority Set', `Ticket priority set to ${emoji} **${level.toUpperCase()}**`)] });
      }

      // ── transcript ──────────────────────────────────────────────────────
      if (sub === 'transcript') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const transcript = messages.reverse().map(m =>
          `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || '[embed/attachment]'}`
        ).join('\n');

        const buffer = Buffer.from(transcript, 'utf-8');
        return interaction.editReply({
          embeds: [success('Transcript Saved', 'Transcript attached below.')],
          files: [{ attachment: buffer, name: `transcript-${interaction.channel.name}.txt` }],
        });
      }

    } catch (err) {
      console.error('[ticket]', err);
      return interaction.editReply({ embeds: [error('Error', err.message || 'Something went wrong.')] });
    }
  },
};
