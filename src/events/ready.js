// src/events/ready.js
const { Events, ActivityType } = require('discord.js');
const db = require('../database');
const { startStaffListAutoUpdate } = require('../panels/staffListPanel');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`\n✅  Logged in as ${client.user.tag}`);
    console.log(`📡  Serving ${client.guilds.cache.size} guild(s)`);
    console.log(`⚡  Brawl Services™ Bot is online!\n`);

    // ── Cache all guild invites on startup ──────────────────────────────────
    for (const [, guild] of client.guilds.cache) {
      try {
        const invites = await guild.invites.fetch();
        for (const [code, invite] of invites) {
          await db.query(
            `INSERT INTO invites (invite_code, guild_id, inviter_id, uses)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (invite_code) DO UPDATE SET uses=$4`,
            [code, guild.id, invite.inviter?.id || 'unknown', invite.uses]
          );
        }
        console.log(`  📨  Cached ${invites.size} invites for ${guild.name}`);
      } catch (err) {
        console.error(`  ⚠️  Could not fetch invites for ${guild.name}:`, err.message);
      }
    }

    // ── Start staff list auto-update (5-min interval) ───────────────────────
    startStaffListAutoUpdate(client);

    // ── Rotate presence ─────────────────────────────────────────────────────
    const statuses = [
      { name: '⚡ Brawl Stars Boosting',  type: ActivityType.Playing   },
      { name: '🏆 Rank Boosting Services', type: ActivityType.Watching  },
      { name: '/order create',             type: ActivityType.Listening },
      { name: '🎓 Coaching Sessions',      type: ActivityType.Playing   },
    ];
    let i = 0;
    const setStatus = () => {
      client.user.setPresence({ activities: [statuses[i % statuses.length]], status: 'online' });
      i++;
    };
    setStatus();
    setInterval(setStatus, 30_000);
  },
};
