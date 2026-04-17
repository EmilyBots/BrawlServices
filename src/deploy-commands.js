// src/deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`  ✅  Queued: /${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n🚀  Deploying ${commands.length} slash commands...\n`);

    const guildId = process.env.GUILD_ID;
    if (guildId) {
      // Guild deploy (instant for testing)
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands });
      console.log(`\n✅  Deployed ${commands.length} commands to guild ${guildId}`);
    } else {
      // Global deploy
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log(`\n✅  Deployed ${commands.length} commands globally (may take up to 1 hour)`);
    }
  } catch (err) {
    console.error('❌  Failed to deploy commands:', err);
    process.exit(1);
  }
})();
