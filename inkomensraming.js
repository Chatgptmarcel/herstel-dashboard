/* Raming uit rooster en een privé loonprofiel. Geen persoonlijke bedragen in deze bron. */
(function (root) {
    'use strict';
    const minuut = 60000;
    const rond = n => Math.round((n + Number.EPSILON) * 100) / 100;
    const datumFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' });
    const tijdFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const datum = d => datumFormat.format(new Date(d));
    const tijd = d => tijdFormat.format(new Date(d));
    const dagMinuut = d => { const [h, m] = tijd(d).split(':').map(Number); return h * 60 + m; };
    const verschuifDatum = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    function periode(jaar, nr) {
        const jan4 = new Date(Date.UTC(jaar, 0, 4));
        const maandag = new Date(+jan4 - ((jan4.getUTCDay() + 6) % 7) * 86400000);
        const start = verschuifDatum(maandag.toISOString().slice(0, 10), (nr - 1) * 28);
        const einde = nr === 13 ? verschuifDatum(periode(jaar + 1, 1).start, -1) : verschuifDatum(start, 27);
        return { jaar, nr, start, einde };
    }
    function volgendePeriode(betaaldagen, nu, ontvangenBetaaldag = '') {
        const vandaag = datum(nu);
        // Alleen een bestaande, niet-toekomstige betaaldag kan zijn bevestigd.
        const ontvangen = typeof ontvangenBetaaldag === 'string'
            && Object.prototype.hasOwnProperty.call(betaaldagen, ontvangenBetaaldag)
            && ontvangenBetaaldag <= vandaag ? ontvangenBetaaldag : '';
        const betaaldag = Object.keys(betaaldagen).sort().find(d => d >= vandaag && d > ontvangen);
        return betaaldag ? { ...periode(betaaldagen[betaaldag].jaar, betaaldagen[betaaldag].periode), betaaldag } : null;
    }
    function belasting(fiscaal, tabel) {
        if (!Array.isArray(tabel) || !tabel.length || fiscaal < 0 || fiscaal > tabel[tabel.length - 1][0]) return null;
        let lo = 0, hi = tabel.length - 1;
        while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (tabel[m][0] <= fiscaal + 0.00001) lo = m; else hi = m - 1; }
        return tabel[lo][1];
    }
    function brutoNetto(bruto, uren, reisdagen, profiel, tabel) {
        // De drie beschikbare stroken hebben vrijwel hetzelfde pensioen per betaald uur.
        // Dit is een empirische raming, geen reconstructie van de cumulatieve pensioenaangifte.
        const pensioen = rond(uren * profiel.pensioenPerUur);
        const paww = rond(bruto * profiel.paww);
        const voorFondsen = bruto - pensioen - paww;
        let fiscaal = voorFondsen / (1 + profiel.fba + profiel.sociaalFonds);
        const fba = rond(fiscaal * profiel.fba), sociaalFonds = rond(fiscaal * profiel.sociaalFonds);
        fiscaal = rond(voorFondsen - fba - sociaalFonds);
        const loonheffing = belasting(fiscaal, tabel);
        if (loonheffing === null) return null;
        const whk = rond(fiscaal * profiel.whk), reiskosten = rond(reisdagen * profiel.reiskostenPerDag);
        return { bruto: rond(bruto), pensioen, paww, fba, sociaalFonds, fiscaal, loonheffing, whk, reiskosten, netto: rond(fiscaal - loonheffing - whk + reiskosten) };
    }
    function diensten(rooster, overrides) {
        const blokken = [], onbekend = [];
        for (const s of Object.values(rooster || {}).flat()) {
            const ov = (overrides || {})[s.uid] || {};
            if (ov.hidden || s.status === 'CANCELLED') continue;
            const start = +new Date(ov.startISO || s.start), eind = +new Date(ov.endISO || s.end);
            const summary = ov.summary === undefined ? s.summary || '' : ov.summary;
            if (/roostervrij/i.test(summary)) continue;
            if (!Number.isFinite(start) || !Number.isFinite(eind) || eind <= start) { onbekend.push({ datum: Number.isFinite(start) ? datum(start) : null, reden: 'Dienst zonder geldige tijden' }); continue; }
            if (/verlof|rnvb|vakantie|ziek/i.test(summary)) { onbekend.push({ datum: datum(start), reden: 'Verlof of ziekte: betaalde uren en gemiddelde ORT ontbreken' }); continue; }
            blokken.push({ start, eind, labels: [summary], ids: [s.uid], aangepast: !!Object.keys(ov).length });
        }
        blokken.sort((a, b) => a.start - b.start || a.eind - b.eind);
        const samen = [];
        for (const b of blokken) {
            const vorige = samen[samen.length - 1];
            // Aansluitende training/werk is één dienst. Overlap telt nooit dubbel.
            if (vorige && b.start <= vorige.eind) {
                vorige.eind = Math.max(vorige.eind, b.eind);
                vorige.labels.push(...b.labels); vorige.ids.push(...b.ids); vorige.aangepast ||= b.aangepast;
            } else samen.push({ ...b });
        }
        return { samen, onbekend };
    }
    function berekenDienst(d, p, profiel, nu) {
        const lengte = Math.round((d.eind - d.start) / minuut);
        const pauze = lengte > profiel.pauzeNaMinuten ? profiel.pauzeMinuten : 0;
        const startMinuut = dagMinuut(d.start);
        const vroegeOpkomst = startMinuut < 330;
        const startDatum = datum(d.start);
        const minuten = [];
        for (let i = 0; i < lengte; i++) {
            const stamp = d.start + i * minuut, key = datum(stamp), hm = dagMinuut(stamp);
            const dag = new Date(key + 'T12:00:00Z').getUTCDay();
            const weekend = dag === 0 || dag === 6;
            const actief = key >= p.start && key <= p.einde;
            const shiftRate = (profiel.verschuivingen || []).filter(v => key === v.datum && hm >= v.vanaf && hm < v.tot).reduce((n, v) => Math.max(n, v.percentage), 0);
            const tarieven = {
                nacht: !weekend && hm < 420 ? .20 : 0,
                avond: !weekend && hm >= 1080 ? .10 : 0,
                weekend: weekend ? .35 : 0,
                vroeg: vroegeOpkomst && key === startDatum && hm < 360 ? .35 : 0,
                feest: (profiel.feestdagen || []).includes(key) ? .50 : 0,
                verschuiving: shiftRate,
            };
            if (key.slice(5) === '12-31' && hm >= 960) { tarieven.nacht = 0; tarieven.avond = 0; tarieven.weekend = 1; }
            const toeslag = Object.values(tarieven).reduce((a, b) => a + b, 0);
            minuten.push({ actief, tarieven, kosten: actief ? profiel.uurloon * (1 + toeslag) / 60 : 0, stamp });
        }
        const midden = Math.max(0, Math.floor((lengte - pauze) / 2));
        const posten = { nacht: 0, avond: 0, weekend: 0, vroeg: 0, feest: 0, verschuiving: 0 };
        let betaald = 0, gepland = 0, afgetrokken = 0, brutoMinuten = 0;
        minuten.forEach((m, i) => {
            if (!m.actief) return;
            brutoMinuten++;
            if (i >= midden && i < midden + pauze) { afgetrokken++; return; }
            betaald++; if (m.stamp >= +nu) gepland++;
            for (const k of Object.keys(posten)) posten[k] += m.tarieven[k] * profiel.uurloon / 60;
        });
        const basis = betaald * profiel.uurloon / 60;
        const bruto = basis + Object.values(posten).reduce((a, b) => a + b, 0);
        // Alle mogelijke aaneengesloten pauzeplaatsen: transparante gevoeligheidsmarge.
        const prefix = [0]; minuten.forEach(m => prefix.push(prefix[prefix.length - 1] + m.kosten));
        let klein = Infinity, groot = -Infinity;
        for (let i = 0; i <= lengte - pauze; i++) { const bedrag = prefix[lengte] - (prefix[i + pauze] - prefix[i]); klein = Math.min(klein, bedrag); groot = Math.max(groot, bedrag); }
        return { datum: startDatum, begin: tijd(d.start), eind: tijd(d.eind), omschrijving: [...new Set(d.labels)].join(' / '), uren: betaald / 60, gepland: gepland / 60, brutoUren: brutoMinuten / 60, pauze: afgetrokken / 60, basis, posten, bruto, minimum: klein, maximum: groot, aangepast: d.aangepast, grensdienst: brutoMinuten !== lengte };
    }
    function bereken({ rooster, overrides, profiel, betaaldagen, tabel, ontvangenBetaaldag = '', nu = new Date() }) {
        const p = volgendePeriode(betaaldagen, nu, ontvangenBetaaldag);
        const fout = reden => ({ beschikbaar: false, reden, periode: p });
        if (!p) return fout('Betaalkalender moet worden bijgewerkt.');
        if (!profiel) return fout('Persoonlijke loonbasis nog niet geladen.');
        if (p.start < profiel.geldigVanaf || p.einde > profiel.geldigTot || p.jaar !== 2026) return fout('Loonbasis en belastingtabel voor deze periode moeten worden bijgewerkt.');
        const { samen, onbekend } = diensten(rooster, overrides);
        const gekozen = samen.filter(d => datum(d.eind - 1) >= p.start && datum(d.start) <= p.einde);
        if (!gekozen.length) return fout('Nog geen diensten voor deze loonperiode beschikbaar.');
        if (onbekend.some(d => !d.datum || (d.datum >= p.start && d.datum <= p.einde))) return fout('Betaalde verlof-/ziekte-uren of geldige diensttijden ontbreken; nog geen volledige raming.');
        const regels = gekozen.map(d => berekenDienst(d, p, profiel, nu));
        if (regels.some(r => r.grensdienst)) return fout('Een dienst loopt over de periodegrens; pauzeverdeling moet eerst worden bevestigd.');
        const uren = regels.reduce((a, r) => a + r.uren, 0);
        if (uren < profiel.contractUren) return fout('Het rooster bevat minder dan je contracturen; verlof, minuren of ontbrekende diensten moeten eerst worden aangevuld.');
        const posten = { basis: rond(regels.reduce((a, r) => a + r.basis, 0)) };
        for (const k of Object.keys(regels[0].posten)) posten[k] = rond(regels.reduce((a, r) => a + r.posten[k], 0));
        const bruto = rond(Object.values(posten).reduce((a, b) => a + b, 0));
        if (uren > 152) return fout('Meer dan 152 uur: overwerk en de pensioenraming moeten eerst worden beoordeeld.');
        const reisdagen = new Set(regels.map(r => r.datum)).size;
        const bedragen = brutoNetto(bruto, uren, reisdagen, profiel, tabel);
        if (!bedragen) return fout('Geen toepasselijke belastingtabelregel beschikbaar.');
        const laag = brutoNetto(rond(regels.reduce((a, r) => a + r.minimum, 0)), uren, reisdagen, profiel, tabel);
        const hoog = brutoNetto(rond(regels.reduce((a, r) => a + r.maximum, 0)), uren, reisdagen, profiel, tabel);
        if (!laag || !hoog) return fout('De pauzescenario’s vallen buiten de beschikbare belastingtabel.');
        return { beschikbaar: true, periode: p, regels, uren, gepland: rond(regels.reduce((a, r) => a + r.gepland, 0)), reisdagen, posten, bedragen, minimum: Math.floor(laag.netto / 10) * 10, maximum: Math.ceil(hoog.netto / 10) * 10, afgerond: Math.round(bedragen.netto / 10) * 10 };
    }
    const api = { bereken, brutoNetto, belasting, periode, volgendePeriode, diensten, berekenDienst };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.Inkomensraming = api;
})(typeof window === 'undefined' ? globalThis : window);
