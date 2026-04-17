// src/events/ready.js
const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    console.log(`\n✅  Logged in as ${client.user.tag}`);
    console.log(`📡  Serving ${client.guilds.cache.size} guild(s)`);
    console.log(`⚡  Brawl Services™ Bot is online!\n`);

    // Rotate presence
    const statuses = [
      { name: '⚡ Brawl Stars Boosting', type: ActivityType.Playing },
      { name: '🏆 Rank Boosting Services', type: ActivityType.Watching },
      { name: '/order create', type: ActivityType.Listening },
      { name: '🎓 Coaching Sessions', type: ActivityType.Playing },
    ];

    let i = 0;
    const setStatus = () => {
      const s = statuses[i % statuses.length];
      client.user.setPresence({ activities: [s], status: 'online' });
      i++;
    };

    setStatus();
    setInterval(setStatus, 30_000);

    // ── Auto-send coaching panel ──────────────────────────────────────────
    const channelId = process.env.COACHING_PANEL_CHANNEL_ID;
    if (!channelId) return console.warn('⚠️  COACHING_PANEL_CHANNEL_ID not set, skipping panel send.');

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) return console.warn('⚠️  Coaching panel channel not found.');

      const messages = await channel.messages.fetch({ limit: 20 });
      const botMessages = messages.filter(m => m.author.id === client.user.id);
      for (const msg of botMessages.values()) await msg.delete().catch(() => {});

      const { coachingMainPanel } = require('../panels/coachingBooking');
      await channel.send(coachingMainPanel());
      console.log(`📋  Coaching panel sent to #${channel.name}`);
    } catch (err) {
      console.error('❌  Failed to send coaching panel:', err.message);
    }
  },
};
