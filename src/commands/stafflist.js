// src/commands.stafflist.js

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  staffListPanel,
  forceRefreshStaffList,
} = require('../panels/staffListPanel');

// ─────────────────────────────────────────────────────────────────────────────
// /stafflist
//   ├── post     — Posts the staff list panel in the current channel
//   ├── refresh  — Force-refreshes the panel immediately (outside the 5-min loop)
//   └── set      — Manually point the bot at an existing channel + message ID
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stafflist')
    .setDescription('Manage the live staff list panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── /stafflist post ────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('post')
        .setDescription('Post the staff list panel in this channel and save its location')
    )

    // ── /stafflist refresh ─────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('refresh')
        .setDescription('Force-refresh the staff list panel right now (without waiting 5 min)')
    )

    // ── /stafflist set ─────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Manually point the bot at an existing staff list message')
        .addStringOption(opt =>
          opt
            .setName('channel_id')
            .setDescription('The channel ID where the staff list message lives')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('message_id')
            .setDescription('The message ID of the staff list panel to edit')
            .setRequired(true)
        )
    ),

  // ── Handler ───────────────────────────────────────────────────────────────
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // All subcommands are staff-only and deferred ephemerally
    await interaction.deferReply({ ephemeral: true });

    // ── /stafflist post ──────────────────────────────────────────────────
    if (sub === 'post') {
      try {
        const payload = await staffListPanel(interaction.guild);
        const msg     = await interaction.channel.send(payload);

        // Persist to env at runtime so the auto-update loop picks them up
        // immediately without a bot restart.
        // Note: Railway env changes via API are permanent; here we patch
        // process.env so the running process knows right away.
        process.env.STAFF_LIST_CHANNEL_ID = interaction.channelId;
        process.env.STAFF_LIST_MESSAGE_ID = msg.id;

        await interaction.editReply({
          content:
            `✅ **Staff list posted!**\n\n` +
            `Add these two variables to your **Railway env** so they persist after restarts:\n` +
            `\`\`\`\n` +
            `STAFF_LIST_CHANNEL_ID=${interaction.channelId}\n` +
            `STAFF_LIST_MESSAGE_ID=${msg.id}\n` +
            `\`\`\`\n` +
            `The panel will now auto-update every **5 minutes**.`,
        });
      } catch (err) {
        console.error('[/stafflist post]', err);
        await interaction.editReply({
          content: `❌ Failed to post the staff list panel.\n\`\`\`${err.message}\`\`\``,
        });
      }
    }

    // ── /stafflist refresh ───────────────────────────────────────────────
    else if (sub === 'refresh') {
      const result = await forceRefreshStaffList(interaction.client);

      if (result.ok) {
        await interaction.editReply({
          content: `✅ **Staff list refreshed!** The panel has been updated right now.`,
        });
      } else {
        await interaction.editReply({
          content: `❌ **Refresh failed.**\n${result.error}`,
        });
      }
    }

    // ── /stafflist set ───────────────────────────────────────────────────
    else if (sub === 'set') {
      const channelId = interaction.options.getString('channel_id');
      const messageId = interaction.options.getString('message_id');

      // Validate the channel exists and is accessible
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return interaction.editReply({
          content: `❌ Could not find a channel with ID \`${channelId}\`. Make sure the ID is correct and the bot has access to it.`,
        });
      }

      // Validate the message exists in that channel
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        return interaction.editReply({
          content: `❌ Could not find a message with ID \`${messageId}\` in <#${channelId}>. Make sure the message exists and the bot can read that channel.`,
        });
      }

      // Patch process.env for the current process lifetime
      process.env.STAFF_LIST_CHANNEL_ID = channelId;
      process.env.STAFF_LIST_MESSAGE_ID = messageId;

      await interaction.editReply({
        content:
          `✅ **Staff list target updated!**\n\n` +
          `The bot will now edit this message: https://discord.com/channels/${interaction.guildId}/${channelId}/${messageId}\n\n` +
          `📌 **Don't forget** to also save these in your Railway env to persist after restarts:\n` +
          `\`\`\`\n` +
          `STAFF_LIST_CHANNEL_ID=${channelId}\n` +
          `STAFF_LIST_MESSAGE_ID=${messageId}\n` +
          `\`\`\``,
      });
    }
  },
};
