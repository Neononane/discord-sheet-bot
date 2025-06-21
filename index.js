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
  const seedStart = 1; // column B
  const seedEnd = seedStart + seedNumber - 1;

  return values
    .map((row, rowIndex) => {
      const baseCols = [row[0]]; // Racer (column A)
      const seeds = row.slice(seedStart, seedEnd + 1);
      const racesPlayed = row[10] || '';
      const top4Total = row[11] || '';
      const badge = row[12] || '';

      const showExtras = seedNumber >= 4;

      const extracted = showExtras
        ? [...baseCols, ...seeds, racesPlayed, top4Total, badge]
        : [...baseCols, ...seeds, racesPlayed];

      if (rowIndex === 0) {
        // Label columns for downstream logic
        return extracted.map((cell, i) => {
          if (showExtras) {
            if (i === extracted.length - 3) return 'Races Played';
            if (i === extracted.length - 2) return 'Top 4 Total';
            if (i === extracted.length - 1) return 'Badge';
          } else {
            if (i === extracted.length - 1) return 'Races Played';
          }
          return cell;
        });
      }

      // Skip rows with no racer name
      if (!row[0]) return null;

      return extracted;
    })
    .filter(row => row !== null);
}



async function renderImageFromHTML(htmlContent) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const dimensions = await page.evaluate(() => ({
    width: document.body.scrollWidth,
    height: document.body.scrollHeight,
  }));

  await page.setViewport({
    width: Math.min(dimensions.width + 40, 2000),
    height: Math.min(dimensions.height + 40, 4000),
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

  // Style seed columns B–J (indexes 1–9)
  const isSeedColumn = colIndex >= 1 && colIndex <= 9;

  // Style Top 4 Total column (L / index 11)
  const top4HeaderIndex = values[0].indexOf('Top 4 Total');
  const isTop4TotalColumn = colIndex === top4HeaderIndex;


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

    if (num <= 7 && num >= 0.5) {
      const intensity = Math.floor(255 - (num / 7) * 150); // 105–255
      const bg = `rgb(${intensity}, ${intensity}, 255)`;
      return `<td style="background-color:${bg};color:#000;">${value}</td>`;
    }
  }

  if (isTop4TotalColumn) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      const gradient = Math.floor((num / 40) * 100); // Assume 40 is max theoretical score
      const bg = `linear-gradient(to right, #88f 0%, #88f ${gradient}%, transparent ${gradient}%)`;
      return `<td style="background: ${bg}; color: #fff;">${value}</td>`;
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
          .score10 { background-color: #ffd700; font-weight: bold; color: #000; }
          .score9 { background-color: #c0c0c0; font-weight: bold; color: #000; }
          .score8 { background-color: #cd7f32; font-weight: bold; color: #000; }
          .no-race { color: #f44; font-weight: bold; text-align: center; background-color: #330000; }
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

// STEP 2: Load remaining dependencies
require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { google } = require('googleapis');

// STEP 3: Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const SHEET_ID = process.env.SHEET_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

// STEP 4: Google Sheets client
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// STEP 5: Sheet fetch
async function fetchSheetData(range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: range,
  });
  return response.data.values;
}

// STEP 6: On ready, send dashboard
client.once('ready', async () => {
  console.log(`✅ Bot ready as ${client.user.tag}`);
  try {
    const raw = await fetchSheetData('Dashboard!A1:M43');
    const filtered = extractColumns(raw, 9); // default to all seeds
    const html = generateHTMLTable(filtered);
    const imageBuffer = await renderImageFromHTML(html);
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

// STEP 7: Slash command handler
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

      // Sort by seed score (colIndex = seed), fallback to Top 4 Total (last col)
      const headers = filtered.shift(); // keep headers safe
      const seedCol = seed; // A is 0, so Seed 1 = index 1, etc.
      const top4Col = seed >= 4 ? filtered[0].length - 2 : null; // 2nd to last column if included

      filtered.sort((a, b) => {
        const aSeed = parseFloat(a[seedCol]) || 0;
        const bSeed = parseFloat(b[seedCol]) || 0;
        if (bSeed !== aSeed) return bSeed - aSeed;

        if (top4Col !== null) {
          const aTop4 = parseFloat(a[top4Col]) || 0;
          const bTop4 = parseFloat(b[top4Col]) || 0;
          return bTop4 - aTop4;
        }
        return 0;
      });

      const html = generateHTMLTable([headers, ...filtered]);
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
