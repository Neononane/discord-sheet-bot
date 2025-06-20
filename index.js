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

const puppeteer = require('puppeteer');

function extractColumns(values, seedNumber) {
  const seedStart = 2; // B is index 1 (0-based), so Seed 1 is at index 1
  const seedEnd = seedStart + seedNumber - 1;

  return values.map(row => {
    const baseCols = [row[0]]; // Column A: Racer
    const seeds = row.slice(seedStart, seedEnd + 1); // Seeds B to desired
    const racesPlayed = row[10] || ''; // Column K
    const top4Total = row[11] || '';   // Column L
    const badge = row[12] || '';       // Column M

    const showExtras = seedNumber >= 4;

    return showExtras
      ? [...baseCols, ...seeds, racesPlayed, top4Total, badge]
      : [...baseCols, ...seeds, racesPlayed];
  });
}


async function renderImageFromHTML(htmlContent) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // required on Railway
  });

  const page = await browser.newPage();
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  const dimensions = await page.evaluate(() => {
    return {
      width: document.body.scrollWidth,
      height: document.body.scrollHeight,
    };
  });

  // Resize the viewport to match content
  await page.setViewport({
    width: Math.min(dimensions.width + 40, 2000),  // cap width for safety
    height: Math.min(dimensions.height + 40, 4000), // cap height to avoid accidental infinite scroll
  });
  const screenshotBuffer = await page.screenshot({ type: 'png' });
  await browser.close();
  return screenshotBuffer;
}

function generateHTMLTable(values) {
  const rows = values.map(row =>
    `<tr>${row.map(cell => `<td>${cell || ''}</td>`).join('')}</tr>`
  ).join('');

  return `
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: #fff;
          }
          table {
            border-collapse: collapse;
            font-size: 16px;
            width: 100%;
          }
          td, th {
            border: 1px solid #ccc;
            padding: 8px 12px;
            text-align: left;
          }
          th {
            background: #f0f0f0;
          }
        </style>
      </head>
      <body>
        <h2>Rookie Rumble Dashboard</h2>
        <table>
          ${rows}
        </table>
      </body>
    </html>
  `;
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
    const values = await fetchSheetData('Dashboard!A1:M43');
    const html = generateHTMLTable(values);
    const imageBuffer = await renderImageFromHTML(html);

    const { AttachmentBuilder } = require('discord.js');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'dashboard.png' });
    const channel = await client.channels.fetch(CHANNEL_ID);

    await channel.send({
      content: '**📊 Rookie Rumble Dashboard**',
      files: [attachment],
    });


    console.log('✅ Dashboard posted.');
  } catch (err) {
    console.error('❌ Error during dashboard post:', err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'dashboard') {
    const seed = interaction.options.getInteger('seed');
    if (seed < 1 || seed > 9) {
      await interaction.reply({ content: '❌ Seed number must be between 1 and 9.', ephemeral: true });
      return;
    }

    await interaction.deferReply(); // give yourself time to build image

    try {
      const fullData = await fetchSheetData('Dashboard!A1:M43');
      const filtered = extractColumns(fullData, seed);
      const html = generateHTMLTable(filtered);
      const imageBuffer = await renderImageFromHTML(html);

      const { AttachmentBuilder } = require('discord.js');
      const attachment = new AttachmentBuilder(imageBuffer, { name: `dashboard-seed${seed}.png` });

      await interaction.editReply({
        content: `📊 Dashboard for Seed ${seed}`,
        files: [attachment],
      });
    } catch (err) {
      console.error('❌ Dashboard generation error:', err);
      await interaction.editReply({ content: '❌ Failed to generate dashboard.' });
    }
  }
});


client.login(process.env.DISCORD_TOKEN);
