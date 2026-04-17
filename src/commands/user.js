// src/commands/user.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('User profile and settings')

    .addSubcommand(s => s.setName('profile').setDescription('View your Brawl Services profile')
      .addUserOption(o => o.setName('user').setDescription('User to view').setRequired(false))
    )
    .addSubcommand(s => s.setName('orders').setDescription('View your order history'))
    .addSubcommand(s => s.setName('vouches').setDescription('View vouches you have left'))
    .addSubcommand(s => s.setName('spending').setDescription('View your total spending'))
    .addSubcommand(s => s.setName('register').setDescription('Register your profile'))
    .addSubcommand(s => s.setName('notifications').setDescription('Toggle DM notifications')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable DM notifications').setRequired(true))
    )
    .addSubcommand(s => s.setName('rank').setDescription('Set your current in-game rank')
      .addStringOption(o => o.setName('rank').setDescription('Your current rank').setRequired(true)
        .addChoices(
          { name: 'Bronze', value: 'Bronze' }, { name: 'Silver', value: 'Silver' },
          { name: 'Gold', value: 'Gold' }, { name: 'Diamond', value: 'Diamond' },
          { name: 'Mythic', value: 'Mythic' }, { name: 'Legendary', value: 'Legendary' },
          { name: 'Masters', value: 'Masters' }, { name: 'Pro', value: 'Pro' },
        ))
    )
    .addSubcommand(s => s.setName('badges').setDescription('View your badges and achievements'))
    .addSubcommand(s => s.setName('referral').setDescription('View or generate your referral code'))
    .addSubcommand(s => s.setName('delete').setDescription('Delete your profile data (GDPR)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    try {
      if (sub === 'profile') {
        const target = interaction.options.getUser('user') || interaction.user;
        const [userRow, orderStats, vouchesSent] = await Promise.all([
          db.query(`SELECT * FROM users WHERE id=$1`, [target.id]),
          db.query(`SELECT COUNT(*) as total, SUM(price) as spent, COUNT(*) FILTER(WHERE status='completed') as done FROM orders WHERE user_id=$1`, [target.id]),
          db.query(`SELECT COUNT(*) as total, AVG(rating) as avg FROM vouches WHERE user_id=$1`, [target.id]),
        ]);
        const u = userRow.rows[0];
        const o = orderStats.rows[0];
        const v = vouchesSent.rows[0];

        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.PERSON} ${target.username}'s Profile`)
          .setThumbnail(target.displayAvatarURL())
          .addFields(
            { name: `${em.ORDER} Total Orders`,  value: o.total || '0',  inline: true },
            { name: `${em.CHECK} Completed`,     value: o.done || '0',   inline: true },
            { name: `${em.MONEY} Total Spent`,   value: `€${parseFloat(o.spent || 0).toFixed(2)}`, inline: true },
            { name: `${em.VOUCH} Vouches Left`,  value: v.total || '0',  inline: true },
            { name: `${em.STAR} Avg Rating`,     value: v.avg ? `${parseFloat(v.avg).toFixed(2)}/5` : 'N/A', inline: true },
            { name: `${em.BANNED} Banned`,       value: u?.banned ? '🔴 Yes' : '🟢 No', inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'orders') {
        const { rows } = await db.query(`SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [interaction.user.id]);
        const embed = base(COLORS.INFO).setTitle(`${em.ORDER} My Orders`)
          .setDescription(rows.length
            ? rows.map(o => `\`#${o.id.slice(0,8).toUpperCase()}\` ${o.service_type} | **€${o.price}** | ${o.status.toUpperCase()} | <t:${Math.floor(new Date(o.created_at).getTime()/1000)}:d>`).join('\n')
            : '*No orders yet. Use \`/order create\` to get started!*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'vouches') {
        const { rows } = await db.query(`SELECT * FROM vouches WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [interaction.user.id]);
        const embed = base(COLORS.INFO).setTitle(`${em.VOUCH} My Vouches`)
          .setDescription(rows.length
            ? rows.map(v => `${'⭐'.repeat(v.rating)} — *${v.comment.slice(0,80)}*`).join('\n')
            : '*No vouches submitted yet.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'spending') {
        const { rows: [s] } = await db.query(
          `SELECT SUM(price) FILTER(WHERE status='completed') as total, SUM(price) FILTER(WHERE status='completed' AND created_at > NOW()-INTERVAL '30 days') as month FROM orders WHERE user_id=$1`,
          [interaction.user.id]
        );
        const embed = base(COLORS.SUCCESS).setTitle(`${em.MONEY} My Spending`)
          .addFields(
            { name: 'All Time',   value: `€${parseFloat(s.total || 0).toFixed(2)}`,  inline: true },
            { name: 'This Month', value: `€${parseFloat(s.month || 0).toFixed(2)}`,  inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'register') {
        await db.query(
          `INSERT INTO users (id, guild_id, username) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET username=$3, updated_at=NOW()`,
          [interaction.user.id, interaction.guild.id, interaction.user.username]
        );
        return interaction.editReply({ embeds: [success('Registered', `Your profile has been registered! Use \`/user profile\` to view it.`)] });
      }

      if (sub === 'notifications') {
        const enabled = interaction.options.getBoolean('enabled');
        await db.query(
          `INSERT INTO users (id, guild_id, username, notes) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET notes=$4, updated_at=NOW()`,
          [interaction.user.id, interaction.guild.id, interaction.user.username, `dm_notifications:${enabled}`]
        );
        return interaction.editReply({ embeds: [success('Notifications', `DM notifications **${enabled ? 'enabled' : 'disabled'}**.`)] });
      }

      if (sub === 'rank') {
        const rank = interaction.options.getString('rank');
        await db.query(
          `INSERT INTO users (id, guild_id, username, notes) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET notes=CONCAT(COALESCE(notes,''), E'\nrank:', $4), updated_at=NOW()`,
          [interaction.user.id, interaction.guild.id, interaction.user.username, rank]
        );
        return interaction.editReply({ embeds: [success('Rank Set', `Your current rank has been set to **${rank}**.`)] });
      }

      if (sub === 'badges') {
        const { rows: [o] } = await db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='completed') as done FROM orders WHERE user_id=$1`, [interaction.user.id]);
        const badges = [];
        if (parseInt(o.done) >= 1)  badges.push('🥉 First Order');
        if (parseInt(o.done) >= 5)  badges.push('🥈 Regular Customer');
        if (parseInt(o.done) >= 10) badges.push('🥇 VIP Customer');
        if (parseInt(o.done) >= 25) badges.push('💎 Diamond Customer');
        const embed = base(COLORS.PRIMARY).setTitle(`🏅 My Badges`)
          .setDescription(badges.length ? badges.join('\n') : '*No badges yet. Complete orders to earn badges!*');
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'referral') {
        const code = Buffer.from(interaction.user.id).toString('base64').slice(0, 10).toUpperCase();
        return interaction.editReply({ embeds: [success('Referral Code', `Your referral code: \`${code}\`\nShare it with friends and earn rewards when they order!`)] });
      }

      if (sub === 'delete') {
        await db.query(`DELETE FROM users WHERE id=$1`, [interaction.user.id]);
        return interaction.editReply({ embeds: [success('Data Deleted', `Your profile data has been deleted as per GDPR request.\nNote: Order records may be retained for legal/financial compliance.`)] });
      }

    } catch (err) {
      console.error('[user]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
