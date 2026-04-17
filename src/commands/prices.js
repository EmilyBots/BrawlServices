// src/commands/prices.js
const { SlashCommandBuilder } = require('discord.js');
const { PRICING, COLORS, getEmojis } = require('../utils/constants');
const { base } = require('../utils/embeds');
const { pricesPanel } = require('../panels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prices')
    .setDescription('View Brawl Services pricing')

    .addSubcommand(s => s.setName('all').setDescription('Show all prices'))
    .addSubcommand(s => s.setName('ranked').setDescription('Show ranked boost prices'))
    .addSubcommand(s => s.setName('prestige').setDescription('Show prestige boost prices'))
    .addSubcommand(s => s.setName('winstreak').setDescription('Show win streak farm prices'))
    .addSubcommand(s => s.setName('coaching').setDescription('Show coaching session prices'))
    .addSubcommand(s => s
      .setName('calculate')
      .setDescription('Calculate exact price for a service')
      .addStringOption(o => o.setName('service').setDescription('Service').setRequired(true)
        .addChoices(
          { name: 'Ranked Boost',    value: 'ranked_boost' },
          { name: 'Ranked Carry',    value: 'ranked_carry' },
          { name: 'Prestige Boost',  value: 'prestige_boost' },
          { name: 'Prestige Carry',  value: 'prestige_carry' },
          { name: 'Win Streak Boost',value: 'winstreak_boost' },
          { name: 'Win Streak Carry',value: 'winstreak_carry' },
        ))
      .addStringOption(o => o.setName('tier').setDescription('Tier (e.g. bronze_silver, prestige_1, wins_50)').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('send')
      .setDescription('Send price list to this channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: sub === 'send' });

    if (sub === 'all' || sub === 'send') {
      const panel = pricesPanel();
      if (sub === 'send') {
        const ch = interaction.options.getChannel('channel') || interaction.channel;
        await ch.send(panel);
        return interaction.editReply({ content: `✅ Prices sent to ${ch}` });
      }
      return interaction.editReply(panel);
    }

    if (sub === 'ranked') {
      const boost = PRICING.ranked.boost;
      const carry = PRICING.ranked.carry;
      const embed = base(COLORS.PRIMARY).setTitle(`⚔️ Ranked Boost Prices`)
        .addFields(
          { name: '🕹️ Boost (account)', value: Object.values(boost).map(e => `**${e.label}** — €${e.price}`).join('\n'), inline: true },
          { name: '🤝 Carry (together)', value: Object.values(carry).map(e => `**${e.label}** — €${e.price}`).join('\n'), inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'prestige') {
      const boost = PRICING.prestige.boost;
      const carry = PRICING.prestige.carry;
      const embed = base(COLORS.PRIMARY).setTitle(`🏆 Prestige Boost Prices`)
        .addFields(
          { name: '🕹️ Boost', value: Object.values(boost).map(e => `${em.PRESTIGE1 || '🏆'} **${e.label}** — €${e.price}`).join('\n'), inline: true },
          { name: '🤝 Carry', value: Object.values(carry).map(e => `${em.PRESTIGE1 || '🏆'} **${e.label}** — €${e.price}`).join('\n'), inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'winstreak') {
      const boost = PRICING.winstreak.boost;
      const carry = PRICING.winstreak.carry;
      const embed = base(COLORS.PRIMARY).setTitle(`🔥 Win Streak Farm Prices`)
        .addFields(
          { name: '🕹️ Boost', value: Object.values(boost).map(e => `🔥 **${e.label}** — €${e.price}`).join('\n'), inline: true },
          { name: '🤝 Carry', value: Object.values(carry).map(e => `🔥 **${e.label}** — €${e.price}`).join('\n'), inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'coaching') {
      const embed = base(COLORS.PRIMARY).setTitle(`🎓 Coaching Session Prices`)
        .setDescription(Object.values(PRICING.coaching).map(e => `⭐ **${e.label}** — €${e.price}`).join('\n'));
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'calculate') {
      const service = interaction.options.getString('service');
      const tier = interaction.options.getString('tier');
      const [cat, type] = service.includes('ranked') ? ['ranked', service.replace('ranked_', '')] :
                          service.includes('prestige') ? ['prestige', service.replace('prestige_', '')] :
                          ['winstreak', service.replace('winstreak_', '')];
      const entry = PRICING[cat]?.[type]?.[tier];
      if (!entry) return interaction.editReply({ content: `❌ No price found for \`${service} / ${tier}\`. Check available tiers with \`/prices ${cat}\`` });
      const embed = base(COLORS.SUCCESS)
        .setTitle(`${em.MONEY} Price: ${entry.label}`)
        .setDescription(`**Service:** ${service.replace('_', ' ').toUpperCase()}\n**Tier:** ${entry.label}\n**Price:** **€${entry.price}**\n\n> Use \`/order create\` to place this order!`);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
