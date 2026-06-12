// End-to-end test van de telefoon-flow op de live GitHub Pages-site:
//  1. opent de site op telefoonformaat (Galaxy-achtig viewport)
//  2. beantwoordt de wachtwoordprompt met het wachtwoord uit telefoon-wachtwoord.txt
//  3. controleert dat de gegevens in localStorage geladen zijn
//  4. maakt een screenshot van het resultaat
//
// Gebruik:  node tools/test-telefoon-flow.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('C:/Users/marce/AppData/Roaming/npm/node_modules/playwright');

const URL = 'https://chatgptmarcel.github.io/herstel-dashboard/';
const WACHTWOORD = fs.readFileSync('D:/Downloads/Dasboard/telefoon-wachtwoord.txt', 'utf8').split(/\r?\n/)[0].trim();
const SCREENSHOT = path.join(os.tmpdir(), 'dashboard-telefoon-flow.png');

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    });
    const page = await ctx.newPage();

    let promptGezien = false;
    page.on('dialog', async (d) => {
        if (d.type() === 'prompt') { promptGezien = true; await d.accept(WACHTWOORD); }
        else await d.dismiss();
    });

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(15000); // Babel-compilatie + PBKDF2 (600k iteraties) + render

    const status = await page.evaluate(() => ({
        seedVlag: localStorage.getItem('_seed_json_geladen'),
        shiftsDagen: Object.keys(JSON.parse(localStorage.getItem('dashboard_manual_shifts') || '{}')).length,
        sobriety: (JSON.parse(localStorage.getItem('sobriety_history') || '[]')).length,
        armHistory: (JSON.parse(localStorage.getItem('arm_history') || '[]')).length,
        minoxStart: localStorage.getItem('minox_start_date'),
        kopAanwezig: !!document.querySelector('h1'),
    }));

    console.log('Wachtwoordprompt verschenen:', promptGezien);
    console.log('Seed-vlag:', status.seedVlag);
    console.log('Dagen met notities/diensten:', status.shiftsDagen);
    console.log('Nuchterheids-periodes:', status.sobriety);
    console.log('Arm-periodes:', status.armHistory);
    console.log('Minoxidil-start:', status.minoxStart);
    console.log('Dashboard gerenderd (h1):', status.kopAanwezig);

    await page.screenshot({ path: SCREENSHOT, fullPage: false });
    console.log('Screenshot:', SCREENSHOT);

    await browser.close();
    const ok = promptGezien && status.seedVlag === '1' && status.shiftsDagen > 100 && status.kopAanwezig;
    console.log(ok ? 'TEST GESLAAGD' : 'TEST GEFAALD');
    process.exit(ok ? 0 : 1);
})();
