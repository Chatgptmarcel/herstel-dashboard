// Test: ontsleutelt mijn_herstel_dashboard.enc.json met exact dezelfde Web Crypto API-stappen
// als de browser (index.html) uitvoert. Slaagt dit, dan werkt de telefoon-flow ook.
//
// Gebruik:  node tools/test-ontsleutel.js
const fs = require('fs');
const path = require('path');

const pakket = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mijn_herstel_dashboard.enc.json'), 'utf8'));
const wachtwoord = fs.readFileSync('D:/Downloads/Dasboard/telefoon-wachtwoord.txt', 'utf8').split(/\r?\n/)[0].trim();

// Identiek aan de functie in index.html (Web Crypto, ook beschikbaar in Node 19+)
const ontsleutel = async (pakket, wachtwoord) => {
    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const basis = await crypto.subtle.importKey('raw', new TextEncoder().encode(wachtwoord), 'PBKDF2', false, ['deriveKey']);
    const sleutel = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: b64(pakket.salt), iterations: pakket.iteraties, hash: 'SHA-256' },
        basis, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const klaar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(pakket.iv) }, sleutel, b64(pakket.data));
    return JSON.parse(new TextDecoder().decode(klaar));
};

(async () => {
    const data = await ontsleutel(pakket, wachtwoord);
    console.log('Ontsleuteld OK');
    console.log('shifts-dagen:', Object.keys(data.shifts || {}).length);
    console.log('sobriety:', (data.sobriety || []).length);
    console.log('armHistory:', (data.armHistory || []).length);
    console.log('minoxStart:', data.minoxStart);

    // Fout wachtwoord moet falen
    try {
        await ontsleutel(pakket, 'fout-wachtwoord');
        console.error('FOUT: ontsleutelen met verkeerd wachtwoord had moeten falen!');
        process.exit(1);
    } catch (e) {
        console.log('Verkeerd wachtwoord wordt correct geweigerd');
    }
})();
