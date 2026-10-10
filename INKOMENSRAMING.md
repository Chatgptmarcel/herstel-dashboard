# Inkomstenraming

De kaart linksonder toont het geschatte nettobedrag van de eerstvolgende Trigion-betaaldag. De uitleg bevat de loonperiode, diensten, uren, loonposten, inhoudingen, bronnen en beperkingen.

## Overgang naar een nieuwe betaling

- Op de betaaldag blijft de betaling zichtbaar totdat je **Betaling ontvangen** kiest of de volgende kalenderdag begint (Europe/Amsterdam). De app controleert geen bankrekening.
- Na ontvangst selecteert de app de volgende betaaldag en berekent zij alle diensten, uren, toeslagen, inhoudingen en reiskosten opnieuw voor de bijbehorende loonperiode. Reeds gewerkte uren van die nieuwe periode tellen mee; de periode begint niet pas op de dag van ontvangst. Roosterhistorie en looncontroles blijven bewaard.
- De datum ververst elke minuut en bij terugkeer naar de app, onafhankelijk van het laden van het rooster. Ook zonder volledige loonraming blijven de betaaldatum en het datumbereik zichtbaar.
- De bevestiging staat in `dashboard_ontvangen_betaaldag` en gebruikt de bestaande dashboard-sync. In de berekening kan de bevestiging worden teruggedraaid. Alleen een bekende, niet-toekomstige betaaldag telt als ontvangst.

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

De betalingskaart kan zonder netwerkverzoeken met fictieve gegevens in jsdom worden getest. Installeer de testafhankelijkheden buiten de appmap:

```sh
npm install --prefix /tmp/herstel-dashboard-qa --no-audit --no-fund --ignore-scripts @babel/standalone@7.23.5 react@18.3.1 react-dom@18.3.1 jsdom@26.1.0
NODE_PATH=/tmp/herstel-dashboard-qa/node_modules node tests/test_betalingskaart.cjs
```

De proef controleert ontvangst, opnieuw openen, ongedaan maken, de overgang na middernacht, terugkeer naar de app en een blijvend hangend roosterverzoek. Firebase wordt niet aangeroepen; de proef controleert alleen of lokale opslag en het bestaande syncverzoek worden gebruikt. Dit vervangt geen controle in de geïnstalleerde Windows-app of telefoonbrowser.

Pc: werk de bestaande `gezondheid.html` bij vanuit `index.html` en zet `inkomensraming.js`, `loonbelasting-2026.js` en `inkomen-data.local.js` ernaast. De bestaande `loonstrook-data.js` blijft de eerdere looncontroles leveren. De HTML laadt persoonlijke bestanden alleen onder file://.

Voor publicatie op de telefoon is Marcels afzonderlijke toestemming voor deployment nodig. Publiceer uitsluitend openbare bronbestanden. Synchroniseer de persoonlijke loonbasis via het bestaande dashboarddocument, met een gerichte veldwijziging die andere waarden behoudt. Een succesvolle pc-test bewijst geen publicatie op GitHub Pages.

## Broncontrole 10 oktober 2026

Deze correctie is voorbereid op branch `fix/volgende-uitbetaling`, vanaf bron-SHA `95f7f8bd91ceee872b7826b6bd280055f4438997`. De 15 rekentests en de geïsoleerde betalingskaartproef slagen. Persoonlijke loonprofielen, bankontvangst, de huidige Windows-snelkoppeling en live synchronisatie zijn niet gecontroleerd. Toepassing op de pc en publicatie zijn afzonderlijke vervolgstappen; een bronwijziging werkt een bestaande `gezondheid.html` op de pc niet automatisch bij.
