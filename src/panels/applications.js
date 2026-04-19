// src/panels/applications.js
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const { COLORS, getEmojis } = require('../utils/constants');
const { base } = require('../utils/embeds');

const logo = () => new AttachmentBuilder('assets/logo.png', { name: 'logo.png' });

function applicationsMainPanel() {
  const em = getEmojis();

  const embed = base(COLORS.PRIMARY)
    .setTitle(`${em.STAFF} Join the Brawl Services™ Team`)
    .setDescription(
      `> We are looking for talented and dedicated people to join our team!\n\n` +
      `🛠️ **Staff**\n` +
      `> Manage tickets, support customers, handle orders and keep the server running smoothly.\n` +
      `> **Requirements:** Active, trustworthy, good communication skills.\n\n` +
      `⚡ **Booster**\n` +
      `> Carry out ranked boost and carry orders for our customers.\n` +
      `> **Requirements:** Masters+ rank, reliable, fast turnaround.\n\n` +
      `🎓 **Coach**\n` +
      `> Host 1-on-1 coaching sessions and help players improve.\n` +
      `> **Requirements:** Pro/Masters rank, teaching experience, patient.\n\n` +
      `**How to apply:**\n` +
      `**1.** Click a button below\n` +
      `**2.** Fill in the application form\n` +
      `**3.** Our team reviews your application\n` +
      `**4.** You will be notified via DM\n\n` +
      `> ⚠️ *Submitting multiple applications or lying will result in a permanent ban.*`
    )
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: `${em.CROWN} Brawl Services™ • Good luck!` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('app_apply_staff').setLabel('Apply for Staff').setEmoji('🛠️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('app_apply_booster').setLabel('Apply for Booster').setEmoji('⚡').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('app_apply_coach').setLabel('Apply for Coach').setEmoji('🎓').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

function applicationReviewPanel(application, user) {
  const typeEmoji = { staff: '🛠️', booster: '⚡', coach: '🎓' }[application.type] || '📋';
  const typeLabel = { staff: 'Staff', booster: 'Booster', coach: 'Coach' }[application.type] || application.type;
  const answers = application.answers || {};
  const qaLines = Object.entries(answers).map(([q, a]) => `**${q}**\n> ${a}`).join('\n\n');

  const embed = base(COLORS.WARNING)
    .setTitle(`${typeEmoji} New ${typeLabel} Application`)
    .setDescription(
      `> A new application has been submitted and is awaiting review.\n\n` +
      `**Applicant:** ${user}\n` +
      `**User ID:** \`${application.user_id}\`\n` +
      `**Type:** ${typeEmoji} ${typeLabel}\n` +
      `**Application ID:** \`${application.id.slice(0, 8).toUpperCase()}\`\n` +
      `**Submitted:** <t:${Math.floor(new Date(application.created_at).getTime() / 1000)}:R>\n\n` +
      `📝 **Answers**\n\n${qaLines}\n\n` +
      `> Only the **owner** can accept or decline. Staff may discuss in the thread.`
    )
    .setThumbnail(user.displayAvatarURL?.() || null);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_accept_${application.id}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app_decline_${application.id}`).setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`app_pending_${application.id}`).setLabel('Mark Pending').setEmoji('🕐').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

function applicationAcceptedPanel(application, user, reviewerTag) {
  const typeEmoji = { staff: '🛠️', booster: '⚡', coach: '🎓' }[application.type] || '📋';
  const typeLabel = { staff: 'Staff', booster: 'Booster', coach: 'Coach' }[application.type] || application.type;

  const embed = base(COLORS.SUCCESS)
    .setTitle(`✅ Application Accepted`)
    .setDescription(
      `**Applicant:** ${user}\n` +
      `**Type:** ${typeEmoji} ${typeLabel}\n` +
      `**ID:** \`${application.id.slice(0, 8).toUpperCase()}\`\n` +
      `**Accepted by:** ${reviewerTag}\n` +
      `**Accepted at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
      `> 🗑️ *This thread will be deleted in 30 minutes.*`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('app_accepted_done').setLabel('Accepted ✅').setStyle(ButtonStyle.Success).setDisabled(true),
  );

  return { embeds: [embed], components: [row] };
}

function applicationDeclinedPanel(application, user, reviewerTag, reason) {
  const typeEmoji = { staff: '🛠️', booster: '⚡', coach: '🎓' }[application.type] || '📋';
  const typeLabel = { staff: 'Staff', booster: 'Booster', coach: 'Coach' }[application.type] || application.type;

  const embed = base(COLORS.ERROR)
    .setTitle(`❌ Application Declined`)
    .setDescription(
      `**Applicant:** ${user}\n` +
      `**Type:** ${typeEmoji} ${typeLabel}\n` +
      `**ID:** \`${application.id.slice(0, 8).toUpperCase()}\`\n` +
      `**Declined by:** ${reviewerTag}\n` +
      `**Reason:** ${reason || 'No reason provided'}\n` +
      `**Declined at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
      `> 🗑️ *This thread will be deleted in 30 minutes.*`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('app_declined_done').setLabel('Declined ❌').setStyle(ButtonStyle.Danger).setDisabled(true),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  applicationsMainPanel,
  applicationReviewPanel,
  applicationAcceptedPanel,
  applicationDeclinedPanel,
};
