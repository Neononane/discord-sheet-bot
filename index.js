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
  const seedStart = 1; // B is index 1 (0-based), so Seed 1 is at index 1
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
  const htmlRows = values.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => {
      let value = cell?.toString().trim() || '';
      const isHeader = rowIndex === 0;

      // Style seed columns (everything except Racer and summary columns)
      const isSeedColumn = colIndex > 0 && colIndex <= 9;

      if (isHeader) {
        return `<th>${value || ''}</th>`;
      }

      if (isSeedColumn) {
        if (!value) {
          return `<td class="no-race">✘</td>`;
        }

        const num = parseFloat(value);
        if (num === 10) return `<td class="score10">${value}</td>`;
        if (num === 9) return `<td class="score9">${value}</td>`;
        if (num === 8) return `<td class="score8">${value}</td>`;

        // Gradient from 7 → 0.5
        if (num <= 7 && num >= 0.5) {
          const intensity = Math.floor(255 - (num / 7) * 150); // 105–255
          const bg = `rgb(${intensity}, ${intensity}, 255)`;
          return `<td style="background-color:${bg};color:#000;">${value}</td>`;
        }
      }

      return `<td>${value || ''}</td>`;
    });

    return `<tr>${cells.join('')}</tr>`;
  });

  return `
    <html>
      <head>
        <style>
          body {
            background: linear-gradient(to bottom, #0d1b2a, #1b263b);
            color: #ffffff;
            font-family: 'Segoe UI', sans-serif;
            padding: 40px;
            margin: 0;
          }
          h2 {
            color: #ffffff;
            font-size: 32px;
            margin-bottom: 20px;
            text-align: center;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background-color: #1b263b;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 0 15px rgba(255, 255, 255, 0.05);
          }
          th {
            background-color: #112030;
            color: #fcbf49;
            font-weight: 600;
            padding: 12px;
            text-align: left;
            border-bottom: 2px solid #334e68;
          }
          td {
            padding: 12px;
            border-bottom: 1px solid #334e68;
          }
          tr:nth-child(even) {
            background-color: #1f2d3d;
          }

          /* Highlights */
          .score10 {
            background-color: #ffd700; /* gold */
            font-weight: bold;
            color: #000;
          }
          .score9 {
            background-color: #c0c0c0; /* silver */
            font-weight: bold;
            color: #000;
          }
          .score8 {
            background-color: #cd7f32; /* bronze */
            font-weight: bold;
            color: #000;
          }

          .no-race {
            color: #f44;
            font-weight: bold;
            text-align: center;
            background-color: #330000;
          }
        </style>
      </head>
      <body>
        <h2>Rookie Rumble Dashboard</h2>
        <table>
          ${htmlRows.join('')}
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
