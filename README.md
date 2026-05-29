# Shopee Parser — Seller Centre ke Excel

Parser **lokal** (100% client-side) untuk mengubah dump teks dari halaman Shopee Seller Centre menjadi file Excel (`.xlsx`) yang rapi dan terformat.

## Cara Pakai

1. **Buka** `index.html` di browser (double-click atau drag ke browser)
2. **Copy** seluruh isi halaman "Produk Saya" dari Shopee Seller Centre
3. **Paste** ke textarea, atau drag-drop file `.txt`
4. Isi konfigurasi (opsional):
   - **Nama Toko** — tag tiap baris dengan nama toko
   - **Top N** — ambil N produk teratas berdasarkan omset (default: 200)
   - **Drop dead stock** — buang produk dengan omset 30 hari = 0
   - **Min terjual** — minimum unit terjual 30 hari
5. Klik **▶ Proses** (atau tekan `Cmd/Ctrl + Enter`)
6. Review statistik dan preview tabel
7. Klik **📥 Download XLSX**

## Format Input

Setiap produk terdiri dari **18 baris berurutan** (dipisah baris kosong):

```
Nama Produk
Tanggal (26 Apr 2022 / Hari ini)
Harga (Rp X)
Stok
Omset per Bulan (Rp X)
Omset 30 Hari (Rp X)
Terjual per Bulan
Terjual 30 Hari
Trend (↑/↓/No data)
% Omset Toko
Nilai Ulasan (4,9 (2.992))
Wishlist
Nilai Jual Stok (Rp X)
Total Terjual Unit
Total Terjual Rp
Est. Rate Komisi A
Est. Rate Komisi B
Est. Besar Komisi (Rp X)
```

## Kolom Output Excel (20 kolom)

| Kolom | Format |
|-------|--------|
| Nama Toko* | teks |
| Nama Produk | teks (wrap) |
| Ditambahkan | dd-mmm-yyyy |
| Harga | Rp #,##0 |
| Stok | #,##0 |
| Omset 30 Hari | Rp #,##0 |
| Terjual 30 Hari | #,##0 |
| Omset per Bulan (Est.) | Rp #,##0 |
| Terjual per Bulan (Est.) | #,##0 |
| Trend Arah | teks |
| Trend % | 0.0% |
| % Omset Toko | 0.00% |
| Rating | 0.0 |
| Jumlah Ulasan | #,##0 |
| Wishlist | #,##0 |
| Nilai Jual Stok | Rp #,##0 |
| Total Terjual (Unit) | #,##0 |
| Total Terjual (Rp) | Rp #,##0 |
| Est. Rate Komisi A | 0.0% |
| Est. Rate Komisi B | 0.0% |
| Est. Besar Komisi | Rp #,##0 |

\* Kolom "Nama Toko" hanya muncul jika diisi di konfigurasi.

## Styling Excel

- Header: bold putih (#FFFFFF) di atas biru tua (#305496), center, wrap text
- Font: Arial (header 11pt, body 10pt)
- Freeze pane: baris header + kolom Nama Toko (jika ada)
- Auto-filter aktif

## Privasi

- **Tidak ada data yang dikirim ke server** — semua pemrosesan dilakukan di browser
- Library `xlsx-js-style` di-load dari CDN (jsDelivr) — hanya kode library, bukan data Anda
- Bisa dipakai offline jika library sudah ter-cache di browser

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| 0 produk terdeteksi | Pastikan copy dari halaman Seller Centre, bukan dari file lain. Klik "Lihat contoh format input" untuk referensi |
| File Excel tidak ter-download | Periksa koneksi internet (library xlsx-js-style perlu di-load dari CDN) |
| Tanggal muncul sebagai angka di Excel | Pastikan format cell di-set ke Date, atau buka dengan Excel versi terbaru |
| Dark mode tidak aktif | Browser mengikuti setting OS — cek System Preferences / Settings → Appearance |

## Teknologi

- HTML + CSS + JavaScript vanilla (tanpa framework)
- [xlsx-js-style](https://github.com/gitbrent/xlsx-js-style) — fork SheetJS dengan dukungan cell styling
- Single-file, self-contained (kecuali CDN dependency)
