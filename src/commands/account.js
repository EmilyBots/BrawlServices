// src/commands/account.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isStaff, isAdmin } = require('../utils/permissions');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('Account shop management')

    .addSubcommand(s => s
      .setName('list')
      .setDescription('Browse available accounts for purchase')
      .addStringOption(o => o.setName('rank').setDescription('Filter by rank').setRequired(false))
      .addNumberOption(o => o.setName('max_price').setDescription('Maximum price in EUR').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('view')
      .setDescription('View details of a specific account')
      .addStringOption(o => o.setName('account_id').setDescription('Account ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('add')
      .setDescription('[Staff] Add an account to the shop')
      .addNumberOption(o => o.setName('price').setDescription('Price in EUR').setRequired(true))
      .addStringOption(o => o.setName('rank').setDescription('Current rank').setRequired(true))
      .addIntegerOption(o => o.setName('brawlers').setDescription('Number of brawlers').setRequired(true))
      .addIntegerOption(o => o.setName('trophies').setDescription('Max trophies').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Additional details').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('remove')
      .setDescription('[Staff] Remove an account from the shop')
      .addStringOption(o => o.setName('account_id').setDescription('Account ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('sell')
      .setDescription('[Staff] Mark account as sold')
      .addStringOption(o => o.setName('account_id').setDescription('Account ID').setRequired(true))
      .addUserOption(o => o.setName('buyer').setDescription('Who bought it').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('edit')
      .setDescription('[Staff] Edit an account listing')
      .addStringOption(o => o.setName('account_id').setDescription('Account ID').setRequired(true))
      .addNumberOption(o => o.setName('price').setDescription('New price').setRequired(false))
      .addStringOption(o => o.setName('description').setDescription('New description').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('buy')
      .setDescription('Express interest in buying an account (opens ticket)')
      .addStringOption(o => o.setName('account_id').setDescription('Account ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('stats')
      .setDescription('[Staff] Account shop statistics')
    )

    .addSubcommand(s => s
      .setName('panel')
      .setDescription('[Staff] Send account shop panel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    try {
      if (sub === 'list') {
        const rank = interaction.options.getString('rank');
        const maxPrice = interaction.options.getNumber('max_price');
        let q = `SELECT * FROM accounts WHERE status='available'`;
        const params = [];
        if (rank) { params.push(`%${rank}%`); q += ` AND current_rank ILIKE $${params.length}`; }
        if (maxPrice) { params.push(maxPrice); q += ` AND price <= $${params.length}`; }
        q += ` ORDER BY price ASC LIMIT 15`;
        const { rows } = await db.query(q, params);

        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.ACCOUNT} Account Shop`)
          .setDescription(rows.length
            ? rows.map((a, i) =>
              `**${i+1}.** \`#${a.id.slice(0,8).toUpperCase()}\` — ${em.CROWN} **${a.current_rank || '?'}** | ${a.brawler_count} brawlers | ${(a.max_trophies||0).toLocaleString()} trophies | **€${Number(a.price).toFixed(2)}**\n> *${a.description?.slice(0,60) || 'No description'}*`
            ).join('\n\n')
            : '*No accounts available right now.*'
          )
          .setFooter({ text: `${em.CROWN} Brawl Services™ • Use /account buy <id> to purchase` });
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'view') {
        const id = interaction.options.getString('account_id');
        const { rows } = await db.query(`SELECT * FROM accounts WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Account not found.')] });
        const a = rows[0];
        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.ACCOUNT} Account #${id.slice(0,8).toUpperCase()}`)
          .addFields(
            { name: 'Rank',       value: a.current_rank || '?',           inline: true },
            { name: 'Brawlers',   value: String(a.brawler_count || '?'),   inline: true },
            { name: 'Trophies',   value: (a.max_trophies||0).toLocaleString(), inline: true },
            { name: 'Price',      value: `€${Number(a.price).toFixed(2)}`, inline: true },
            { name: 'Status',     value: a.status.toUpperCase(),           inline: true },
            { name: 'Description',value: a.description || '*None*',        inline: false },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'add') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = uuidv4();
        await db.query(
          `INSERT INTO accounts (id, seller_id, guild_id, price, current_rank, brawler_count, max_trophies, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, interaction.user.id, interaction.guild.id,
           interaction.options.getNumber('price'), interaction.options.getString('rank'),
           interaction.options.getInteger('brawlers'), interaction.options.getInteger('trophies'),
           interaction.options.getString('description') || '']
        );
        return interaction.editReply({ embeds: [success('Account Added', `Account \`#${id.slice(0,8).toUpperCase()}\` added to the shop!`)] });
      }

      if (sub === 'remove') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('account_id');
        await db.query(`UPDATE accounts SET status='removed' WHERE id=$1`, [id]);
        return interaction.editReply({ embeds: [success('Removed', `Account removed from shop.`)] });
      }

      if (sub === 'sell') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('account_id');
        const buyer = interaction.options.getUser('buyer');
        await db.query(`UPDATE accounts SET status='sold', buyer_id=$1, sold_at=NOW() WHERE id=$2`, [buyer?.id || null, id]);
        return interaction.editReply({ embeds: [success('Sold', `Account marked as sold${buyer ? ` to ${buyer}` : ''}.`)] });
      }

      if (sub === 'edit') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('account_id');
        const price = interaction.options.getNumber('price');
        const desc = interaction.options.getString('description');
        if (price) await db.query(`UPDATE accounts SET price=$1 WHERE id=$2`, [price, id]);
        if (desc) await db.query(`UPDATE accounts SET description=$1 WHERE id=$2`, [desc, id]);
        return interaction.editReply({ embeds: [success('Updated', `Account \`#${id.slice(0,8).toUpperCase()}\` updated.`)] });
      }

      if (sub === 'buy') {
        const id = interaction.options.getString('account_id');
        const { rows } = await db.query(`SELECT * FROM accounts WHERE id=$1 AND status='available'`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Account not found or already sold.')] });
        const { createTicket } = require('../utils/ticketManager');
        const ch = await createTicket(interaction.guild, interaction.user, 'account');
        await ch.send(`💰 **Purchase enquiry for Account \`#${id.slice(0,8).toUpperCase()}\`**\n**Rank:** ${rows[0].current_rank} | **Trophies:** ${rows[0].max_trophies} | **Price:** €${rows[0].price}`);
        return interaction.editReply({ embeds: [success('Ticket Opened', `A staff member will assist you in ${ch}!`)] });
      }

      if (sub === 'stats') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { rows: [stats] } = await db.query(
          `SELECT COUNT(*) FILTER(WHERE status='available') as available, COUNT(*) FILTER(WHERE status='sold') as sold, SUM(price) FILTER(WHERE status='sold') as revenue FROM accounts WHERE guild_id=$1`,
          [interaction.guild.id]
        );
        const embed = base(COLORS.INFO).setTitle(`${em.STATS} Account Shop Stats`)
          .addFields(
            { name: 'Available', value: stats.available || '0', inline: true },
            { name: 'Sold',      value: stats.sold || '0',      inline: true },
            { name: 'Revenue',   value: `€${parseFloat(stats.revenue||0).toFixed(2)}`, inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'panel') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { buyAccountPanel } = require('../panels');
        const ch = interaction.options.getChannel('channel') || interaction.channel;
        const { rows } = await db.query(`SELECT * FROM accounts WHERE status='available' ORDER BY price ASC LIMIT 8`);
        await ch.send(buyAccountPanel(rows));
        return interaction.editReply({ embeds: [success('Sent', `Account shop panel sent to ${ch}`)] });
      }

    } catch (err) {
      console.error('[account]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
