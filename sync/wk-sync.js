#!/usr/bin/env node
/**
 * Zet de openfootball-bron voor het WK 2026 om naar een schone wk-data.json die het
 * dashboard rechtstreeks kan tonen.
 *
 * Gebruik: node wk-sync.js <bron.json> <output.json>
 *   bron.json  = ruwe download van
 *                https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
 *   output.json= wk-data.json in de repo-root
 *
 * Wat dit script doet:
 *   1) Vertaalt landen naar het Nederlands en knockout-plaatshouders (1A, 2B, 3A/B/..,
 *      W73, L101) naar leesbare tekst ("Winnaar groep A", "Beste 3e (A/B/..)", ...).
 *   2) Rekent per groep de stand uit (punten, saldo, doelpunten) met de FIFA-WK-
 *      tiebreakers: eerst totaal (punten -> saldo -> doelpunten voor), daarna onderling
 *      resultaat tussen gelijk geëindigde teams. Als laatste, stabiele tiebreak: naam.
 *   3) Maakt de ranglijst van de groepsderden (de 8 beste gaan door in het 48-landenformat).
 *   4) Zet aftraptijden om naar een echte UTC-tijdstempel, zodat het dashboard ze in
 *      Nederlandse tijd kan tonen.
 *
 * Determinisme: gelijke invoer levert byte-voor-byte gelijke uitvoer (geen tijdstempel in
 * het bestand, stabiele sortering). Zo committeert de GitHub Action alleen bij een ECHTE
 * wijziging en niet elk uur opnieuw.
 *
 * Vangnet: is de bron leeg/ongeldig of bevat hij 0 wedstrijden, dan blijft een bestaande
 * output ongemoeid (liever de laatst bekende data houden dan een leeg bestand wegschrijven).
 */
const fs = require('fs');

// --- Landen: Engels (openfootball) -> Nederlands ---------------------------------
const LAND_NL = {
  'Algeria': 'Algerije', 'Argentina': 'Argentinië', 'Australia': 'Australië',
  'Austria': 'Oostenrijk', 'Belgium': 'België', 'Bosnia & Herzegovina': 'Bosnië en Herzegovina',
  'Brazil': 'Brazilië', 'Canada': 'Canada', 'Cape Verde': 'Kaapverdië', 'Colombia': 'Colombia',
  'Croatia': 'Kroatië', 'Curaçao': 'Curaçao', 'Czech Republic': 'Tsjechië', 'DR Congo': 'DR Congo',
  'Ecuador': 'Ecuador', 'Egypt': 'Egypte', 'England': 'Engeland', 'France': 'Frankrijk',
  'Germany': 'Duitsland', 'Ghana': 'Ghana', 'Haiti': 'Haïti', 'Iran': 'Iran', 'Iraq': 'Irak',
  'Ivory Coast': 'Ivoorkust', 'Japan': 'Japan', 'Jordan': 'Jordanië', 'Mexico': 'Mexico',
  'Morocco': 'Marokko', 'Netherlands': 'Nederland', 'New Zealand': 'Nieuw-Zeeland',
  'Norway': 'Noorwegen', 'Panama': 'Panama', 'Paraguay': 'Paraguay', 'Portugal': 'Portugal',
  'Qatar': 'Qatar', 'Saudi Arabia': 'Saoedi-Arabië', 'Scotland': 'Schotland', 'Senegal': 'Senegal',
  'South Africa': 'Zuid-Afrika', 'South Korea': 'Zuid-Korea', 'Spain': 'Spanje', 'Sweden': 'Zweden',
  'Switzerland': 'Zwitserland', 'Tunisia': 'Tunesië', 'Turkey': 'Turkije', 'USA': 'Verenigde Staten',
  'Uruguay': 'Uruguay', 'Uzbekistan': 'Oezbekistan',
};

// --- Rondes (knockout): Engels -> Nederlands -------------------------------------
const RONDE_NL = {
  'Round of 32': 'Ronde van 32', 'Round of 16': 'Achtste finale', 'Quarter-final': 'Kwartfinale',
  'Semi-final': 'Halve finale', 'Match for third place': 'Troostfinale', 'Final': 'Finale',
};

// Volgorde van de knockoutrondes (voor sorteren/tonen).
const KO_VOLGORDE = ['Ronde van 32', 'Achtste finale', 'Kwartfinale', 'Halve finale', 'Troostfinale', 'Finale'];

