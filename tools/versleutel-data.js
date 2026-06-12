// Versleutelt de persoonlijke dashboard-gegevens voor de telefoonversie (GitHub Pages).
//
//   bron:        D:\Downloads\Dasboard\mijn_herstel_dashboard.json   (blijft lokaal, staat in .gitignore)
//   wachtwoord:  D:\Downloads\Dasboard\telefoon-wachtwoord.txt       (blijft lokaal)
//   uitvoer:     mijn_herstel_dashboard.enc.json                     (mag wél in de publieke repo)
//
// AES-256-GCM met een PBKDF2-SHA256-sleutel (600.000 iteraties). Het uitvoerformaat is
// direct leesbaar voor de Web Crypto API in de browser (ciphertext eindigt op de GCM-tag).
//
// Gebruik:  node tools/versleutel-data.js
// Daarna committen en pushen; de app op de telefoon vraagt bij een eerste start het
// wachtwoord en laadt dan deze gegevens.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BRON = 'D:/Downloads/Dasboard/mijn_herstel_dashboard.json';
const WACHTWOORD_BESTAND = 'D:/Downloads/Dasboard/telefoon-wachtwoord.txt';
const DOEL = path.join(__dirname, '..', 'mijn_herstel_dashboard.enc.json');
const ITERATIES = 600000;

const wachtwoord = fs.readFileSync(WACHTWOORD_BESTAND, 'utf8').split(/\r?\n/)[0].trim();
if (!wachtwoord) throw new Error('Geen wachtwoord gevonden in ' + WACHTWOORD_BESTAND);

const data = fs.readFileSync(BRON);
JSON.parse(data); // valideer dat de bron geldige JSON is

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const sleutel = crypto.pbkdf2Sync(wachtwoord, salt, ITERATIES, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', sleutel, iv);
const versleuteld = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);

fs.writeFileSync(DOEL, JSON.stringify({
    versie: 1,
    kdf: 'PBKDF2-SHA256',
    iteraties: ITERATIES,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: versleuteld.toString('base64'),
}, null, 2));

console.log('Geschreven:', DOEL);
console.log('Bron:', data.length, 'bytes ->', versleuteld.length, 'bytes versleuteld');
