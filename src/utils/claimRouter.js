// src/utils/claimRouter.js
// Routes a paid order/session claim panel to the correct staff channel.

const { claimOrderPanel, claimCoachingPanel } = require('../panels');

/**
 * Send a claim panel to the appropriate channel.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} record  – a row from `orders` OR `coaching_sessions`
 * @param {'order'|'coaching'} type
 */
async function sendClaimPanel(guild, record, type) {
  const isCoaching = type === 'coaching';

  const channelId = isCoaching
    ? process.env.COACHING_CLAIM_CHANNEL_ID
    : process.env.BOOST_CLAIM_CHANNEL_ID;

  if (!channelId) {
    console.warn(`[claimRouter] No channel ID set for type="${type}". ` +
      `Set ${isCoaching ? 'COACHING_CLAIM_CHANNEL_ID' : 'BOOST_CLAIM_CHANNEL_ID'} in Railway.`);
    return null;
  }

  const ch = guild.channels.cache.get(channelId);
  if (!ch) {
    console.warn(`[claimRouter] Channel ${channelId} not found in guild.`);
    return null;
  }

  const panel = isCoaching
    ? claimCoachingPanel(record)
    : claimOrderPanel(record);

  return ch.send(panel);
}

module.exports = { sendClaimPanel };
