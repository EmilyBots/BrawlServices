// src/utils/embeds.js
const { EmbedBuilder } = require('discord.js');
const { COLORS, getEmojis } = require('./constants');

const FOOTER_TEXT = 'Brawl Services™';
const FOOTER_ICON = 'attachment://logo.png';

function base(color = COLORS.PRIMARY) {
  const em = getEmojis();
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: `${em.CROWN} ${FOOTER_TEXT}` })
    .setTimestamp();
}

function success(title, description) {
  const em = getEmojis();
  return base(COLORS.SUCCESS)
    .setTitle(`${em.CHECK} ${title}`)
    .setDescription(description);
}

function error(title, description) {
  const em = getEmojis();
  return base(COLORS.ERROR)
    .setTitle(`${em.CROSS} ${title}`)
    .setDescription(description);
}

function info(title, description) {
  const em = getEmojis();
  return base(COLORS.INFO)
    .setTitle(`${em.BULLET} ${title}`)
    .setDescription(description);
}

function warning(title, description) {
  const em = getEmojis();
  return base(COLORS.WARNING)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description);
}

function orderEmbed(order) {
  const em = getEmojis();
  const statusEmoji = {
    pending:     '🟡',
    paid:        '🟢',
    in_progress: '🔵',
    completed:   '✅',
    cancelled:   '🔴',
    disputed:    '🟠',
  }[order.status] || '⚪';

  return base(COLORS.PRIMARY)
    .setTitle(`${em.ORDER} Order \`#${order.id.slice(0,8).toUpperCase()}\``)
    .addFields(
      { name: `${em.PERSON} Customer`,      value: `<@${order.user_id}>`,                      inline: true },
      { name: `${em.STAFF} Booster`,        value: order.booster_id ? `<@${order.booster_id}>` : '*Unassigned*', inline: true },
      { name: `${em.BOOST} Service`,        value: order.service_type,                          inline: true },
      { name: `${em.SWORD} Type`,           value: order.boost_type?.toUpperCase() || 'BOOST',  inline: true },
      { name: `${em.TROPHY} Route`,         value: order.from_rank && order.to_rank ? `${order.from_rank} **→** ${order.to_rank}` : 'N/A', inline: true },
      { name: `${em.MONEY} Price`,          value: `**€${Number(order.price).toFixed(2)}**`,    inline: true },
      { name: `${em.PAYMENT} Payment`,      value: order.payment_status?.toUpperCase() || 'UNPAID', inline: true },
      { name: `${statusEmoji} Status`,      value: order.status?.toUpperCase(),                 inline: true },
      { name: `${em.CLOCK} Created`,        value: `<t:${Math.floor(new Date(order.created_at).getTime()/1000)}:R>`, inline: true },
    );
}

module.exports = { base, success, error, info, warning, orderEmbed };
