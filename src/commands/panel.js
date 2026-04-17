// src/commands/panel.js
const { SlashCommandBuilder } = require('discord.js');
const { isAdmin, isStaff } = require('../utils/permissions');
const { success, error } = require('../utils/embeds');
const panels = require('../panels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Send interactive panels to channels')

    .addSubcommand(s => s
      .setName('main')
      .setDescription('[Admin] Send the main menu panel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('prices')
      .setDescription('[Staff] Send the prices panel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('order')
      .setDescription('[Staff] Send the order panel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('ticket')
      .setDescription('[Staff] Send the ticket panel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('vouch')
      .setDescription('[Staff] Send the vouch panel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('accounts')
      .setDescription('[Staff] Send the accounts shop panel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('staff')
      .setDescription('[Admin] Send the staff control panel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('payment')
      .setDescription('[Staff] Send a payment panel for a specific order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addUserOption(o => o.setName('user').setDescription('DM to user (optional)').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('all')
      .setDescription('[Admin] Send all panels to their configured channels')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (!isStaff(interaction.member) && sub !== 'payment')
      return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });

    try {
      const ch = interaction.options.getChannel?.('channel') || interaction.channel;

      if (sub === 'main') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        await ch.send(panels.mainMenuPanel());
        return interaction.editReply({ embeds: [success('Sent', `Main menu panel sent to ${ch}`)] });
      }

      if (sub === 'prices') {
        await ch.send(panels.pricesPanel());
        return interaction.editReply({ embeds: [success('Sent', `Prices panel sent to ${ch}`)] });
      }

      if (sub === 'order') {
        await ch.send(panels.orderPanel());
        return interaction.editReply({ embeds: [success('Sent', `Order panel sent to ${ch}`)] });
      }

      if (sub === 'ticket') {
        await ch.send(panels.ticketPanel());
        return interaction.editReply({ embeds: [success('Sent', `Ticket panel sent to ${ch}`)] });
      }

      if (sub === 'vouch') {
        await ch.send(panels.vouchPanel());
        return interaction.editReply({ embeds: [success('Sent', `Vouch panel sent to ${ch}`)] });
      }

      if (sub === 'accounts') {
        const db = require('../database');
        const { rows } = await db.query(`SELECT * FROM accounts WHERE status='available' ORDER BY price ASC LIMIT 10`);
        await ch.send(panels.buyAccountPanel(rows));
        return interaction.editReply({ embeds: [success('Sent', `Account shop panel sent to ${ch}`)] });
      }

      if (sub === 'staff') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        await ch.send(panels.staffPanel());
        return interaction.editReply({ embeds: [success('Sent', `Staff panel sent to ${ch}`)] });
      }

      if (sub === 'payment') {
        const db = require('../database');
        const orderId = interaction.options.getString('order_id');
        const targetUser = interaction.options.getUser('user');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        const panel = panels.paymentPanel(orderId, o.price, `${o.service_type} – ${o.from_rank} → ${o.to_rank}`);
        if (targetUser) {
          try {
            await targetUser.send(panel);
            return interaction.editReply({ embeds: [success('Sent', `Payment panel DMed to ${targetUser}`)] });
          } catch {
            await ch.send(panel);
            return interaction.editReply({ embeds: [success('Sent', `Could not DM user, sent to ${ch} instead.`)] });
          }
        } else {
          await ch.send(panel);
          return interaction.editReply({ embeds: [success('Sent', `Payment panel sent to ${ch}`)] });
        }
      }

      if (sub === 'all') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const guild = interaction.guild;
        const logCh = guild.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
        if (logCh) await logCh.send(panels.claimOrderPanel({ id: '00000000', user_id: '0', service_type: 'Example', boost_type: 'boost', from_rank: 'Bronze', to_rank: 'Silver', price: 0 })).catch(() => {});
        await interaction.channel.send(panels.mainMenuPanel());
        return interaction.editReply({ embeds: [success('All Panels Sent', 'All available panels have been deployed.')] });
      }

    } catch (err) {
      console.error('[panel]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
