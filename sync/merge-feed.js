#!/usr/bin/env node
/**
 * Voegt de verse (gefilterde) RostarCAS-feed samen met het bestaande schedule.ics,
 * zodat GEWERKTE diensten bewaard blijven ook nadat ze uit de feed zijn gevallen.
 *
 * Gebruik: node merge-feed.js <bestaand.ics> <vers.ics> <output.ics> [referentiedatumISO]
 *
 * Achtergrond: de RostarCAS-feed is een schuivend venster (±1 week terug t/m ±1 maand
 * vooruit). Het oude gedrag overschreef schedule.ics volledig met de feed, waardoor
 * voorbije diensten verdwenen zodra ze uit dat venster vielen. Voor de urenadministratie
 * moeten gewerkte diensten echter blijven staan.
 *
 * Samenvoegregels (UID is de stabiele sleutel; RostarCAS-diensten hebben UID "T_..."):
 *   - VERLEDEN dienst (DTEND < nu) uit het bestaande bestand -> ALTIJD behouden (bevriezen),
 *     ook als de verse feed hem niet meer levert.
 *   - Alles uit de VERSE feed -> overnemen (actuele waarheid voor het venster). Bij gelijke
 *     UID wint de verse versie, zodat correcties op recente/toekomstige diensten doorkomen.
 *   - TOEKOMSTIGE dienst die WEL in het oude bestand stond maar NIET meer in de verse feed
 *     -> weglaten (geannuleerd/verschoven). Alleen de toekomst spiegelt de feed; het verleden
 *     wordt bevroren.
 *
 * Stabiliteit: events worden deterministisch gesorteerd (op starttijd, dan UID) en elke
 * DTSTAMP wordt op een vaste waarde gezet. Zo wijzigt schedule.ics alleen bij een ECHTE
 * roosterwijziging en niet bij elke 10-minuten-sync (anders 140+ ruis-commits per dag).
 *
 * Vangnet: levert de verse feed 0 diensten op, dan blijft het bestaande bestand
 * ongewijzigd (liever de bestaande historie behouden dan een leeg rooster wegschrijven).
 */
const fs = require('fs');

const VASTE_DTSTAMP = 'DTSTAMP:20000101T000000Z';

// Splitst een ICS-tekst in: header (t/m VTIMEZONE, vóór de eerste VEVENT),
// een lijst VEVENT-blokken, en de footer (END:VCALENDAR e.d.).
function parseIcs(ics) {
  const lines = ics.split(/\r\n|\n|\r/);
  const header = [];
  const events = [];
  const footer = [];
  let block = null;
  let zienEersteEvent = false;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      zienEersteEvent = true;
      block = [line];
      continue;
    }
    if (block) {
      block.push(line);
      if (line.startsWith('END:VEVENT')) {
        events.push(block);
        block = null;
      }
      continue;
    }
    // Buiten een VEVENT-blok: vóór het eerste event = header, erna = footer.
    if (!zienEersteEvent) header.push(line);
    else footer.push(line);
  }
  return { header, events, footer };
}

// Leest UID en de relevante tijden uit een VEVENT-blok.
function eventInfo(block) {
  let uid = '', dtstart = '', dtend = '';
  for (const l of block) {
    if (l.startsWith('UID:')) uid = l.slice(4).trim();
    else if (l.startsWith('DTSTART')) dtstart = l.split(':').pop().trim();
    else if (l.startsWith('DTEND')) dtend = l.split(':').pop().trim();
  }
  return { uid, dtstart, dtend };
}

// Zet een ICS-datumstring (YYYYMMDD of YYYYMMDDTHHMMSS[Z]) om naar epoch-ms (UTC).
function icsNaarEpoch(s) {
  if (!s) return NaN;
  const y = +s.slice(0, 4), mo = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  if (s.includes('T')) {
    const h = +s.slice(9, 11), mi = +s.slice(11, 13), se = +(s.slice(13, 15) || 0);
    return Date.UTC(y, mo, d, h, mi, se);
  }
  return Date.UTC(y, mo, d);
}

// Het einde van een dienst (val terug op start als DTEND ontbreekt).
function eindEpoch(info) {
  const e = icsNaarEpoch(info.dtend);
  return Number.isNaN(e) ? icsNaarEpoch(info.dtstart) : e;
}

