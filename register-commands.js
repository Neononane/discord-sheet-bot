const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Generate a dashboard image for a given seed')
    .addIntegerOption(option =>
      option.setName('seed')
        .setDescription('Seed number (1–9)')
        .setRequired(true))
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('📡 Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Slash command registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();
