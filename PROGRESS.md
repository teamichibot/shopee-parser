# Ichibot Competitor Tracker — Progress

Web app untuk track produk kompetitor Shopee + mapping ke catalog Ichibot Store untuk validasi/upgrade prioritas produk.

**Live:** https://teamichibot.github.io/shopee-parser/
**Repo:** https://github.com/teamichibot/shopee-parser

---

## 📋 Phase Status

| Fase | Deskripsi | Status |
|---|---|---|
| **Fase 1** | Auth + simpan parsing kompetitor ke DB | ✅ **Selesai** |
| **Fase 3** | Import & browse catalog Ichibot (XLSX) | 🚧 **Sedang dikerjakan** |
| **Fase 2** | Dashboard per toko (Top 50 + history) | ⏳ Pending |
| **Fase 4** | Matching UI (kompetitor ↔ Ichibot) | ⏳ Pending |
| **Fase 5** | Dashboard prioritas Ichibot (summary) | ⏳ Pending |

> Note: Fase 3 dikerjakan duluan supaya begitu Fase 2 selesai (Top 50 view), tombol "Match" langsung berfungsi tanpa nunggu Fase 3 import dulu.

---

## ✅ Fase 1 — Storage & Save Snapshot (selesai)

**Yang berfungsi:**
- Parser teks → preview + Excel (flow lama, tetap jalan tanpa login)
- Login admin (1 user, Supabase Auth)
- Tombol **💾 Simpan ke DB** muncul setelah login → modal pilih/buat toko → simpan snapshot
- Halaman **Toko Kompetitor** — list semua toko + ringkasan parse terbaru per toko
- Klik card toko → balik ke parser dengan nama toko pre-filled

**File:**
```
shopeeParser/
├── index.html          ← Parser (multi-page)
├── login.html          ← Login form
├── stores.html         ← Daftar toko kompetitor
├── PROGRESS.md         ← File ini
├── README.md
└── assets/
    ├── supabase.js     ← Supabase client + auth + DB helpers (window.App)
    └── common.css      ← Design tokens + shared components + page styles
```

**Database schema (Supabase Postgres):**
```
competitor_stores       (id, nama UNIQUE, url_shopee, catatan, created_at, updated_at)
parse_runs              (id, store_id FK, parsed_at, jumlah_produk_total, jumlah_produk_aktif, total_omset_30hari, catatan)
competitor_products     (id, parse_run_id FK, nama_produk, ditambahkan, harga, stok, omset_30hari, terjual_30hari, ...)
ichibot_products        (id, external_id UNIQUE, sku, nama_produk, prioritas, kategori, gudang, stok, harga_normal, harga_diskon, velocity_30d, velocity_90d, momentum, days_of_supply, link_gambar_1)
product_matches         (id, competitor_product_id FK, ichibot_product_id FK, matched_at, matched_by_email)
```

RLS: hanya `authenticated` role yang boleh akses (semua action). Anon hanya bisa baca via JS dengan session JWT.

---

## 🚧 Fase 3 — Import & Browse Catalog Ichibot (sedang dikerjakan)

**Sudah:**
- ✅ Schema `ichibot_products` (table sudah ada, kosong)
- ✅ Helpers di `supabase.js`: `importIchibotProducts`, `listIchibotProducts`, `getIchibotStats`, `getIchibotKategoriList`
- ✅ Styles di `common.css`: table, toolbar, pagination, import modal, badge
- ✅ Link "Produk Ichibot" di nav

**Sisa:**
- 🚧 `ichibot.html` — halaman browse + import XLSX
  - Top stats bar (total, prioritas Ya, prioritas Tidak)
  - Toolbar: search nama/sku/id + filter prioritas + filter kategori
  - Tabel paginated dengan thumbnail (link gambar)
  - Modal import XLSX (drop file → preview → upsert via `external_id`)

**Column mapping XLSX → DB:**

| XLSX Header | DB Column | Type |
|---|---|---|
| ID | `external_id` (UNIQUE) | text |
| Nama Barang | `nama_produk` | text |
| Prioritas | `prioritas` | text |
| SKU | `sku` | text |
| Gudang | `gudang` | text |
| Stock | `stok` | int |
| Harga Normal | `harga_normal` | int |
| Harga Diskon | `harga_diskon` | int |
| Kategori | `kategori` | text |
| Velocity 90d | `velocity_90d` | numeric |
| Velocity 30d | `velocity_30d` | numeric |
| Momentum | `momentum` | text |
| Days of Supply | `days_of_supply` | numeric |
| Link Gambar / Link Gambar 1 | `link_gambar_1` | text |

Re-import same XLSX → upsert by `external_id` (row dengan ID sama akan ke-update). Row tanpa ID akan di-insert sebagai row baru.

---

## ⏳ Fase 2 — Dashboard per Toko (pending)

**Yang akan dibikin:**
- `store.html?id=<uuid>` — dashboard per toko kompetitor
- Top 50 produk by omset 30hr DESC
- Pilih snapshot (default: terbaru)
- Compare snapshot lama vs baru (trend omset, produk yg masuk/keluar top 50)
- Tombol "Match" per baris → buka modal Ichibot matcher (depends on Fase 3 & 4)

---

## ⏳ Fase 4 — Matching UI (pending)

**Yang akan dibikin:**
- Modal matcher: per produk kompetitor → cari produk Ichibot via fuzzy suggest
- Auto-suggest top 5 kandidat berdasarkan kemiripan nama (string similarity)
- Konfirmasi → insert ke `product_matches`
- Bulk match: kalau nama identik di banyak kompetitor sudah di-match sekali → terapkan ke semua

---

## ⏳ Fase 5 — Dashboard Prioritas Ichibot (pending)

**Yang akan dibikin:**
- `dashboard.html` — summary view
- Per produk Ichibot:
  - Jumlah kompetitor yang jual (match count)
  - Total omset agregat dari semua kompetitor
  - Rata-rata rank di Top 50 kompetitor
  - **Recommendation badge:**
    - 🔥 **Naikkan**: Prioritas=Tidak tapi laris di banyak kompetitor
    - ⚠️ **Tinjau**: Prioritas=Ya tapi gak ada kompetitor yang jual
    - ✅ **On-track**: Prioritas=Ya + match di kompetitor
- Filter: kategori, harga range, dll
- Export ke XLSX

---

## 🔧 Tech Stack

- **Frontend:** HTML + vanilla JS + CSS (no framework, no build step)
- **Hosting:** GitHub Pages (static)
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Libraries (CDN):**
  - `xlsx-js-style` — read & write Excel dengan styling
  - `@supabase/supabase-js@2` — Supabase client

**Kenapa multi-file (bukan single-file):**
- Lebih maintainable seiring scope nambah
- Tetap static (no router lib), nav antar page pakai `<a href>`
- Login state cached oleh Supabase di localStorage, auto-check tiap page

---

## 🧪 Quick Test (per Fase)

### Fase 1
1. Buka `/login.html` → login
2. Parse sample data di `/index.html` → klik **💾 Simpan ke DB** → pilih toko → save
3. Buka `/stores.html` → cek card toko muncul + statistik update

### Fase 3 (begitu selesai)
1. Buka `/ichibot.html` → klik **📥 Import XLSX**
2. Drop file `PRODUK STORE.xlsx` → preview → Import
3. Search + filter di tabel
4. Re-import → cek upsert (jumlah tidak nambah, harga/stok ter-update)