// Zet één teamnaam/plaatshouder om naar leesbaar Nederlands.
function teamNaar(naam) {
  if (naam == null) return '';
  if (LAND_NL[naam]) return LAND_NL[naam];                 // bekend land
  let m;
  if ((m = naam.match(/^1([A-L])$/))) return `Winnaar groep ${m[1]}`;
  if ((m = naam.match(/^2([A-L])$/))) return `Nummer 2 groep ${m[1]}`;
  if ((m = naam.match(/^3([A-L](?:\/[A-L])+)$/))) return `Beste 3e (${m[1]})`;
  if ((m = naam.match(/^W(\d+)$/))) return `Winnaar wedstrijd ${m[1]}`;
  if ((m = naam.match(/^L(\d+)$/))) return `Verliezer wedstrijd ${m[1]}`;
  return naam; // valt terug op de ruwe waarde (bv. een al ingevuld land dat niet in de map staat)
}

// "13:00 UTC-6" + "2026-06-11" -> ISO-UTC-tijdstempel ("2026-06-11T19:00:00.000Z").
function aftrapNaarUtc(datum, tijd) {
  if (!datum) return null;
  const md = datum.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!md) return null;
  const [, y, mo, d] = md.map(Number);
  let h = 0, mi = 0, off = 0;
  const mt = (tijd || '').match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})$/);
  if (mt) { h = +mt[1]; mi = +mt[2]; off = +mt[3]; }
  // Lokale tijd = UTC + offset  =>  UTC = lokaal - offset. Date.UTC normaliseert dag-overloop.
  return new Date(Date.UTC(y, mo - 1, d, h - off, mi)).toISOString();
}

// Lege statistiek-regel voor een team.
function legeStat(team) {
  return { team, gespeeld: 0, w: 0, g: 0, v: 0, dv: 0, dt: 0, saldo: 0, punten: 0 };
}

// Verwerk één gespeelde wedstrijd in de statistiek van beide teams.
function verwerk(stat, team, voor, tegen) {
  const s = stat[team];
  s.gespeeld++; s.dv += voor; s.dt += tegen; s.saldo = s.dv - s.dt;
  if (voor > tegen) { s.w++; s.punten += 3; }
  else if (voor === tegen) { s.g++; s.punten += 1; }
  else { s.v++; }
}

// Vergelijk op totaalcriteria: punten -> saldo -> doelpunten voor (alle aflopend).
function totaalCmp(a, b) {
  return b.punten - a.punten || b.saldo - a.saldo || b.dv - a.dv;
}

// Bereken de stand van één groep uit zijn wedstrijden (met onderling-resultaat-tiebreak).
function groepsstand(wedstrijden) {
  const stat = {};
  const teams = [...new Set(wedstrijden.flatMap(w => [w.team1, w.team2]))];
  teams.forEach(t => { stat[t] = legeStat(t); });
  for (const w of wedstrijden) {
    if (w.score && w.score.ft) {
      verwerk(stat, w.team1, w.score.ft[0], w.score.ft[1]);
      verwerk(stat, w.team2, w.score.ft[1], w.score.ft[0]);
    }
  }
  // Eerste sortering op totaal, met naam als stabiele laatste tiebreak.
  let rij = Object.values(stat).sort((a, b) => totaalCmp(a, b) || a.team.localeCompare(b.team, 'nl'));

  // Onderling resultaat binnen clusters die op (punten, saldo, dv) exact gelijk zijn.
  const uit = [];
  for (let i = 0; i < rij.length;) {
    let j = i + 1;
    while (j < rij.length && totaalCmp(rij[i], rij[j]) === 0) j++;
    const cluster = rij.slice(i, j);
    if (cluster.length > 1) ordenOnderling(cluster, wedstrijden);
    uit.push(...cluster);
    i = j;
  }
  return uit.map((s, idx) => ({ ...s, positie: idx + 1 }));
}

// Herorden een cluster gelijke teams op hun ONDERLINGE wedstrijden.
function ordenOnderling(cluster, alleWedstrijden) {
  const namen = new Set(cluster.map(s => s.team));
  const mini = {};
  cluster.forEach(s => { mini[s.team] = legeStat(s.team); });
  for (const w of alleWedstrijden) {
    if (w.score && w.score.ft && namen.has(w.team1) && namen.has(w.team2)) {
      verwerk(mini, w.team1, w.score.ft[0], w.score.ft[1]);
      verwerk(mini, w.team2, w.score.ft[1], w.score.ft[0]);
    }
  }
  cluster.sort((a, b) => totaalCmp(mini[a.team], mini[b.team]) || a.team.localeCompare(b.team, 'nl'));
}

