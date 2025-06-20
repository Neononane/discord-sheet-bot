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
const GUILD_ID = process.env.GUILD_ID; // Replace with your test server ID

(async () => {
  try {
    console.log('📡 Registering global command...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Global command registered.');

    console.log('📡 Registering guild command...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      //{ body: commands }
      { body: [] }
    );
    console.log('✅ Guild command registered.');
  } catch (err) {
    console.error('❌ Error registering slash commands:', err);
  }
})();
