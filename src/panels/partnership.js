// src/panels/partnership.js
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const { COLORS, getEmojis } = require('../utils/constants');
const { base } = require('../utils/embeds');

const logo = () => new AttachmentBuilder('assets/logo.png', { name: 'logo.png' });

function partnershipPanel() {
  const em = getEmojis();

  const embed = base(COLORS.PRIMARY)
    .setTitle(`🤝 Partner with Brawl Services™`)
    .setDescription(
      `> Interested in partnering with the #1 Brawl Stars boosting service?\n\n` +
      `**What we offer partners:**\n` +
      `${em.STAR} Shoutout in our server & socials\n` +
      `${em.STAR} Dedicated partner role & channel\n` +
      `${em.STAR} Cross-promotion to our customer base\n` +
      `${em.STAR} Exclusive discounts for your community\n` +
      `${em.STAR} Long-term collaboration opportunities\n\n` +
      `**Requirements:**\n` +
      `${em.BULLET} Server with **100+ members** minimum\n` +
      `${em.BULLET} Active community relevant to gaming/Brawl Stars\n` +
      `${em.BULLET} Willing to advertise us in your server\n` +
      `${em.BULLET} No toxic or rule-breaking communities\n\n` +
      `> Click the button below to submit a partnership request!\n` +
      `> Our team reviews all requests within **48 hours**.`
    )
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: `${em.CROWN} Brawl Services™ • Quality partnerships only` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('partner_apply')
      .setLabel('Apply for Partnership')
      .setEmoji('🤝')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

function partnershipReviewPanel(partnership, user) {
  const answers = partnership.answers || {};
  const qaLines = Object.entries(answers).map(([q, a]) => `**${q}**\n> ${a}`).join('\n\n');

  const embed = base(COLORS.INFO)
    .setTitle(`🤝 New Partnership Request`)
    .setDescription(
      `> A new partnership request is awaiting review.\n\n` +
      `**Representative:** ${user}\n` +
      `**User ID:** \`${partnership.user_id}\`\n` +
      `**ID:** \`${partnership.id.slice(0, 8).toUpperCase()}\`\n` +
      `**Submitted:** <t:${Math.floor(new Date(partnership.created_at).getTime() / 1000)}:R>\n\n` +
      `📋 **Answers**\n\n${qaLines}\n\n` +
      `> Only the **owner** can accept or decline. Staff may discuss in the thread.`
    )
    .setThumbnail(user.displayAvatarURL?.() || null);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`partner_accept_${partnership.id}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`partner_decline_${partnership.id}`).setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`partner_info_${partnership.id}`).setLabel('Request More Info').setEmoji('📩').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

function partnershipAcceptedPanel(partnership, user, reviewerTag) {
  const embed = base(COLORS.SUCCESS)
    .setTitle(`✅ Partnership Accepted`)
    .setDescription(
      `**Partner:** ${user}\n` +
      `**ID:** \`${partnership.id.slice(0, 8).toUpperCase()}\`\n` +
      `**Accepted by:** ${reviewerTag}\n` +
      `**Accepted at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
      `> 🗑️ *This thread will be deleted in 30 minutes.*`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('partner_done').setLabel('Accepted ✅').setStyle(ButtonStyle.Success).setDisabled(true),
  );

  return { embeds: [embed], components: [row] };
}

function partnershipDeclinedPanel(partnership, user, reviewerTag, reason) {
  const embed = base(COLORS.ERROR)
    .setTitle(`❌ Partnership Declined`)
    .setDescription(
      `**Representative:** ${user}\n` +
      `**ID:** \`${partnership.id.slice(0, 8).toUpperCase()}\`\n` +
      `**Declined by:** ${reviewerTag}\n` +
      `**Reason:** ${reason || 'No reason provided'}\n` +
      `**Declined at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
      `> 🗑️ *This thread will be deleted in 30 minutes.*`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('partner_done').setLabel('Declined ❌').setStyle(ButtonStyle.Danger).setDisabled(true),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  partnershipPanel,
  partnershipReviewPanel,
  partnershipAcceptedPanel,
  partnershipDeclinedPanel,
};
