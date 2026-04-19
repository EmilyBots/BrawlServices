// src/utils/logger.js
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('./constants');

// Log types and their config
const LOG_TYPES = {
  // Member
  MEMBER_JOIN:        { color: 0x57F287, emoji: '📥', label: 'Member Joined' },
  MEMBER_LEAVE:       { color: 0xED4245, emoji: '📤', label: 'Member Left' },
  MEMBER_ROLE_ADD:    { color: 0x5865F2, emoji: '🎭', label: 'Role Added' },
  MEMBER_ROLE_REMOVE: { color: 0x99AAB5, emoji: '🎭', label: 'Role Removed' },
  MEMBER_NICK_CHANGE: { color: 0xFEE75C, emoji: '✏️', label: 'Nickname Changed' },
  // Moderation
  MOD_WARN:           { color: 0xFEE75C, emoji: '⚠️', label: 'Member Warned' },
  MOD_MUTE:           { color: 0xFFA500, emoji: '🔇', label: 'Member Muted' },
  MOD_UNMUTE:         { color: 0x57F287, emoji: '🔊', label: 'Member Unmuted' },
  MOD_KICK:           { color: 0xED4245, emoji: '👢', label: 'Member Kicked' },
  MOD_BAN:            { color: 0x8B0000, emoji: '🔨', label: 'Member Banned' },
  MOD_UNBAN:          { color: 0x57F287, emoji: '🔓', label: 'Member Unbanned' },
  // Tickets
  TICKET_OPEN:        { color: 0x5865F2, emoji: '🎫', label: 'Ticket Opened' },
  TICKET_CLOSE:       { color: 0x99AAB5, emoji: '🔒', label: 'Ticket Closed' },
  TICKET_CLAIM:       { color: 0xFFB800, emoji: '🛠️', label: 'Ticket Claimed' },
  TICKET_TRANSCRIPT:  { color: 0x5865F2, emoji: '📄', label: 'Transcript Saved' },
  // Orders
  ORDER_CREATE:       { color: 0xFFB800, emoji: '📦', label: 'Order Created' },
  ORDER_PAID:         { color: 0x57F287, emoji: '💳', label: 'Order Paid' },
  ORDER_ASSIGNED:     { color: 0x5865F2, emoji: '⚡', label: 'Booster Assigned' },
  ORDER_COMPLETE:     { color: 0x57F287, emoji: '✅', label: 'Order Completed' },
  ORDER_CANCEL:       { color: 0xED4245, emoji: '❌', label: 'Order Cancelled' },
  ORDER_DISPUTE:      { color: 0xFFA500, emoji: '⚖️', label: 'Order Disputed' },
  // Applications
  APP_SUBMIT:         { color: 0xFFB800, emoji: '📋', label: 'Application Submitted' },
  APP_ACCEPT:         { color: 0x57F287, emoji: '✅', label: 'Application Accepted' },
  APP_DECLINE:        { color: 0xED4245, emoji: '❌', label: 'Application Declined' },
  // Partnership
  PARTNER_SUBMIT:     { color: 0x5865F2, emoji: '🤝', label: 'Partnership Request' },
  PARTNER_ACCEPT:     { color: 0x57F287, emoji: '🤝', label: 'Partnership Accepted' },
  PARTNER_DECLINE:    { color: 0xED4245, emoji: '🤝', label: 'Partnership Declined' },
  // Payments
  PAYMENT_RECEIVED:   { color: 0x57F287, emoji: '💰', label: 'Payment Received' },
  PAYMENT_REFUND:     { color: 0xFFA500, emoji: '↩️', label: 'Refund Issued' },
  // Bot/System
  BOT_COMMAND:        { color: 0x99AAB5, emoji: '🤖', label: 'Command Used' },
  BOT_ERROR:          { color: 0xED4245, emoji: '🔴', label: 'Bot Error' },
  SYSTEM_ACTION:      { color: 0x5865F2, emoji: '⚙️', label: 'System Action' },
  // Suspicious
  SUSPICIOUS_SPAM:    { color: 0xFF6600, emoji: '🚨', label: 'Spam Detected' },
  SUSPICIOUS_ALT:     { color: 0xFF6600, emoji: '🚨', label: 'Possible Alt Account' },
  SUSPICIOUS_RAID:    { color: 0xFF0000, emoji: '🚨', label: 'Raid Alert' },
};

