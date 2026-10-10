const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const Babel = require('@babel/standalone');
// Alleen fictieve gegevens; geen netwerk, Firebase, echte kalender of lokale loonbestanden.
const source = require('node:path').resolve(__dirname, '..');
const html = fs.readFileSync(`${source}/index.html`, 'utf8');
const app = html.match(/<script type="text\/babel" data-type="module">([\s\S]*?)<\/script>/)[1];
const code = Babel.transform(app, { presets: ['react'], plugins: ['transform-modules-commonjs'] }).code;
const profile = { geldigVanaf: '2026-01-01', geldigTot: '2026-12-27', uurloon: 20, contractUren: 0, pauzeNaMinuten: 330, pauzeMinuten: 30, pensioenPerUur: 1, paww: .001, fba: .000374, sociaalFonds: .0006125, whk: .0021, reiskostenPerDag: 10, feestdagen: [], verschuivingen: [], bewijsDatum: '2026-08-01' };
const ics = ['BEGIN:VCALENDAR',
 'BEGIN:VEVENT','UID:test-oud','DTSTART:20260908T070000Z','DTEND:20260908T110000Z','SUMMARY:Testdienst oud','END:VEVENT',
 'BEGIN:VEVENT','UID:test-nieuw','DTSTART:20261006T070000Z','DTEND:20261006T100000Z','SUMMARY:Testdienst nieuw','END:VEVENT',
 'BEGIN:VEVENT','UID:test-gepland','DTSTART:20261012T070000Z','DTEND:20261012T110000Z','SUMMARY:Testdienst gepland','END:VEVENT','END:VCALENDAR'].join('\n');
async function start({ hang = false, profiel = profile, ontvangen = '' } = {}) {
 const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://herstel.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
 const w = dom.window;
 w.MessageChannel = class { constructor() { this.port1 = {}; this.port2 = { postMessage: () => setImmediate(() => this.port1.onmessage()) }; } };
 let now = Date.parse('2026-10-09T08:00:00Z');
 const NativeDate = w.Date;
 w.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
 const intervals = new Map(); let count = 0; let pushes = 0;
 w.setInterval = (fn, ms) => { intervals.set(++count, { fn, ms }); return count; };
 w.clearInterval = id => intervals.delete(id);
 w.fetch = async url => String(url).startsWith('./schedule.ics')
   ? (hang ? new Promise(() => {}) : { ok: true, text: async () => ics })
   : { ok: true, json: async () => ({ daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }) };
 if (profiel) w.localStorage.setItem('dashboard_inkomen_profiel', JSON.stringify(profiel));
 if (ontvangen) w.localStorage.setItem('dashboard_ontvangen_betaaldag', ontvangen);
 const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
 w.eval(scripts.find(s => s.includes('window.SYNC_KEYS =')));
 assert.ok(w.SYNC_KEYS.includes('dashboard_ontvangen_betaaldag'));
 w.__syncRequestPush = () => { pushes++; };
 w.eval(fs.readFileSync(require.resolve('react').replace(/index\.js$/, 'umd/react.development.js'), 'utf8'));
 w.eval(fs.readFileSync(require.resolve('react-dom').replace(/index\.js$/, 'umd/react-dom.development.js'), 'utf8'));
 w.eval(fs.readFileSync(`${source}/inkomensraming.js`, 'utf8'));
 w.eval(fs.readFileSync(`${source}/loonbelasting-2026.js`, 'utf8'));
 w.IS_REACT_ACT_ENVIRONMENT = true;
 w.require = name => name === 'react' ? w.React : name === 'react-dom/client' ? w.ReactDOM : new Proxy({}, { get: (_, key) => key === '__esModule' ? true : () => null });
 await w.React.act(async () => { w.eval(code + '\nwindow.__testRoot = root;'); });
 const button = label => [...w.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
 const click = async label => { const b = button(label); assert.ok(b, label); await w.React.act(async () => b.click()); };
 return { w, button, click, period: () => w.document.querySelector('[data-testid="inkomen-periode"]').textContent,
  setTime: value => { now = Date.parse(value); }, pushes: () => pushes,
  tick: async () => w.React.act(async () => { for (const i of intervals.values()) if (i.ms === 60000) i.fn(); }),
  event: async type => w.React.act(async () => (type === 'visibilitychange' ? w.document : w).dispatchEvent(new w.Event(type))),
  close: async () => { await w.React.act(async () => w.__testRoot.unmount()); assert.equal(intervals.size, 0); w.close(); }
 };
}
(async () => {
 let a = await start();
 assert.match(a.period(), /9 okt.*P10/);
 const old = a.w.document.querySelector('[data-testid="inkomen-bedrag"]').textContent;
 await a.click('Betaling ontvangen');
 assert.match(a.period(), /6 nov.*P11/);
 assert.equal(a.w.localStorage.getItem('dashboard_ontvangen_betaaldag'), '2026-10-09');
 assert.equal(a.pushes(), 1);
 assert.equal(a.button('Betaling ontvangen'), undefined);
 assert.notEqual(a.w.document.querySelector('[data-testid="inkomen-bedrag"]').textContent, old);
 await a.click('Berekening bekijken');
 assert.match(a.w.document.querySelector('[data-testid="inkomen-periode-uitleg"]').textContent, /5 okt.*1 nov/);
 assert.ok(!a.w.document.querySelector('[data-testid="inkomen-uitleg"]').textContent.includes('Testdienst oud'));
 assert.ok(a.w.document.querySelector('[data-testid="inkomen-uitleg"]').textContent.includes('Testdienst nieuw'));
 await a.click('Ongedaan maken');
 assert.match(a.period(), /9 okt.*P10/);
 assert.equal(a.w.localStorage.getItem('dashboard_ontvangen_betaaldag'), '');
 assert.equal(a.pushes(), 2);
 await a.close();
 console.log('PASS: ontvangen -> nieuwe datum, diensten en bedrag; opgeslagen, sync aangevraagd; ongedaan maken');
 a = await start({ ontvangen: '2026-10-09' });
 assert.match(a.period(), /6 nov.*P11/);
 await a.close();
 console.log('PASS: opgeslagen ontvangst blijft gelden na opnieuw openen');
 for (const event of ['tick', 'focus', 'pageshow', 'visibilitychange']) {
  a = await start({ hang: true, profiel: null });
  assert.match(a.period(), /9 okt.*P10/);
  a.setTime('2026-10-10T00:01:00+02:00');
  await (event === 'tick' ? a.tick() : a.event(event));
  assert.match(a.period(), /6 nov.*P11/);
  assert.equal(a.w.document.querySelector('[data-testid="inkomen-bedrag"]'), null);
  await a.click('Berekening bekijken');
  assert.match(a.w.document.querySelector('[data-testid="inkomen-periode-uitleg"]').textContent, /5 okt.*1 nov/);
  await a.close();
 }
 console.log('PASS: middernacht/minuuttimer en focus/pageshow/visibility bij hangend rooster; periode zichtbaar zonder raming');
})().catch(e => { console.error(e); process.exitCode = 1; });