function transform(bron) {
  const ruwe = Array.isArray(bron.matches) ? bron.matches : [];

  // 1) Normaliseer elke wedstrijd naar het dashboard-schema.
  const wedstrijden = ruwe.map((m, i) => {
    const isGroep = !!m.group;
    const groepLetter = isGroep ? String(m.group).replace(/^Group\s+/, '') : null;
    const ronde = isGroep ? `Groep ${groepLetter}` : (RONDE_NL[m.round] || m.round);
    const vert = (lst) => Array.isArray(lst)
      ? lst.map(g => ({ naam: g.name, minuut: g.minute, ...(g.penalty ? { strafschop: true } : {}), ...(g.owngoal ? { eigendoelpunt: true } : {}) }))
      : [];
    return {
      id: i,
      fase: isGroep ? 'groep' : 'knockout',
      ronde,
      groep: groepLetter,
      datum: m.date || null,
      aftrapUtc: aftrapNaarUtc(m.date, m.time),
      stadion: m.ground || null,
      team1: teamNaar(m.team1),
      team2: teamNaar(m.team2),
      score: (m.score && m.score.ft) ? { ft: m.score.ft, ht: (m.score.ht || null) } : null,
      goals1: vert(m.goals1),
      goals2: vert(m.goals2),
    };
  });

  // 2) Groepen A..L met berekende stand.
  const letters = [...new Set(wedstrijden.filter(w => w.groep).map(w => w.groep))].sort();
  const groepen = letters.map(id => {
    const eigen = wedstrijden.filter(w => w.groep === id);
    const stand = groepsstand(eigen).map(s => ({
      ...s,
      status: s.positie <= 2 ? 'direct' : (s.positie === 3 ? 'derde' : null),
    }));
    return { id, stand };
  });

  // 3) Ranglijst groepsderden: de 8 beste gaan door (nieuw 48-landenformat).
  const derden = groepen
    .map(g => { const d = g.stand.find(s => s.positie === 3); return d ? { groep: g.id, ...d } : null; })
    .filter(Boolean)
    .sort((a, b) => totaalCmp(a, b) || a.team.localeCompare(b.team, 'nl'))
    .map((d, idx) => ({
      groep: d.groep, team: d.team, gespeeld: d.gespeeld, punten: d.punten,
      saldo: d.saldo, dv: d.dv, positie: idx + 1, geplaatst: idx < 8,
    }));

  // 4) Sorteer alle wedstrijden chronologisch (voor het speelschema).
  wedstrijden.sort((a, b) =>
    String(a.aftrapUtc).localeCompare(String(b.aftrapUtc)) || a.id - b.id);

  return {
    naam: 'WK 2026',
    bron: 'openfootball/worldcup.json',
    aantalWedstrijden: wedstrijden.length,
    aantalGespeeld: wedstrijden.filter(w => w.score).length,
    groepen,
    derden,
    wedstrijden,
  };
}

// --- CLI -------------------------------------------------------------------------
const [, , bronPath, outPath] = process.argv;
if (!bronPath || !outPath) {
  console.error('Gebruik: node wk-sync.js <bron.json> <output.json>');
  process.exit(1);
}

let bron;
try {
  bron = JSON.parse(fs.readFileSync(bronPath, 'utf8'));
} catch (e) {
  bron = null;
}

// Vangnet: ongeldige/lege bron -> bestaande output behouden.
if (!bron || !Array.isArray(bron.matches) || bron.matches.length === 0) {
  if (fs.existsSync(outPath)) {
    console.warn('WAARSCHUWING: bron leeg/ongeldig; bestaande wk-data.json behouden.');
    process.exit(0);
  }
  console.error('Bron leeg/ongeldig en geen bestaande output; niets geschreven.');
  process.exit(1);
}

const data = transform(bron);
const json = JSON.stringify(data, null, 2);
fs.writeFileSync(outPath, json + '\n', 'utf8');

// Ook een wk-data.js schrijven (window.WK_DATA). Nodig voor file:// (lokale kopie
// gezondheid.html), waar fetch geblokkeerd is — net als schedule-data.js voor het rooster.
const jsPath = outPath.replace(/\.json$/, '.js');
fs.writeFileSync(jsPath, 'window.WK_DATA = ' + json + ';\n', 'utf8');

console.log(`wk-data.json + wk-data.js geschreven: ${data.aantalWedstrijden} wedstrijden, ` +
  `${data.aantalGespeeld} gespeeld, ${data.groepen.length} groepen.`);
