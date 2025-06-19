// Decode and save the service account file if on Railway
if (process.env.GOOGLE_CREDS_B64) {
    const fs = require('fs');
    fs.writeFileSync('service-account.json', Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64'));
  }
  

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { google } = require('googleapis');
const fs = require('fs');

const SHEET_ID = process.env.SHEET_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Load Google credentials
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function fetchSheetData(range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: range, // e.g., "Dashboard!A1:D10"
  });
  return response.data.values;
}

function formatAsTable(values) {
  if (!values || values.length === 0) return 'No data found.';
  const colWidths = values[0].map((_, col) =>
    Math.max(...values.map(row => (row[col] || '').length))
  );

  const rows = values.map(row =>
    row.map((val, i) => (val || '').padEnd(colWidths[i])).join(' | ')
  );
  return '```' + rows.join('\n') + '```';
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('ready', async () => {
  console.log(`Bot ready as ${client.user.tag}`);

  const range = 'Dashboard!A1:D10'; // 👈 Change this to your sheet range
  const values = await fetchSheetData(range);
  const table = formatAsTable(values);

  const channel = await client.channels.fetch(CHANNEL_ID);
  const sent = await channel.send({
    content: '**📊 Google Sheet Dashboard**\n' + table,
  });

  console.log('Dashboard posted.');
});

client.login(process.env.DISCORD_TOKEN);
