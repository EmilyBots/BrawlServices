// src/commands/coaching.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis, PRICING } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isStaff, isBooster } = require('../utils/permissions');
const { createTicket } = require('../utils/ticketManager');
const { claimCoachingPanel, paymentPanel } = require('../panels');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coaching')
    .setDescription('Coaching session management')

    .addSubcommand(s => s
      .setName('book')
      .setDescription('Book a coaching session')
      .addStringOption(o => o.setName('type').setDescription('Session type').setRequired(true)
        .addChoices(
          { name: '🟢 Basic (1h) – €10',    value: 'basic' },
          { name: '🔵 Advanced (2h) – €18',  value: 'advanced' },
          { name: '👑 Pro (3h) – €25',       value: 'pro' },
        ))
      .addStringOption(o => o.setName('goals').setDescription('What do you want to improve?').setRequired(false))
      .addStringOption(o => o.setName('brawler').setDescription('Preferred brawler to focus on').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('list')
      .setDescription('[Staff] List coaching sessions')
      .addStringOption(o => o.setName('status').setDescription('Filter by status').setRequired(false)
        .addChoices(
          { name: 'Pending',     value: 'pending' },
          { name: 'In Progress', value: 'in_progress' },
          { name: 'Completed',   value: 'completed' },
          { name: 'Cancelled',   value: 'cancelled' },
        ))
    )

    .addSubcommand(s => s
      .setName('claim')
      .setDescription('[Coach] Claim a coaching session')
      .addStringOption(o => o.setName('session_id').setDescription('Session ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('complete')
      .setDescription('[Coach] Mark session as complete')
      .addStringOption(o => o.setName('session_id').setDescription('Session ID').setRequired(true))
      .addStringOption(o => o.setName('notes').setDescription('Post-session notes').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('cancel')
      .setDescription('Cancel a coaching session')
      .addStringOption(o => o.setName('session_id').setDescription('Session ID').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('schedule')
      .setDescription('[Coach] Schedule a session time')
      .addStringOption(o => o.setName('session_id').setDescription('Session ID').setRequired(true))
      .addStringOption(o => o.setName('datetime').setDescription('Date/time (e.g. 2024-12-25 18:00)').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('view')
      .setDescription('View a coaching session')
      .addStringOption(o => o.setName('session_id').setDescription('Session ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('my')
      .setDescription('View your coaching sessions')
    )

    .addSubcommand(s => s
      .setName('coaches')
      .setDescription('List available coaches')
    )

    .addSubcommand(s => s
      .setName('pricing')
      .setDescription('View coaching pricing')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    try {
      // ── book ─────────────────────────────────────────────────────────
      if (sub === 'book') {
        const type = interaction.options.getString('type');
        const goals = interaction.options.getString('goals') || '';
        const brawler = interaction.options.getString('brawler') || '';
        const pricing = PRICING.coaching[type];

        const sessionId = uuidv4();
        await db.query(
          `INSERT INTO coaching_sessions (id, user_id, guild_id, session_type, duration_hours, price, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [sessionId, interaction.user.id, interaction.guild.id, type, pricing.label.match(/\d+h/)?.[0]?.replace('h','') || 1, pricing.price,
           [goals, brawler].filter(Boolean).join(' | ')]
        );

        const ticketChannel = await createTicket(interaction.guild, interaction.user, 'coaching', null);
        await db.query(`UPDATE coaching_sessions SET ticket_channel_id=$1 WHERE id=$2`, [ticketChannel.id, sessionId]);

        // send to coaching/order log
        if (process.env.ORDER_LOG_CHANNEL_ID) {
          const logCh = interaction.guild.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
          if (logCh) {
            const { rows: [s] } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [sessionId]);
            logCh.send(claimCoachingPanel(s));
          }
        }

        await ticketChannel.send(paymentPanel(sessionId, pricing.price, `Coaching – ${pricing.label}`));

        return interaction.editReply({ embeds: [success('Session Booked!',
          `Your coaching session has been booked!\n\n` +
          `**Type:** ${pricing.label}\n` +
          `**Price:** €${pricing.price}\n` +
          `**Goals:** ${goals || 'Not specified'}\n\n` +
          `${em.TICKET} Your ticket: ${ticketChannel}`
        )] });
      }

      // ── list ─────────────────────────────────────────────────────────
      if (sub === 'list') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const status = interaction.options.getString('status');
        const { rows } = await db.query(
          status
            ? `SELECT * FROM coaching_sessions WHERE guild_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT 20`
            : `SELECT * FROM coaching_sessions WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 20`,
          status ? [interaction.guild.id, status] : [interaction.guild.id]
        );
        const embed = base(COLORS.INFO)
          .setTitle(`${em.COACHING} Coaching Sessions`)
          .setDescription(rows.length
            ? rows.map(s => `**#${s.id.slice(0,8).toUpperCase()}** <@${s.user_id}> | ${s.session_type} | €${s.price} | ${s.status.toUpperCase()}`).join('\n')
            : '*No sessions found.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── claim ────────────────────────────────────────────────────────
      if (sub === 'claim') {
        if (!isBooster(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Coaches only.')] });
        const id = interaction.options.getString('session_id');
        const { rows } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Session not found.')] });
        if (rows[0].coach_id) return interaction.editReply({ embeds: [error('Already Claimed', `Already claimed by <@${rows[0].coach_id}>`)] });

        await db.query(`UPDATE coaching_sessions SET coach_id=$1, status='in_progress' WHERE id=$2`, [interaction.user.id, id]);
        return interaction.editReply({ embeds: [success('Claimed', `You have claimed session \`#${id.slice(0,8).toUpperCase()}\``)] });
      }

      // ── complete ──────────────────────────────────────────────────────
      if (sub === 'complete') {
        if (!isBooster(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Coaches only.')] });
        const id = interaction.options.getString('session_id');
        const notes = interaction.options.getString('notes') || '';
        await db.query(`UPDATE coaching_sessions SET status='completed', notes=COALESCE(NULLIF($1,''), notes) WHERE id=$2`, [notes, id]);
        return interaction.editReply({ embeds: [success('Session Completed', `Session \`#${id.slice(0,8).toUpperCase()}\` marked complete!`)] });
      }

      // ── cancel ────────────────────────────────────────────────────────
      if (sub === 'cancel') {
        const id = interaction.options.getString('session_id');
        const reason = interaction.options.getString('reason') || '';
        const { rows } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Session not found.')] });
        if (rows[0].user_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Not your session.')] });

        await db.query(`UPDATE coaching_sessions SET status='cancelled' WHERE id=$1`, [id]);
        return interaction.editReply({ embeds: [success('Cancelled', `Session cancelled.${reason ? ` Reason: ${reason}` : ''}`)] });
      }

      // ── schedule ──────────────────────────────────────────────────────
      if (sub === 'schedule') {
        if (!isBooster(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Coaches only.')] });
        const id = interaction.options.getString('session_id');
        const dt = interaction.options.getString('datetime');
        const date = new Date(dt);
        if (isNaN(date.getTime())) return interaction.editReply({ embeds: [error('Invalid Date', 'Please use format: YYYY-MM-DD HH:MM')] });

        await db.query(`UPDATE coaching_sessions SET scheduled_at=$1 WHERE id=$2`, [date.toISOString(), id]);

        const { rows } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [id]);
        if (rows[0]?.ticket_channel_id) {
          const ch = interaction.guild.channels.cache.get(rows[0].ticket_channel_id);
          if (ch) ch.send(`📅 **Session scheduled for** <t:${Math.floor(date.getTime()/1000)}:F> by <@${interaction.user.id}>`);
        }
        return interaction.editReply({ embeds: [success('Scheduled', `Session scheduled for <t:${Math.floor(date.getTime()/1000)}:F>`)] });
      }

      // ── view ─────────────────────────────────────────────────────────
      if (sub === 'view') {
        const id = interaction.options.getString('session_id');
        const { rows } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Session not found.')] });
        const s = rows[0];
        const embed = base(COLORS.INFO)
          .setTitle(`${em.COACHING} Session #${id.slice(0,8).toUpperCase()}`)
          .addFields(
            { name: 'Student',   value: `<@${s.user_id}>`,                                     inline: true },
            { name: 'Coach',     value: s.coach_id ? `<@${s.coach_id}>` : '*Unassigned*',       inline: true },
            { name: 'Type',      value: s.session_type,                                          inline: true },
            { name: 'Duration',  value: `${s.duration_hours}h`,                                  inline: true },
            { name: 'Price',     value: `€${s.price}`,                                           inline: true },
            { name: 'Status',    value: s.status.toUpperCase(),                                   inline: true },
            { name: 'Scheduled', value: s.scheduled_at ? `<t:${Math.floor(new Date(s.scheduled_at).getTime()/1000)}:F>` : '*Not set*', inline: false },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── my ───────────────────────────────────────────────────────────
      if (sub === 'my') {
        const { rows } = await db.query(`SELECT * FROM coaching_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [interaction.user.id]);
        const embed = base(COLORS.INFO).setTitle(`${em.COACHING} Your Sessions`)
          .setDescription(rows.length
            ? rows.map(s => `**#${s.id.slice(0,8).toUpperCase()}** ${s.session_type} | €${s.price} | ${s.status.toUpperCase()}`).join('\n')
            : '*No sessions yet.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── coaches ───────────────────────────────────────────────────────
      if (sub === 'coaches') {
        const { rows } = await db.query(
          `SELECT coach_id, COUNT(*) as sessions, AVG(v.rating) as avg_rating FROM coaching_sessions cs LEFT JOIN vouches v ON v.booster_id=cs.coach_id WHERE cs.status='completed' AND cs.guild_id=$1 GROUP BY coach_id`,
          [interaction.guild.id]
        );
        const embed = base(COLORS.INFO).setTitle(`${em.COACHING} Available Coaches`)
          .setDescription(rows.length
            ? rows.map((c,i) => `**${i+1}.** <@${c.coach_id}> — ${c.sessions} sessions | ⭐ ${c.avg_rating ? parseFloat(c.avg_rating).toFixed(1) : 'N/A'}`).join('\n')
            : '*No coaches data yet.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── pricing ───────────────────────────────────────────────────────
      if (sub === 'pricing') {
        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.COACHING} Coaching Prices`)
          .setDescription(
            `${em.STAR} **Basic Session (1h)** — €10\n` +
            `${em.STAR}${em.STAR} **Advanced Session (2h)** — €18\n` +
            `${em.STAR}${em.STAR}${em.STAR} **Pro Session (3h)** — €25\n\n` +
            `> All sessions include post-session feedback & replay review.`
          );
        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[coaching]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
