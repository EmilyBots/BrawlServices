// src/commands/vouch.js
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');
const { AttachmentBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Vouch system')

    .addSubcommand(s => s
      .setName('submit')
      .setDescription('Submit a vouch for a completed order')
      .addIntegerOption(o => o.setName('rating').setDescription('Rating 1-5').setRequired(true).setMinValue(1).setMaxValue(5))
      .addStringOption(o => o.setName('comment').setDescription('Your review').setRequired(true))
      .addStringOption(o => o.setName('order_id').setDescription('Order ID (optional)').setRequired(false))
      .addUserOption(o => o.setName('booster').setDescription('Booster who helped you').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('list')
      .setDescription('List recent vouches')
      .addIntegerOption(o => o.setName('limit').setDescription('How many to show (max 20)').setRequired(false).setMinValue(1).setMaxValue(20))
      .addUserOption(o => o.setName('booster').setDescription('Filter by booster').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('stats')
      .setDescription('View vouch statistics')
      .addUserOption(o => o.setName('booster').setDescription('Booster to check').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('verify')
      .setDescription('[Staff] Verify a vouch')
      .addStringOption(o => o.setName('vouch_id').setDescription('Vouch UUID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('delete')
      .setDescription('[Staff] Delete a vouch')
      .addStringOption(o => o.setName('vouch_id').setDescription('Vouch UUID').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('panel')
      .setDescription('[Staff] Send the vouch panel to a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to send to').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('leaderboard')
      .setDescription('Top boosters by vouch rating')
    )

    .addSubcommand(s => s
      .setName('view')
      .setDescription('View a specific vouch by ID')
      .addStringOption(o => o.setName('vouch_id').setDescription('Vouch UUID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('my')
      .setDescription('View vouches you have left')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: sub !== 'list' && sub !== 'leaderboard' && sub !== 'panel' });

    try {
      // ── submit ──────────────────────────────────────────────────────────
      if (sub === 'submit') {
        const rating = interaction.options.getInteger('rating');
        const comment = interaction.options.getString('comment');
        const orderId = interaction.options.getString('order_id');
        const booster = interaction.options.getUser('booster');

        // verify order if given
        if (orderId) {
          const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1 AND user_id=$2 AND status='completed'`, [orderId, interaction.user.id]);
          if (!rows.length) return interaction.editReply({ embeds: [error('Invalid Order', 'Order not found or not completed.')] });
        }

        const { rows: [vouch] } = await db.query(
          `INSERT INTO vouches (user_id, guild_id, booster_id, order_id, rating, comment) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [interaction.user.id, interaction.guild.id, booster?.id || null, orderId || null, rating, comment]
        );

        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
        const embed = success('Vouch Submitted!',
          `Thank you for your vouch, ${interaction.user}!\n\n` +
          `**Rating:** ${stars} (${rating}/5)\n` +
          `**Comment:** ${comment}\n` +
          (booster ? `**Booster:** <@${booster.id}>\n` : '') +
          `**ID:** \`${vouch.id.slice(0,8).toUpperCase()}\``
        );

        // post to vouch channel
        if (process.env.VOUCH_CHANNEL_ID) {
          const ch = interaction.guild.channels.cache.get(process.env.VOUCH_CHANNEL_ID);
          if (ch) {
            const pubEmbed = base(COLORS.PRIMARY)
              .setTitle(`${em.VOUCH} New Vouch ${stars}`)
              .setDescription(
                `**Customer:** ${interaction.user}\n` +
                `**Rating:** ${stars} **(${rating}/5)**\n` +
                (booster ? `**Booster:** <@${booster.id}>\n` : '') +
                `\n> *${comment}*`
              )
              .setThumbnail(interaction.user.displayAvatarURL());
            ch.send({ embeds: [pubEmbed] });
          }
        }

        return interaction.editReply({ embeds: [embed] });
      }

      // ── list ────────────────────────────────────────────────────────────
      if (sub === 'list') {
        const limit = interaction.options.getInteger('limit') || 10;
        const booster = interaction.options.getUser('booster');
        const { rows } = await db.query(
          booster
            ? `SELECT * FROM vouches WHERE guild_id=$1 AND booster_id=$2 ORDER BY created_at DESC LIMIT $3`
            : `SELECT * FROM vouches WHERE guild_id=$1 ORDER BY created_at DESC LIMIT $2`,
          booster ? [interaction.guild.id, booster.id, limit] : [interaction.guild.id, limit]
        );
        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.VOUCH} Recent Vouches`)
          .setDescription(rows.length
            ? rows.map(v => {
              const stars = '⭐'.repeat(v.rating);
              return `${stars} **${v.rating}/5** — <@${v.user_id}> ${v.booster_id ? `→ <@${v.booster_id}>` : ''}\n> *${v.comment.slice(0,100)}*`;
            }).join('\n\n')
            : '*No vouches yet.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── stats ───────────────────────────────────────────────────────────
      if (sub === 'stats') {
        const target = interaction.options.getUser('booster') || interaction.user;
        const { rows } = await db.query(
          `SELECT COUNT(*) as total, AVG(rating) as avg, MIN(rating) as min, MAX(rating) as max FROM vouches WHERE booster_id=$1`,
          [target.id]
        );
        const s = rows[0];
        const embed = base(COLORS.INFO)
          .setTitle(`${em.STATS} Vouch Stats — ${target.username}`)
          .addFields(
            { name: 'Total Vouches', value: s.total || '0', inline: true },
            { name: 'Average Rating', value: s.avg ? `${parseFloat(s.avg).toFixed(2)}/5` : 'N/A', inline: true },
            { name: 'Min / Max', value: `${s.min || '-'} / ${s.max || '-'}`, inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── verify ──────────────────────────────────────────────────────────
      if (sub === 'verify') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('vouch_id');
        await db.query(`UPDATE vouches SET verified=TRUE WHERE id=$1`, [id]);
        return interaction.editReply({ embeds: [success('Verified', `Vouch \`${id.slice(0,8).toUpperCase()}\` verified.`)] });
      }

      // ── delete ──────────────────────────────────────────────────────────
      if (sub === 'delete') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('vouch_id');
        await db.query(`DELETE FROM vouches WHERE id=$1`, [id]);
        return interaction.editReply({ embeds: [success('Deleted', `Vouch deleted.`)] });
      }

      // ── panel ────────────────────────────────────────────────────────────
      if (sub === 'panel') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { vouchPanel } = require('../panels');
        const ch = interaction.options.getChannel('channel') || interaction.channel;
        await ch.send(vouchPanel());
        return interaction.editReply({ embeds: [success('Panel Sent', `Vouch panel sent to ${ch}`)] });
      }

      // ── leaderboard ──────────────────────────────────────────────────────
      if (sub === 'leaderboard') {
        const { rows } = await db.query(
          `SELECT booster_id, COUNT(*) as total, AVG(rating) as avg FROM vouches WHERE booster_id IS NOT NULL AND guild_id=$1 GROUP BY booster_id ORDER BY avg DESC LIMIT 10`,
          [interaction.guild.id]
        );
        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.CROWN} Booster Leaderboard`)
          .setDescription(rows.length
            ? rows.map((r, i) => `**${i+1}.** <@${r.booster_id}> — ⭐ ${parseFloat(r.avg).toFixed(2)} avg (${r.total} vouches)`).join('\n')
            : '*No data yet.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── view ─────────────────────────────────────────────────────────────
      if (sub === 'view') {
        const id = interaction.options.getString('vouch_id');
        const { rows } = await db.query(`SELECT * FROM vouches WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Vouch not found.')] });
        const v = rows[0];
        const stars = '⭐'.repeat(v.rating);
        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.VOUCH} Vouch #${id.slice(0,8).toUpperCase()}`)
          .addFields(
            { name: 'Customer',   value: `<@${v.user_id}>`,                              inline: true },
            { name: 'Booster',    value: v.booster_id ? `<@${v.booster_id}>` : '*N/A*',  inline: true },
            { name: 'Rating',     value: `${stars} (${v.rating}/5)`,                      inline: true },
            { name: 'Comment',    value: v.comment,                                        inline: false },
            { name: 'Verified',   value: v.verified ? '✅ Yes' : '❌ No',                 inline: true },
            { name: 'Date',       value: `<t:${Math.floor(new Date(v.created_at).getTime()/1000)}:R>`, inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // ── my ───────────────────────────────────────────────────────────────
      if (sub === 'my') {
        const { rows } = await db.query(`SELECT * FROM vouches WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [interaction.user.id]);
        const embed = base(COLORS.INFO)
          .setTitle(`${em.VOUCH} Your Vouches`)
          .setDescription(rows.length
            ? rows.map(v => `${'⭐'.repeat(v.rating)} — *${v.comment.slice(0,80)}* — <t:${Math.floor(new Date(v.created_at).getTime()/1000)}:d>`).join('\n')
            : '*You have not submitted any vouches yet.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[vouch]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
