#!/usr/bin/env node
/**
 * Filtert de RostarCAS ICS-feed tot ALLEEN de echte werkdiensten.
 *
 * Gebruik: node filter-feed.js <input.ics> <output.ics>
 *
 * Achtergrond: RostarCAS levert per werkdag meerdere VEVENTs door elkaar:
 *   - de ECHTE dienst       -> UID "T_...", met LOCATION (bv. "SCHIPHOL Aankomstpassage 1")
 *                              SUMMARY zoals "COL VF3 Man/DTL/Beveiliger"
 *   - toeslag "Vroege opkomst" -> UID "EC_...", geen LOCATION
 *   - "Roostervrij*"           -> UID "EC_...", geen LOCATION
 *   - "TV 04" / "TV 07"        -> UID "E_...",  geen LOCATION
 *   - een "Yes"-marker         -> UID "P_...",  geen LOCATION
 *
 * Alleen de echte dienst is relevant voor het dashboard. We behouden een VEVENT
 * dus als het een dienst-UID (T_) heeft OF een ingevulde LOCATION. Al het andere
 * (toeslagen, markers, roostervrij) valt weg.
 *
 * Vangnet: levert de filter onverhoopt 0 diensten op terwijl de feed wel events
 * had, dan geven we de ONGEFILTERDE feed terug (liever ruis dan een leeg rooster).
 */
const fs = require('fs');

function isRealShift(blockLines) {
  let uid = '', location = '';
  for (const l of blockLines) {
    if (l.startsWith('UID:')) uid = l.slice(4).trim();
    else if (l.startsWith('LOCATION:')) location = l.slice(9).trim();
  }
  return uid.startsWith('T_') || location.length > 0;
}

function filterFeed(ics) {
  const lines = ics.split(/\r\n|\n|\r/);
  const out = [];
  let block = null;
  let removed = 0, kept = 0;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { block = [line]; continue; }
    if (block) {
      block.push(line);
      if (line.startsWith('END:VEVENT')) {
        if (isRealShift(block)) { out.push(...block); kept++; }
        else removed++;
        block = null;
      }
      continue;
    }
    out.push(line);
  }
  return { ics: out.join('\r\n').replace(/\r?\n*$/, '\r\n'), removed, kept };
}

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error('Gebruik: node filter-feed.js <input.ics> <output.ics>'); process.exit(1); }

const raw = fs.readFileSync(inPath, 'utf8');
if (!raw.includes('BEGIN:VCALENDAR')) { console.error('Geen geldige ICS-feed in ' + inPath); process.exit(1); }

const totalEvents = (raw.match(/BEGIN:VEVENT/g) || []).length;
let { ics, removed, kept } = filterFeed(raw);

if (kept === 0 && totalEvents > 0) {
  console.warn('WAARSCHUWING: 0 echte diensten herkend; ongefilterde feed behouden als vangnet.');
  ics = raw.replace(/\r?\n/g, '\r\n');
  kept = totalEvents; removed = 0;
}

// DTSTAMP is de genereertijd van de feed en verandert bij ELKE ophaling. Zonder dit
// zou schedule.ics bij iedere sync wijzigen en een nutteloze commit veroorzaken
// (bij een 10-minuten-cron zo'n 140+ commits per dag). We zetten DTSTAMP op een vaste
// waarde, zodat het bestand alleen wijzigt bij een ECHTE roosterwijziging. Het
// dashboard gebruikt DTSTAMP niet (alleen DTSTART/DTEND/SUMMARY).
ics = ics.replace(/DTSTAMP:[^\r\n]*/g, 'DTSTAMP:20000101T000000Z');

fs.writeFileSync(outPath, ics, 'utf8');
console.log(`Filter klaar: ${kept} echte diensten behouden, ${removed} ruis-events verwijderd -> ${outPath}`);
