// Decode service-account.json from base64 if GOOGLE_CREDS_B64 is present
if (process.env.GOOGLE_CREDS_B64) {
  const fs = require('fs');
  const decoded = Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString('utf-8');
  fs.writeFileSync('service-account.json', decoded);
}

// Now load all libraries
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');
const fs = require('fs');

// Set up Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const SHEET_ID = process.env.SHEET_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Set up Google Sheets client AFTER service-account.json is written
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function fetchSheetData(range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: range, // Example: "Dashboard!A1:D10"
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

client.once('ready', async () => {
  console.log(`Bot ready as ${client.user.tag}`);

  try {
    const range = 'Dashboard!A1:D10'; // 🔁 Update this if needed
    const values = await fetchSheetData(range);
    const table = formatAsTable(values);

    const channel = await client.channels.fetch(CHANNEL_ID);
    await channel.send({
      content: '**📊 Google Sheet Dashboard**\n' + table,
    });

    console.log('Dashboard posted.');
  } catch (err) {
    console.error('❌ Error during dashboard post:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
