const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../inkomensraming.js');
const tabel = require('../loonbelasting-2026.js');
// Fictief profiel; persoonlijke loonbasis hoort niet in de publieke repository.
const profiel = { geldigVanaf: '2026-01-01', geldigTot: '2026-12-27', uurloon: 20, contractUren: 0, pauzeNaMinuten: 330, pauzeMinuten: 30, pensioenPerUur: 1, paww: .001, fba: .000374, sociaalFonds: .0006125, whk: .0021, reiskostenPerDag: 10, feestdagen: [], verschuivingen: [] };
const dagen = { '2026-10-09': { jaar: 2026, periode: 10 }, '2026-11-06': { jaar: 2026, periode: 11 } };
const p = R.periode(2026, 10);
const dienst = (start, eind, uid = 'test', summary = 'Dienst') => ({ start: new Date(start), end: new Date(eind), uid, summary });
const bereken = (blokken, extra = {}) => R.bereken({ rooster: { blokken }, overrides: {}, profiel, betaaldagen: dagen, tabel, nu: new Date('2026-10-06T08:00:00Z'), ...extra });

test('betaaldag selecteert afgesloten periode; uren vlak voor betaaldag schuiven door', () => {
    assert.deepEqual(p, { jaar: 2026, nr: 10, start: '2026-09-07', einde: '2026-10-04' });
    assert.equal(R.volgendePeriode(dagen, new Date('2026-10-09T20:00:00Z')).nr, 10);
    assert.equal(R.volgendePeriode(dagen, new Date('2026-10-09T22:01:00Z')).nr, 11);
    const r = bereken([dienst('2026-10-04T07:00Z', '2026-10-04T11:00Z'), dienst('2026-10-06T07:00Z', '2026-10-06T15:00Z', 'toekomst')]);
    assert.equal(r.uren, 4); assert.equal(r.reisdagen, 1);
});
test('ontvangen op betaaldag begint de volgende periode met uitsluitend haar diensten en bedragen', () => {
    const nu = new Date('2026-10-09T08:00:00Z');
    const ontvangenBetaaldag = '2026-10-09';
    const volgende = { jaar: 2026, nr: 11, start: '2026-10-05', einde: '2026-11-01', betaaldag: '2026-11-06' };
    assert.deepEqual(R.volgendePeriode(dagen, nu, ontvangenBetaaldag), volgende);
    const r = bereken([
        dienst('2026-09-08T07:00Z', '2026-09-08T15:00Z', 'uitbetaald'),
        dienst('2026-10-06T07:00Z', '2026-10-06T10:00Z', 'gewerkt'),
        dienst('2026-10-12T07:00Z', '2026-10-12T11:00Z', 'gepland'),
    ], { nu, ontvangenBetaaldag });
    assert.equal(r.beschikbaar, true);
    assert.deepEqual(r.periode, volgende);
    assert.deepEqual(r.regels.map(regel => regel.datum), ['2026-10-06', '2026-10-12']);
    assert.equal(r.uren, 7);
    assert.equal(r.gepland, 4);
    assert.equal(r.reisdagen, 2);
    assert.deepEqual(r.posten, { basis: 140, nacht: 0, avond: 0, weekend: 0, vroeg: 0, feest: 0, verschuiving: 0 });
    assert.deepEqual(r.bedragen, {
        bruto: 140, pensioen: 7, paww: .14, fba: .05, sociaalFonds: .08,
        fiscaal: 132.73, loonheffing: 0, whk: .28, reiskosten: 20, netto: 152.45,
    });
    assert.equal(r.minimum, 150);
    assert.equal(r.maximum, 160);
    assert.equal(r.afgerond, 150);
});
test('ongeldige, onbekende en toekomstige ontvangst schuiven de betaalperiode niet vooruit', () => {
    const nu = new Date('2026-10-09T08:00:00Z');
    const verwacht = { ...p, betaaldag: '2026-10-09' };
    for (const ontvangst of [undefined, null, '', 'ongeldig', '2026-02-30', '2026-10-08', '2026-11-06', '2027-01-01']) {
        assert.deepEqual(R.volgendePeriode(dagen, nu, ontvangst), verwacht, String(ontvangst));
    }
    assert.deepEqual(R.volgendePeriode(dagen, new Date('2026-10-08T08:00:00Z'), '2026-10-09'), verwacht);
});
test('de dag na betaling begint vanzelf de volgende periode en oudere ontvangst houdt die niet tegen', () => {
    const nu = new Date('2026-10-10T08:00:00Z');
    const verwacht = { jaar: 2026, nr: 11, start: '2026-10-05', einde: '2026-11-01', betaaldag: '2026-11-06' };
    assert.deepEqual(R.volgendePeriode(dagen, nu), verwacht);
    assert.deepEqual(R.volgendePeriode(dagen, nu, '2026-10-09'), verwacht);
});
test('ontvangst na periode 13 met vijf weken schakelt door naar het nieuwe loonjaar', () => {
    const betaaldagen = { '2027-01-08': { jaar: 2026, periode: 13 }, '2027-02-05': { jaar: 2027, periode: 1 } };
    const nu = new Date('2027-01-08T08:00:00Z');
    assert.deepEqual(R.volgendePeriode(betaaldagen, nu), {
        jaar: 2026, nr: 13, start: '2026-11-30', einde: '2027-01-03', betaaldag: '2027-01-08',
    });
    assert.deepEqual(R.volgendePeriode(betaaldagen, nu, '2027-01-08'), {
        jaar: 2027, nr: 1, start: '2027-01-04', einde: '2027-01-31', betaaldag: '2027-02-05',
    });
});
test('aansluitende training: één pauze en één reisdag, overlap telt één keer', () => {
    const r = bereken([dienst('2026-09-07T09:30Z', '2026-09-07T10:30Z', 'training'), dienst('2026-09-07T10:30Z', '2026-09-07T15:45Z', 'werk'), dienst('2026-09-07T11:00Z', '2026-09-07T12:00Z', 'dubbel')]);
    assert.equal(r.uren, 5.75); assert.equal(r.regels.length, 1); assert.equal(r.reisdagen, 1);
});
test('twee losse korte diensten krijgen niet samen een pauze', () => {
    const r = bereken([dienst('2026-09-07T07:00Z', '2026-09-07T10:00Z'), dienst('2026-09-07T11:00Z', '2026-09-07T14:00Z', 'twee')]);
    assert.equal(r.uren, 6); assert.equal(r.reisdagen, 1);
});
test('verbergen en verplaatsen volgen UID en werkelijke nieuwe datum', () => {
    const s = dienst('2026-09-07T07:00Z', '2026-09-07T12:30Z');
    assert.equal(bereken([s], { overrides: { test: { hidden: true } } }).beschikbaar, false);
    assert.equal(bereken([s], { overrides: { test: { startISO: '2026-10-06T07:00Z', endISO: '2026-10-06T12:30Z' } } }).beschikbaar, false);
    assert.equal(bereken([{ ...s, status: 'CANCELLED' }]).beschikbaar, false);
});
test('pauzegrens is langer dan 5,5 uur', () => {
    assert.equal(bereken([dienst('2026-09-07T07:00Z', '2026-09-07T12:30Z')]).uren, 5.5);
    assert.equal(bereken([dienst('2026-09-07T07:00Z', '2026-09-07T12:45Z')]).uren, 5.25);
});
test('weekend heeft geen dubbele nacht-ORT; vroege opkomst telt aanvullend', () => {
    const r = bereken([dienst('2026-09-26T02:00Z', '2026-09-26T04:00Z')]);
    assert.equal(r.posten.weekend, 14); assert.equal(r.posten.vroeg, 14); assert.equal(r.posten.nacht, 0);
});
test('nacht over middernacht gebruikt tarieven van elke kalenderdag', () => {
    const r = bereken([dienst('2026-09-25T21:00Z', '2026-09-26T01:00Z')]);
    assert.equal(r.uren, 4); assert.equal(r.posten.avond, 2); assert.equal(r.posten.weekend, 21); assert.equal(r.posten.vroeg, 0);
});
test('wintertijd rekent verstreken uren, ook bij herhaald lokaal uur', () => {
    const r = bereken([dienst('2026-10-24T23:00Z', '2026-10-25T04:00Z')], { nu: new Date('2026-10-10T08:00Z') });
    assert.equal(r.uren, 5); assert.equal(r.gepland, 5);
});
test('verschuiving alleen binnen afgesproken venster en geen dubbele uurloonbetaling', () => {
    const r = bereken([dienst('2026-09-22T08:00Z', '2026-09-22T12:00Z')], { profiel: { ...profiel, verschuivingen: [{ datum: '2026-09-22', vanaf: 660, tot: 720, percentage: .2 }] } });
    assert.equal(r.posten.basis, 80); assert.equal(r.posten.verschuiving, 4);
});
test('geen nulraming bij ontbrekend rooster, verlof, contracttekort of nieuw belastingjaar', () => {
    assert.equal(bereken([]).beschikbaar, false);
    assert.equal(bereken([dienst('2026-09-07T07:00Z', '2026-09-07T15:00Z', 'verlof', 'Verlof')]).beschikbaar, false);
    assert.equal(bereken([dienst('2026-09-07T07:00Z', '2026-09-07T15:00Z')], { profiel: { ...profiel, contractUren: 96 } }).beschikbaar, false);
    assert.equal(bereken([], { betaaldagen: { '2027-02-05': { jaar: 2027, periode: 1 } }, nu: new Date('2027-01-15') }).beschikbaar, false);
});
test('belasting gebruikt lagere tabelregel en weigert buiten bereik', () => {
    assert.equal(R.belasting(2906.11, tabel), 412.15);
    assert.equal(R.belasting(2907.70, tabel), 413.77);
    assert.equal(R.belasting(7000, tabel), null);
});
