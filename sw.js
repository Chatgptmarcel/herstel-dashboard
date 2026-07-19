// Service worker voor het Herstel Dashboard (PWA).
//
// Strategie:
//  - Eigen bestanden (index.html, schedule.ics, json): netwerk eerst, cache als
//    offline-terugval. Zo zijn rooster en app-updates altijd vers zodra er internet is.
//  - CDN-bestanden (React, Tailwind, Babel, pdf.js, iconen): cache eerst, daarna netwerk.
//    Na het eerste gebruik opent de app daardoor ook offline, met het laatst bekende rooster.
//
// Cache-bust-parameters (?t=...) worden bij eigen bestanden genegeerd als cachesleutel,
// anders zou elke ophaling een nieuwe kopie opslaan en zou offline nooit iets matchen.

const CACHE = 'herstel-dashboard-v2';
const PRECACHE = [
    './',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
];

// Eigen URL zonder query — één stabiele cachesleutel per bestand
const eigenSleutel = (url) => {
    const u = new URL(url);
    u.search = '';
    return u.href;
};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((sleutels) => Promise.all(sleutels.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (url.origin === self.location.origin) {
        // Netwerk eerst; gelukte antwoorden opslaan onder de URL zonder query
        const sleutel = eigenSleutel(req.url);
        event.respondWith(
            fetch(req).then((res) => {
                if (res && res.ok) {
                    const kopie = res.clone();
                    caches.open(CACHE).then((c) => c.put(sleutel, kopie));
                }
                return res;
            }).catch(async () => {
                const hit = await caches.match(sleutel);
                return hit || Response.error();
            })
        );
    } else {
        // CDN: cache eerst (URL's zijn geversioneerd), anders ophalen en bewaren.
        // Opaque antwoorden (no-cors scripts zoals Tailwind CDN) ook bewaren.
        event.respondWith(
            caches.match(req).then((hit) => hit || fetch(req).then((res) => {
                if (res && (res.ok || res.type === 'opaque')) {
                    const kopie = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, kopie));
                }
                return res;
            }))
        );
    }
});
