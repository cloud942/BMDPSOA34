/* ============================================================
   sw.js — Service Worker Stock Opname Material
   ============================================================

   SYARAT MUTLAK — baca dulu sebelum memakai:

   Service Worker HANYA jalan kalau halaman dibuka lewat:
       https://...            (contoh: GitHub Pages)
       http://localhost       (untuk uji coba di komputer)

   Service Worker TIDAK BISA jalan kalau file HTML dibuka
   langsung dari File Manager HP (alamatnya content:// atau
   file://). Browser memang melarangnya, bukan karena kodenya
   salah. Kalau dibuka begitu, file ini diabaikan dan app tetap
   berjalan normal seperti biasa.

   Kabar baiknya: sejak V5.12 semua pustaka (tampilan, Excel,
   barcode) sudah tertanam di dalam satu file HTML, jadi app
   SUDAH jalan penuh tanpa sinyal walau tanpa file ini.

   Gunanya file ini baru terasa kalau app di-host (misalnya
   GitHub Pages):
     - halaman tidak perlu diunduh ulang tiap dibuka
     - bisa dipasang ke layar utama seperti app biasa
     - kamera scan barcode baru benar-benar berfungsi
       (kamera butuh https, tidak bisa dari content://)

   Cara pakai: taruh sw.js, manifest.json, dan file HTML
   (ganti namanya jadi index.html) dalam SATU folder yang sama.
   ============================================================ */

'use strict';

// Naikkan angka ini setiap kali file HTML diganti versi baru,
// supaya HP mengambil versi terbaru, bukan yang tersimpan lama.
const VERSI = 'soa-v6.1';
const CACHE = VERSI;

// Berkas inti yang disimpan supaya app bisa dibuka tanpa sinyal.
const BERKAS_INTI = [
    './',
    './index.html',
    './manifest.json'
];

// Alamat yang TIDAK BOLEH disimpan sama sekali. Ini jalur sinkron
// ke Apps Script; kalau jawabannya ikut disimpan, app bisa membaca
// data stok lama dan hasil opname jadi salah.
const JANGAN_SIMPAN = [
    'script.google.com',
    'script.googleusercontent.com',
    'googleusercontent.com',
    'googleapis.com'
];

function jalurSinkron(url) {
    try {
        const host = new URL(url).hostname;
        return JANGAN_SIMPAN.some(h => host === h || host.endsWith('.' + h));
    } catch (e) {
        return false;
    }
}

// ---------- Pasang ----------
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(BERKAS_INTI))
            // Kalau satu berkas gagal diunduh, jangan batalkan semuanya.
            .catch(err => console.warn('[SW] sebagian berkas gagal disimpan:', err))
            .then(() => self.skipWaiting())
    );
});

// ---------- Aktif: buang simpanan versi lama ----------
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(nama => Promise.all(
                nama.filter(n => n !== CACHE).map(n => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

// ---------- Permintaan ----------
self.addEventListener('fetch', event => {
    const req = event.request;

    // Hanya GET. POST ke Apps Script tidak pernah disentuh.
    if (req.method !== 'GET') return;

    // Sinkron ke Google: selalu lewat jaringan, tidak pernah disimpan.
    if (jalurSinkron(req.url)) return;

    // Permintaan halaman (saat app dibuka):
    // ambil dari simpanan dulu supaya cepat dan tetap jalan tanpa sinyal,
    // lalu perbarui diam-diam di latar untuk pemakaian berikutnya.
    if (req.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html').then(tersimpan => {
                const dariJaringan = fetch(req).then(res => {
                    if (res && res.ok) {
                        const salinan = res.clone();
                        caches.open(CACHE).then(c => c.put('./index.html', salinan));
                    }
                    return res;
                }).catch(() => tersimpan);
                return tersimpan || dariJaringan;
            })
        );
        return;
    }

    // Berkas lain: pakai simpanan kalau ada, kalau tidak ambil jaringan
    // lalu simpan untuk nanti.
    event.respondWith(
        caches.match(req).then(tersimpan => {
            if (tersimpan) return tersimpan;
            return fetch(req).then(res => {
                if (!res || !res.ok || res.type === 'opaque') return res;
                const salinan = res.clone();
                caches.open(CACHE).then(c => c.put(req, salinan));
                return res;
            }).catch(() => tersimpan);
        })
    );
});

// ---------- Perintah dari halaman ----------
self.addEventListener('message', event => {
    const d = event.data || {};
    if (d.tipe === 'LANGSUNG_AKTIF') self.skipWaiting();
    if (d.tipe === 'VERSI') {
        event.ports && event.ports[0] && event.ports[0].postMessage({ versi: VERSI });
    }
});
