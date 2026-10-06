# Inkomstenraming

De kaart linksonder toont het geschatte nettobedrag van de eerstvolgende Trigion-betaaldag. De uitleg bevat de loonperiode, diensten, uren, loonposten, inhoudingen, bronnen en beperkingen.

## Berekening

- `inkomensraming.js` selecteert de loonperiode bij de betaaldag in de bestaande betaalkalender. Diensten tussen periode-einde en betaaldag gaan niet alsnog in die loonperiode mee.
- De raming gebruikt het rooster na handmatige correcties. Geannuleerde en verborgen diensten tellen niet mee. Aansluitende werk-/trainingsblokken vormen één dienst; overlappende minuten tellen één keer. Twee losse diensten blijven apart.
- Uren zijn verstreken minuten, met tariefgrenzen in Europe/Amsterdam. De berekening houdt rekening met middernacht en wintertijd. Een dienst over de loonperiodegrens blokkeert de raming totdat de pauzeverdeling bekend is.
- Pauzeduur, uurloon, premies en bevestigde verschuivingen komen uit het persoonlijke profiel. Het gekozen pauzemoment is het midden van de dienst. Een afzonderlijke gevoeligheidsberekening verplaatst de pauze over alle mogelijke aaneengesloten plekken. Die band is geen betrouwbaarheidsinterval voor de uiteindelijke betaling.
- De pensioeninhouding is empirisch per betaald uur; het is geen volledige reconstructie van VCR. PAWW, FBA en Sociaal Fonds worden vóór de belasting afgetrokken. Whk wordt daarna ingehouden; reiskosten worden netto toegevoegd.
- `loonbelasting-2026.js` bevat de officiële witte vierwekentabel, Nederland standaard, jonger dan AOW en met loonheffingskorting. Er wordt naar de lagere tabelregel gegaan. Buiten het opgenomen bereik volgt geen bedrag.
- Bij ontbrekende loonbasis, verlof-/ziekteblokken, onvoldoende bekende contracturen, meer dan 152 uur of verlopen tariefgeldigheid verschijnt een uitleg in plaats van een misleidende nul of onvolledige raming.
- Vakantiegeldopbouw, eindejaarsuitkering, niet bevestigde declaraties en nabetalingen zijn uitgesloten. Actualiseer de onderbouwing voordat zulke betalingen worden geraamd.

## Persoonlijke gegevens

`inkomen-profiel.local.json` is de onderhoudbare persoonlijke loonbasis. `inkomen-data.local.js` levert dezelfde gegevens aan de pc-versie. Beide zijn uitgesloten van Git. De telefoon leest `dashboard_inkomen_profiel` uit de bestaande Firebase-sync. Publiceer nooit persoonlijke loonbedragen in de openbare bron of tests.

Bij een nieuwe strook de loonbasis, bewijsdatum, geldigheid en werkgeverspercentages opnieuw beoordelen. Bij een volgend belastingjaar de tabel en cao-regels vervangen. Een historisch loonprofiel bewijst geen actuele voorwaarden.

## Controle en installatie

Gerichte rekentests: `node --test tests/test_inkomensraming.cjs`.

Pc: werk de bestaande `gezondheid.html` bij vanuit `index.html` en zet `inkomensraming.js`, `loonbelasting-2026.js` en `inkomen-data.local.js` ernaast. De bestaande `loonstrook-data.js` blijft de eerdere looncontroles leveren. De HTML laadt persoonlijke bestanden alleen onder file://.

Voor publicatie op de telefoon is Marcels afzonderlijke toestemming voor deployment nodig. Publiceer uitsluitend openbare bronbestanden. Synchroniseer de persoonlijke loonbasis via het bestaande dashboarddocument, met een gerichte veldwijziging die andere waarden behoudt. Een succesvolle pc-test bewijst geen publicatie op GitHub Pages.
