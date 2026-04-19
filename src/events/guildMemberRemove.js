// src/events/guildMemberRemove.js
const { Events, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/constants');

module.exports = {
  name: Events.GuildMemberRemove,

  async execute(member) {
    const leaveChannelId = process.env.WELCOME_CHANNEL_ID; // reuse same channel or set LEAVE_CHANNEL_ID
    if (!leaveChannelId) return;

    const ch = member.guild.channels.cache.get(leaveChannelId);
    if (!ch) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(`👋 **${member.user.username}** has left the server. We now have **${member.guild.memberCount}** members.`)
        .setTimestamp();

      await ch.send({ embeds: [embed] });
    } catch {}
  },
};
