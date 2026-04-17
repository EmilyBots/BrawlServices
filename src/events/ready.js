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
  },
};
