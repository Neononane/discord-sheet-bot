// STEP 1: Decode and write the Google service account file BEFORE ANYTHING ELSE
const fs = require('fs');

try {
  if (process.env.GOOGLE_CREDS_B64) {
    const decoded = Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString('utf-8');
    fs.writeFileSync('service-account.json', decoded);
    console.log('✅ service-account.json written to disk');
  } else {
    console.log('⚠️ GOOGLE_CREDS_B64 not found in environment');
  }
} catch (err) {
  console.error('❌ Failed to write service-account.json:', err);
}

// STEP 2: Now load remaining dependencies
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');

// STEP 3: Set up Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const SHEET_ID = process.env.SHEET_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

// STEP 4: Set up Google Sheets API client (AFTER file is written)
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// STEP 5: Read and format sheet data
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

// STEP 6: Main logic after bot is ready
client.once('ready', async () => {
  console.log(`✅ Bot ready as ${client.user.tag}`);

  try {
    const range = 'Dashboard!A1:D10'; // Change to your desired range
    const values = await fetchSheetData(range);
    const table = formatAsTable(values);

    const channel = await client.channels.fetch(CHANNEL_ID);
    await channel.send({
      content: '**📊 Google Sheet Dashboard**\n' + table,
    });

    console.log('✅ Dashboard posted.');
  } catch (err) {
    console.error('❌ Error during dashboard post:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