// Vervangt de DTSTAMP-regel in een blok door de vaste waarde (voorkomt ruis-commits).
function normaliseerDtstamp(block) {
  return block.map(l => (l.startsWith('DTSTAMP') ? VASTE_DTSTAMP : l));
}

function merge(bestaandIcs, versIcs, refMs) {
  const vers = parseIcs(versIcs);

  // Vangnet: lege/ongeldige verse feed -> bestaande historie ongemoeid laten.
  if (vers.events.length === 0) {
    return { ics: bestaandIcs, kept: null, vangnet: true };
  }

  const bestaand = bestaandIcs ? parseIcs(bestaandIcs) : { header: [], events: [], footer: [] };

  // UID -> blok. Eerst de bevroren verleden-diensten uit het oude bestand.
  const perUid = new Map();
  let bevroren = 0;
  for (const block of bestaand.events) {
    const info = eventInfo(block);
    if (!info.uid) continue;
    if (eindEpoch(info) < refMs) {
      perUid.set(info.uid, block);
      bevroren++;
    }
  }
  // Daarna de verse feed: actuele waarheid, wint bij gelijke UID.
  for (const block of vers.events) {
    const info = eventInfo(block);
    if (!info.uid) continue;
    perUid.set(info.uid, block);
  }

  // Deterministisch sorteren op (starttijd, UID) voor stabiele diffs.
  const samengevoegd = [...perUid.values()].sort((a, b) => {
    const ia = eventInfo(a), ib = eventInfo(b);
    const sa = icsNaarEpoch(ia.dtstart), sb = icsNaarEpoch(ib.dtstart);
    if (sa !== sb) return sa - sb;
    return ia.uid < ib.uid ? -1 : ia.uid > ib.uid ? 1 : 0;
  });

  // Header/footer van de verse feed (actuele VTIMEZONE). Footer terugbrengen tot
  // de afsluitende regels (verwijder eventuele lege staartregels, voeg END:VCALENDAR toe).
  const header = vers.header.length ? vers.header : bestaand.header;
  let footer = vers.footer.filter(l => l.trim().length > 0);
  if (!footer.some(l => l.startsWith('END:VCALENDAR'))) footer.push('END:VCALENDAR');

  const out = [
    ...header,
    ...samengevoegd.flatMap(normaliseerDtstamp),
    ...footer,
  ];
  const ics = out.join('\r\n').replace(/\r?\n*$/, '\r\n');
  return { ics, kept: samengevoegd.length, bevroren, versAantal: vers.events.length, vangnet: false };
}

const [, , bestaandPath, versPath, outPath, refArg] = process.argv;
if (!bestaandPath || !versPath || !outPath) {
  console.error('Gebruik: node merge-feed.js <bestaand.ics> <vers.ics> <output.ics> [referentiedatumISO]');
  process.exit(1);
}

const refMs = refArg ? Date.parse(refArg) : Date.now();
if (Number.isNaN(refMs)) { console.error('Ongeldige referentiedatum: ' + refArg); process.exit(1); }

const versIcs = fs.readFileSync(versPath, 'utf8');
if (!versIcs.includes('BEGIN:VCALENDAR')) { console.error('Geen geldige ICS in ' + versPath); process.exit(1); }
const bestaandIcs = fs.existsSync(bestaandPath) ? fs.readFileSync(bestaandPath, 'utf8') : '';

const res = merge(bestaandIcs, versIcs, refMs);

if (res.vangnet) {
  if (bestaandIcs) {
    fs.writeFileSync(outPath, bestaandIcs.replace(/\r?\n/g, '\r\n'), 'utf8');
    console.warn('WAARSCHUWING: verse feed had 0 diensten; bestaande historie behouden.');
  } else {
    console.error('Verse feed leeg en geen bestaand bestand; niets geschreven.');
    process.exit(1);
  }
} else {
  fs.writeFileSync(outPath, res.ics, 'utf8');
  console.log(`Merge klaar: ${res.kept} diensten in schedule.ics ` +
    `(${res.bevroren} bevroren uit historie + ${res.versAantal} uit verse feed, gededupliceerd) -> ${outPath}`);
}