// Send a log embed to the configured log channel
async function log(client, guildId, type, fields = {}) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const ch = guild.channels.cache.get(logChannelId);
  if (!ch) return;

  const config = LOG_TYPES[type] || { color: 0x99AAB5, emoji: '📝', label: type };

  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(`${config.emoji} ${config.label}`)
    .setTimestamp();

  // Add all fields
  const embedFields = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') {
      embedFields.push({ name, value: String(value).slice(0, 1024), inline: true });
    }
  }

  if (embedFields.length) embed.addFields(embedFields);

  try {
    await ch.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Logger] Failed to send log:', err.message);
  }
}

// Shorthand helpers
const logger = {
  // Member
  memberJoin:       (client, guildId, member, inviter, inviteCode, inviterTotal) =>
    log(client, guildId, 'MEMBER_JOIN', {
      'User':        `${member} (${member.user?.tag || member.user?.username})`,
      'Account Age': `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      'Invited By':  inviter ? `${inviter} (${inviteCode}) — **${inviterTotal}** invites` : `Unknown / Vanity`,
      'Member Count':`${member.guild.memberCount}`,
    }),

  memberLeave:      (client, guildId, member) =>
    log(client, guildId, 'MEMBER_LEAVE', {
      'User':    `${member.user.tag}`,
      'User ID': `\`${member.user.id}\``,
      'Joined':  member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown',
      'Roles':   member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(', ') || 'None',
    }),

  roleAdd:          (client, guildId, member, role, by) =>
    log(client, guildId, 'MEMBER_ROLE_ADD', {
      'User':  `${member}`, 'Role': `<@&${role.id}>`, 'By': by || 'System',
    }),

  roleRemove:       (client, guildId, member, role, by) =>
    log(client, guildId, 'MEMBER_ROLE_REMOVE', {
      'User':  `${member}`, 'Role': `<@&${role.id}>`, 'By': by || 'System',
    }),

  // Moderation
  warn:             (client, guildId, target, moderator, reason) =>
    log(client, guildId, 'MOD_WARN', {
      'User': `${target}`, 'Moderator': `${moderator}`, 'Reason': reason || 'No reason',
    }),

  mute:             (client, guildId, target, moderator, duration, reason) =>
    log(client, guildId, 'MOD_MUTE', {
      'User': `${target}`, 'Moderator': `${moderator}`, 'Duration': duration || 'Indefinite', 'Reason': reason || 'No reason',
    }),

  unmute:           (client, guildId, target, moderator) =>
    log(client, guildId, 'MOD_UNMUTE', {
      'User': `${target}`, 'Moderator': `${moderator}`,
    }),

  kick:             (client, guildId, target, moderator, reason) =>
    log(client, guildId, 'MOD_KICK', {
      'User': `${target}`, 'Moderator': `${moderator}`, 'Reason': reason || 'No reason',
    }),

  ban:              (client, guildId, target, moderator, reason) =>
    log(client, guildId, 'MOD_BAN', {
      'User': `${target}`, 'Moderator': `${moderator}`, 'Reason': reason || 'No reason',
    }),

  unban:            (client, guildId, target, moderator) =>
    log(client, guildId, 'MOD_UNBAN', {
      'User': `${target}`, 'Moderator': `${moderator}`,
    }),

  // Tickets
  ticketOpen:       (client, guildId, user, channel, category) =>
    log(client, guildId, 'TICKET_OPEN', {
      'User': `${user}`, 'Channel': `${channel}`, 'Category': category,
    }),

  ticketClose:      (client, guildId, user, channel, closedBy) =>
    log(client, guildId, 'TICKET_CLOSE', {
      'Channel': `#${channel.name}`, 'Opened By': `${user}`, 'Closed By': `${closedBy}`,
    }),

  ticketClaim:      (client, guildId, staff, channel) =>
    log(client, guildId, 'TICKET_CLAIM', {
      'Staff': `${staff}`, 'Channel': `${channel}`,
    }),

  // Orders
  orderCreate:      (client, guildId, order, user) =>
    log(client, guildId, 'ORDER_CREATE', {
      'Order ID':  `\`#${order.id.slice(0,8).toUpperCase()}\``,
      'Customer':  `${user}`,
      'Service':   order.service_type,
      'Route':     `${order.from_rank} → ${order.to_rank}`,
      'Price':     `€${order.price}`,
    }),

  orderPaid:        (client, guildId, order, method) =>
    log(client, guildId, 'ORDER_PAID', {
      'Order ID': `\`#${order.id.slice(0,8).toUpperCase()}\``,
      'Customer': `<@${order.user_id}>`,
      'Amount':   `€${order.price}`,
      'Method':   method,
    }),

  orderComplete:    (client, guildId, order) =>
    log(client, guildId, 'ORDER_COMPLETE', {
      'Order ID': `\`#${order.id.slice(0,8).toUpperCase()}\``,
      'Customer': `<@${order.user_id}>`,
      'Booster':  `<@${order.booster_id}>`,
      'Service':  order.service_type,
      'Price':    `€${order.price}`,
    }),

  orderCancel:      (client, guildId, order, by, reason) =>
    log(client, guildId, 'ORDER_CANCEL', {
      'Order ID': `\`#${order.id.slice(0,8).toUpperCase()}\``,
      'By':       `${by}`,
      'Reason':   reason || 'No reason',
    }),

  // Applications
  appSubmit:        (client, guildId, user, type, appId) =>
    log(client, guildId, 'APP_SUBMIT', {
      'User': `${user}`, 'Type': type.toUpperCase(), 'ID': `\`#${appId.slice(0,8).toUpperCase()}\``,
    }),

  appAccept:        (client, guildId, user, type, reviewer) =>
    log(client, guildId, 'APP_ACCEPT', {
      'User': `${user}`, 'Type': type.toUpperCase(), 'Reviewer': `${reviewer}`,
    }),

  appDecline:       (client, guildId, user, type, reviewer, reason) =>
    log(client, guildId, 'APP_DECLINE', {
      'User': `${user}`, 'Type': type.toUpperCase(), 'Reviewer': `${reviewer}`, 'Reason': reason,
    }),

  // Partnership
  partnerSubmit:    (client, guildId, user, partId) =>
    log(client, guildId, 'PARTNER_SUBMIT', {
      'User': `${user}`, 'ID': `\`#${partId.slice(0,8).toUpperCase()}\``,
    }),

  partnerAccept:    (client, guildId, user, reviewer) =>
    log(client, guildId, 'PARTNER_ACCEPT', {
      'Partner': `${user}`, 'Reviewer': `${reviewer}`,
    }),

  partnerDecline:   (client, guildId, user, reviewer, reason) =>
    log(client, guildId, 'PARTNER_DECLINE', {
      'User': `${user}`, 'Reviewer': `${reviewer}`, 'Reason': reason,
    }),

  // Payments
  paymentReceived:  (client, guildId, user, amount, method, orderId) =>
    log(client, guildId, 'PAYMENT_RECEIVED', {
      'User':     `${user}`,
      'Amount':   `€${amount}`,
      'Method':   method,
      'Order ID': `\`#${String(orderId).slice(0,8).toUpperCase()}\``,
    }),

  refund:           (client, guildId, user, amount, orderId, reason) =>
    log(client, guildId, 'PAYMENT_REFUND', {
      'User': `${user}`, 'Amount': `€${amount}`, 'Order ID': `\`#${String(orderId).slice(0,8).toUpperCase()}\``, 'Reason': reason,
    }),

  // Bot/System
  command:          (client, guildId, user, command, channel) =>
    log(client, guildId, 'BOT_COMMAND', {
      'User': `${user}`, 'Command': `\`/${command}\``, 'Channel': `${channel}`,
    }),

  systemAction:     (client, guildId, action, details) =>
    log(client, guildId, 'SYSTEM_ACTION', {
      'Action': action, 'Details': details,
    }),

  // Suspicious
  suspicious:       (client, guildId, type, user, details) =>
    log(client, guildId, `SUSPICIOUS_${type.toUpperCase()}`, {
      'User': `${user}`, 'Details': details,
    }),
};

module.exports = { log, logger, LOG_TYPES };
