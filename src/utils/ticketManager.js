// src/utils/ticketManager.js
const { PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');
const { getEmojis, COLORS } = require('./constants');
const { base } = require('./embeds');
const { v4: uuidv4 } = require('uuid');

async function createTicket(guild, user, category = 'general', orderId = null, extraPerms = []) {
  const em = getEmojis();
  const ticketId = uuidv4().slice(0, 8).toUpperCase();
  const channelName = `${category}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${ticketId}`.slice(0, 100);

  const categoryChannel = process.env.TICKET_CATEGORY_ID
    ? guild.channels.cache.get(process.env.TICKET_CATEGORY_ID)
    : null;

  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    ...extraPerms,
  ];

  if (process.env.STAFF_ROLE_ID) {
    permOverwrites.push({
      id: process.env.STAFF_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryChannel?.id,
    permissionOverwrites: permOverwrites,
    topic: `Ticket for ${user.tag} | Category: ${category} | ID: ${ticketId}`,
  });

  await db.query(
    `INSERT INTO tickets (channel_id, user_id, guild_id, category, order_id) VALUES ($1,$2,$3,$4,$5)`,
    [channel.id, user.id, guild.id, category, orderId]
  );

  const embed = base(COLORS.PRIMARY)
    .setTitle(`${em.TICKET} Ticket \`#${ticketId}\``)
    .setDescription(
      `> Welcome ${user}, your ticket has been created!\n\n` +
      `**Category:** ${category.toUpperCase()}\n` +
      `**Status:** 🟢 Open\n\n` +
      `A staff member will assist you shortly.\n` +
      `Please describe your issue or request below.`
    )
    .setThumbnail('attachment://logo.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_claim_${channel.id}`)
      .setLabel('Claim Ticket')
      .setEmoji('🛠️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_close_${channel.id}`)
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    content: `${user} | ${process.env.STAFF_ROLE_ID ? `<@&${process.env.STAFF_ROLE_ID}>` : ''}`,
    embeds: [embed],
    components: [row],
    files: [{ attachment: 'assets/logo.png', name: 'logo.png' }],
  });

  // Send coaching booking panel automatically for coaching tickets
  if (category === 'coaching') {
    try {
      const { coachingMainPanel } = require('../panels/coachingBooking');
      await channel.send(coachingMainPanel());
    } catch (err) {
      console.error('[ticketManager] Failed to send coaching panel:', err.message);
    }
  }

  return channel;
}

async function closeTicket(channel, closedBy, reason = 'No reason provided') {
  const em = getEmojis();
  const embed = base(COLORS.ERROR)
    .setTitle(`${em.LOCK} Ticket Closed`)
    .setDescription(`Ticket closed by ${closedBy}\n**Reason:** ${reason}\n\nThis channel will be deleted in **5 seconds**.`);

  await channel.send({ embeds: [embed] });
  await db.query(`UPDATE tickets SET status='closed', closed_at=NOW() WHERE channel_id=$1`, [channel.id]);
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

module.exports = { createTicket, closeTicket };
