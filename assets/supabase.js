/* ============================================================
   Supabase client + auth & DB helpers
   ============================================================
   Loaded via <script src="assets/supabase.js"></script> after
   the Supabase UMD bundle. Exposes a global `App` namespace.
   ============================================================ */

(function () {
  'use strict';

  const SUPABASE_URL = 'https://htsiszollajookebikav.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0c2lzem9sbGFqb29rZWJpa2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTg3MzAsImV4cCI6MjA5NjA5NDczMH0.rZnlLulFnSk1PqgEOsoAeE4tvBrMT-v1CwsDD0MEE50';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[App] Supabase UMD bundle not loaded.');
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'ichibot-competitor-auth',
    },
  });

  /* ---------------- Auth ---------------- */

  async function getSession() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  }

  async function getCurrentUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  /** Redirect to login.html if not authenticated. */
  async function requireAuth() {
    const user = await getCurrentUser();
    if (!user) {
      window.location.replace('login.html');
      return null;
    }
    return user;
  }

  /** Redirect away from login page if already authenticated. */
  async function redirectIfAuthed(target) {
    const user = await getCurrentUser();
    if (user) {
      window.location.replace(target || 'stores.html');
    }
  }

  async function signIn(email, password) {
    return await sb.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    await sb.auth.signOut();
    window.location.replace('login.html');
  }

  /* ---------------- Stores ---------------- */

  async function listStores() {
    const { data, error } = await sb
      .from('competitor_stores')
      .select('id, nama, url_shopee, catatan, created_at, updated_at')
      .order('nama', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /** Daftar toko + ringkasan latest parse_run (untuk halaman stores). */
  async function listStoresWithLatest() {
    const stores = await listStores();
    if (stores.length === 0) return [];

    // Ambil semua parse_runs untuk semua store (lebih efisien daripada N+1 query)
    const { data: runs, error } = await sb
      .from('parse_runs')
      .select('id, store_id, parsed_at, jumlah_produk_total, jumlah_produk_aktif, total_omset_30hari')
      .order('parsed_at', { ascending: false });
    if (error) throw error;

    // Group by store_id, ambil yang terbaru + hitung total parses
    const byStore = {};
    (runs || []).forEach((r) => {
      if (!byStore[r.store_id]) {
        byStore[r.store_id] = { latest: r, total: 0 };
      }
      byStore[r.store_id].total += 1;
    });

    return stores.map((s) => ({
      ...s,
      latest_parse: byStore[s.id] ? byStore[s.id].latest : null,
      total_parses: byStore[s.id] ? byStore[s.id].total : 0,
    }));
  }

  async function createStore(nama, urlShopee, catatan) {
    const payload = {
      nama: nama.trim(),
      url_shopee: urlShopee ? urlShopee.trim() : null,
      catatan: catatan ? catatan.trim() : null,
    };
    const { data, error } = await sb
      .from('competitor_stores')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function findStoreByName(nama) {
    const { data, error } = await sb
      .from('competitor_stores')
      .select('id, nama')
      .eq('nama', nama.trim())
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /* ---------------- Store Dashboard ---------------- */

  async function getStoreById(id) {
    const { data, error } = await sb
      .from('competitor_stores')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function updateStore(id, fields) {
    const { data, error } = await sb
      .from('competitor_stores')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteStore(id) {
    const { error } = await sb.from('competitor_stores').delete().eq('id', id);
    if (error) throw error;
  }

  /** List semua parse_runs untuk satu toko, descending by parsed_at. */
  async function listParseRuns(storeId) {
    const { data, error } = await sb
      .from('parse_runs')
      .select('*')
      .eq('store_id', storeId)
      .order('parsed_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getParseRun(parseRunId) {
    const { data, error } = await sb
      .from('parse_runs')
      .select('*')
      .eq('id', parseRunId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function deleteParseRun(parseRunId) {
    const { error } = await sb.from('parse_runs').delete().eq('id', parseRunId);
    if (error) throw error;
  }

  /**
   * List produk kompetitor dari satu snapshot.
   * @param {string} parseRunId
   * @param {{limit?: number, offset?: number, orderBy?: string, dropDeadStock?: boolean, search?: string}} opts
   */
  async function listCompetitorProducts(parseRunId, opts) {
    opts = opts || {};
    const limit = opts.limit || 50;
    const offset = opts.offset || 0;
    const orderBy = opts.orderBy || 'omset_30hari';

    let q = sb
      .from('competitor_products')
      .select('*', { count: 'exact' })
      .eq('parse_run_id', parseRunId)
      .order(orderBy, { ascending: false, nullsFirst: false });

    if (opts.dropDeadStock) {
      q = q.gt('omset_30hari', 0);
    }
    if (opts.search && opts.search.trim()) {
      const term = opts.search.trim().replace(/[%_]/g, '\\$&');
      q = q.ilike('nama_produk', `%${term}%`);
    }

    q = q.range(offset, offset + limit - 1);

    const { data, count, error } = await q;
    if (error) throw error;
    return { data: data || [], total: count || 0 };
  }

  /* ---------------- Parse Runs & Products ---------------- */

  /**
   * Simpan hasil parsing ke DB: bikin parse_runs row + bulk insert competitor_products.
   *
   * @param {string} storeId - UUID toko
   * @param {Array<Object>} transformedData - hasil transformProduk() (BELUM difilter)
   * @param {string} [catatan]
   * @returns {Promise<{run: Object, inserted: number}>}
   */
  async function saveParseResult(storeId, transformedData, catatan) {
    if (!storeId) throw new Error('storeId wajib diisi');
    if (!Array.isArray(transformedData) || transformedData.length === 0) {
      throw new Error('Tidak ada produk untuk disimpan');
    }

    const totalCount = transformedData.length;
    const activeCount = transformedData.filter(
      (p) => (p['Omset 30 Hari'] || 0) > 0
    ).length;
    const totalOmset = transformedData.reduce(
      (s, p) => s + (p['Omset 30 Hari'] || 0),
      0
    );

    // 1) Insert parse_runs
    const { data: run, error: runErr } = await sb
      .from('parse_runs')
      .insert({
        store_id: storeId,
        jumlah_produk_total: totalCount,
        jumlah_produk_aktif: activeCount,
        total_omset_30hari: totalOmset,
        catatan: catatan ? catatan.trim() : null,
      })
      .select()
      .single();
    if (runErr) throw runErr;

    // 2) Bulk insert competitor_products (batch supaya gak kena payload limit)
    const rows = transformedData.map((p) => ({
      parse_run_id: run.id,
      nama_produk: p['Nama Produk'],
      ditambahkan: dateToISODate(p['Ditambahkan']),
      harga: p['Harga'],
      stok: p['Stok'],
      omset_30hari: p['Omset 30 Hari'],
      terjual_30hari: p['Terjual 30 Hari'],
      omset_per_bulan: p['Omset per Bulan (Est.)'],
      terjual_per_bulan: p['Terjual per Bulan (Est.)'],
      trend_arah: p['Trend Arah'],
      trend_persen: p['Trend %'],
      persen_omset_toko: p['% Omset Toko'],
      rating: p['Rating'],
      jumlah_ulasan: p['Jumlah Ulasan'],
      wishlist: p['Wishlist'],
      nilai_jual_stok: p['Nilai Jual Stok'],
      total_terjual_unit: p['Total Terjual (Unit)'],
      total_terjual_rp: p['Total Terjual (Rp)'],
      est_rate_komisi_a: p['Est. Rate Komisi A'],
      est_rate_komisi_b: p['Est. Rate Komisi B'],
      est_besar_komisi: p['Est. Besar Komisi'],
    }));

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await sb.from('competitor_products').insert(batch);
      if (error) {
        // Cleanup: hapus parse_run kalau insert produk gagal (cascade auto-bersih)
        await sb.from('parse_runs').delete().eq('id', run.id);
        throw new Error('Gagal insert produk batch ke-' + (i / BATCH + 1) + ': ' + error.message);
      }
      inserted += batch.length;
    }

    return { run, inserted };
  }

  /* ---------------- Ichibot Products ---------------- */

  /**
   * Bulk upsert produk Ichibot (key: external_id).
   * Row tanpa external_id akan di-insert (tidak upsert).
   *
   * @param {Array<Object>} products - sudah ter-map ke schema DB
   * @returns {Promise<{inserted: number, updated: number, skipped: number}>}
   */
  async function importIchibotProducts(products) {
    if (!Array.isArray(products) || products.length === 0) {
      throw new Error('Tidak ada produk untuk diimport');
    }

    // Split: yang punya external_id → upsert; yang tidak → insert biasa
    const withExtId = products.filter((p) => p.external_id);
    const withoutExtId = products.filter((p) => !p.external_id);

    let upsertedCount = 0;
    let insertedCount = 0;

    // 1) Upsert (batched)
    if (withExtId.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < withExtId.length; i += BATCH) {
        const batch = withExtId.slice(i, i + BATCH);
        const { error } = await sb
          .from('ichibot_products')
          .upsert(batch, { onConflict: 'external_id' });
        if (error) {
          throw new Error(
            'Gagal upsert batch ' + (i / BATCH + 1) + ': ' + error.message
          );
        }
        upsertedCount += batch.length;
      }
    }

    // 2) Insert untuk yang tanpa external_id
    if (withoutExtId.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < withoutExtId.length; i += BATCH) {
        const batch = withoutExtId.slice(i, i + BATCH);
        const { error } = await sb.from('ichibot_products').insert(batch);
        if (error) {
          throw new Error(
            'Gagal insert batch (no external_id) ' + (i / BATCH + 1) + ': ' + error.message
          );
        }
        insertedCount += batch.length;
      }
    }

    return {
      upserted: upsertedCount,
      inserted: insertedCount,
      total: upsertedCount + insertedCount,
    };
  }

  /**
   * List ichibot_products dengan filter + pagination.
   *
   * @param {{search?: string, prioritas?: string, kategori?: string, limit?: number, offset?: number}} opts
   * @returns {Promise<{data: Array, total: number}>}
   */
  async function listIchibotProducts(opts) {
    opts = opts || {};
    const limit = opts.limit || 50;
    const offset = opts.offset || 0;

    let q = sb
      .from('ichibot_products')
      .select('*', { count: 'exact' })
      .order('nama_produk', { ascending: true });

    if (opts.search && opts.search.trim()) {
      const term = opts.search.trim().replace(/[%_]/g, '\\$&');
      q = q.or(
        `nama_produk.ilike.%${term}%,sku.ilike.%${term}%,external_id.ilike.%${term}%`
      );
    }
    if (opts.prioritas) q = q.eq('prioritas', opts.prioritas);
    if (opts.kategori) q = q.eq('kategori', opts.kategori);

    q = q.range(offset, offset + limit - 1);

    const { data, count, error } = await q;
    if (error) throw error;
    return { data: data || [], total: count || 0 };
  }

  /** Ringkasan stats untuk top bar dashboard. */
  async function getIchibotStats() {
    const [{ count: total }, { count: prioritasYa }] = await Promise.all([
      sb.from('ichibot_products').select('*', { count: 'exact', head: true }),
      sb
        .from('ichibot_products')
        .select('*', { count: 'exact', head: true })
        .eq('prioritas', 'Ya'),
    ]);
    return {
      total: total || 0,
      prioritasYa: prioritasYa || 0,
      prioritasTidak: (total || 0) - (prioritasYa || 0),
    };
  }

  /** Distinct kategori untuk dropdown filter. */
  async function getIchibotKategoriList() {
    // Pakai trick: select kolom unik via RPC kalau ada, atau ambil semua row sebatas batas
    const { data, error } = await sb
      .from('ichibot_products')
      .select('kategori')
      .not('kategori', 'is', null)
      .limit(5000); // 2600 produk muat
    if (error) throw error;
    const set = new Set((data || []).map((r) => r.kategori).filter(Boolean));
    return Array.from(set).sort();
  }

  /* ---------------- Matching ---------------- */

  function normalizeName(s) {
    if (s == null) return '';
    return String(s).trim().toLowerCase();
  }

  /**
   * Bulk fetch matches untuk list nama produk kompetitor.
   * @param {Array<string>} names
   * @returns {Promise<Object>} - { normalizedName: matchObject, ... }
   */
  async function getMatchesForNames(names) {
    if (!Array.isArray(names) || names.length === 0) return {};
    const normalized = Array.from(
      new Set(names.map(normalizeName).filter(Boolean))
    );
    if (normalized.length === 0) return {};

    const { data, error } = await sb
      .from('product_matches')
      .select(
        'id, nama_produk_normalized, status, matched_at, matched_by_email, ichibot_product_id, ichibot_products(id, external_id, sku, nama_produk, kategori, prioritas, harga_diskon, link_gambar_1)'
      )
      .in('nama_produk_normalized', normalized);
    if (error) throw error;

    const map = {};
    (data || []).forEach((m) => {
      map[m.nama_produk_normalized] = m;
    });
    return map;
  }

  /**
   * Upsert match: simpan/replace rule untuk nama produk kompetitor.
   * @param {string} namaProduk - nama produk kompetitor (akan dinormalisasi)
   * @param {string|null} ichibotProductId - UUID, atau null kalau status='no_ichibot_equivalent'
   * @param {string} status - 'matched' | 'no_ichibot_equivalent'
   * @param {string} [email]
   * @returns {Promise<Object>}
   */
  async function upsertMatch(namaProduk, ichibotProductId, status, email) {
    const namaNorm = normalizeName(namaProduk);
    if (!namaNorm) throw new Error('Nama produk kosong, tidak bisa dimatch');
    if (status === 'matched' && !ichibotProductId) {
      throw new Error('ichibot_product_id wajib diisi kalau status=matched');
    }

    const payload = {
      nama_produk_normalized: namaNorm,
      ichibot_product_id: ichibotProductId || null,
      status: status || 'matched',
      matched_at: new Date().toISOString(),
      matched_by_email: email || null,
    };

    const { data, error } = await sb
      .from('product_matches')
      .upsert(payload, { onConflict: 'nama_produk_normalized' })
      .select(
        '*, ichibot_products(id, external_id, sku, nama_produk, kategori, prioritas, harga_diskon, link_gambar_1)'
      )
      .single();
    if (error) throw error;
    return data;
  }

  /** Hapus match rule untuk nama produk kompetitor. */
  async function deleteMatch(namaProduk) {
    const namaNorm = normalizeName(namaProduk);
    if (!namaNorm) return;
    const { error } = await sb
      .from('product_matches')
      .delete()
      .eq('nama_produk_normalized', namaNorm);
    if (error) throw error;
  }

  /**
   * Trigram similarity search → top N ichibot products mirip query.
   * Memanggil RPC suggest_ichibot.
   */
  async function suggestIchibot(queryText, limit) {
    if (!queryText || !String(queryText).trim()) return [];
    const { data, error } = await sb.rpc('suggest_ichibot', {
      query_text: String(queryText).trim(),
      limit_n: limit || 5,
    });
    if (error) throw error;
    return data || [];
  }

  /* ---------------- Dashboard Summary (Fase 5) ---------------- */

  /**
   * Agregasi data untuk Dashboard Prioritas (Client-side).
   * Menghitung match count, total omset, rata-rata rank untuk tiap produk Ichibot.
   */
  async function getDashboardSummary() {
    // 1. Ambil semua toko & parse run terbaru
    const stores = await listStoresWithLatest();
    const runIds = stores.map(s => s.latest_parse?.id).filter(Boolean);
    if (runIds.length === 0) return [];

    // 2. Ambil produk kompetitor (aktif) dari setiap parse run
    let compProducts = [];
    const BATCH = 10;
    for (let i = 0; i < runIds.length; i += BATCH) {
      const batchIds = runIds.slice(i, i + BATCH);
      const { data, error } = await sb
        .from('competitor_products')
        .select('parse_run_id, nama_produk, omset_30hari, harga')
        .in('parse_run_id', batchIds)
        .gt('omset_30hari', 0)
        .order('omset_30hari', { ascending: false });
      if (error) throw error;
      compProducts = compProducts.concat(data || []);
    }

    // Kelompokkan per run, lalu potong pakai prinsip Pareto (80% omset kumulatif)
    const productsByRun = {};
    compProducts.forEach(p => {
      if (!productsByRun[p.parse_run_id]) productsByRun[p.parse_run_id] = [];
      productsByRun[p.parse_run_id].push(p);
    });

    function paretoSlice(products) {
      const count = Math.max(1, Math.ceil(products.length * 0.2));
      return products.slice(0, count);
    }

    const paretoByRun = {};
    Object.keys(productsByRun).forEach(runId => {
      paretoByRun[runId] = paretoSlice(productsByRun[runId]);
    });

    // 3. Ambil semua product_matches yang matched
    const { data: matches, error: matchErr } = await sb
      .from('product_matches')
      .select('nama_produk_normalized, ichibot_product_id')
      .eq('status', 'matched')
      .not('ichibot_product_id', 'is', null);
    if (matchErr) throw matchErr;

    const mapNameToIchibot = {};
    (matches || []).forEach(m => {
      mapNameToIchibot[m.nama_produk_normalized] = m.ichibot_product_id;
    });

    // 4. Ambil semua ichibot_products
    let ichibotProducts = [];
    let offset = 0;
    while(true) {
      const { data, error } = await sb
        .from('ichibot_products')
        .select('id, sku, nama_produk, kategori, prioritas, harga_diskon')
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      ichibotProducts = ichibotProducts.concat(data);
      offset += 1000;
      if (data.length < 1000) break;
    }

    const ichibotMap = {};
    ichibotProducts.forEach(ip => {
      ichibotMap[ip.id] = {
        ...ip,
        harga_ichibot: ip.harga_diskon,
        match_count: 0,
        total_omset: 0,
        sum_rank: 0,
        avg_rank: null,
        min_harga_kompetitor: null,
      };
    });

    // 5. Agregasi
    Object.keys(paretoByRun).forEach(runId => {
      const top50 = paretoByRun[runId];
      // Supaya unique per toko (kalau ada produk sama di 1 toko)
      const matchedIchibotThisRun = new Set();

      top50.forEach((p, index) => {
        const norm = normalizeName(p.nama_produk);
        const ichibotId = mapNameToIchibot[norm];
        if (ichibotId && ichibotMap[ichibotId]) {
          // Hanya tambah match_count 1x per toko meskipun ada multiple kompetitor product map ke sama
          if (!matchedIchibotThisRun.has(ichibotId)) {
            ichibotMap[ichibotId].match_count += 1;
            matchedIchibotThisRun.add(ichibotId);
          }
          ichibotMap[ichibotId].total_omset += (p.omset_30hari || 0);
          ichibotMap[ichibotId].sum_rank += (index + 1);
          if (p.harga != null) {
            if (ichibotMap[ichibotId].min_harga_kompetitor === null || p.harga < ichibotMap[ichibotId].min_harga_kompetitor) {
              ichibotMap[ichibotId].min_harga_kompetitor = p.harga;
            }
          }
        }
      });
    });

    // 6. Hitung rata-rata rank & Rekomendasi
    return Object.values(ichibotMap).map(ip => {
      if (ip.match_count > 0) {
        ip.avg_rank = ip.sum_rank / ip.match_count;
      }
      
      let badge = '';
      if (ip.prioritas === 'Tidak' && ip.match_count > 0) badge = 'Naikkan';
      else if (ip.prioritas === 'Ya' && ip.match_count === 0) badge = 'Tinjau';
      else if (ip.prioritas === 'Ya' && ip.match_count > 0) badge = 'On-track';
      else badge = 'Aman';

      ip.recommendation = badge;
      return ip;
    });
  }

  /* ---------------- Utils ---------------- */

  function dateToISODate(d) {
    if (!d) return null;
    if (typeof d === 'string') return d;
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatHargaDiff(diffAbs, basePrice) {
    const pct = basePrice > 0 ? Math.round(diffAbs / basePrice * 100) : 0;
    let short;
    if (diffAbs >= 1000000) short = (diffAbs / 1000000).toFixed(1).replace('.0', '') + 'jt';
    else if (diffAbs >= 1000) short = Math.round(diffAbs / 1000) + 'rb';
    else short = 'Rp' + diffAbs;
    return `${short} (${pct}%)`;
  }

  function formatRupiah(n) {
    if (n == null) return '—';
    return 'Rp ' + Number(n).toLocaleString('id-ID');
  }

  function formatAngka(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('id-ID');
  }

  function formatTanggalRelatif(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'baru saja';
    if (diffMin < 60) return diffMin + ' menit lalu';
    if (diffHr < 24) return diffHr + ' jam lalu';
    if (diffDay < 7) return diffDay + ' hari lalu';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function escapeHTML(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  /* ---------------- Top Nav (injected) ---------------- */

  /**
   * Render top nav ke <div id="app-nav"></div> jika ada di page.
   * @param {string} active - nama page aktif (untuk styling)
   */
  async function renderNav(active) {
    const mount = document.getElementById('app-nav');
    if (!mount) return;

    const user = await getCurrentUser();
    const links = [
      { id: 'parser', href: 'index.html', label: 'Parser' },
      { id: 'dashboard', href: 'dashboard.html', label: 'Dashboard Prioritas', auth: true },
      { id: 'stores', href: 'stores.html', label: 'Toko Kompetitor', auth: true },
      { id: 'ichibot', href: 'ichibot.html', label: 'Produk Ichibot', auth: true },
    ];

    const visible = links.filter((l) => !l.auth || user);

    const linksHTML = visible
      .map((l) => {
        const cls = 'nav-link' + (l.id === active ? ' active' : '');
        return `<a class="${cls}" href="${l.href}">${l.label}</a>`;
      })
      .join('');

    const authHTML = user
      ? `<div class="nav-user">
           <span class="nav-user-email" title="${escapeHTML(user.email)}">${escapeHTML(user.email)}</span>
           <button class="nav-btn-logout" id="nav-logout" type="button">Keluar</button>
         </div>`
      : `<a class="nav-btn-login" href="login.html">Masuk</a>`;

    mount.innerHTML = `
      <nav class="top-nav">
        <div class="container nav-inner">
          <a class="nav-brand" href="index.html">
            <span class="nav-brand-mark">●</span>
            <span class="nav-brand-text">Ichibot Tracker</span>
          </a>
          <div class="nav-links">${linksHTML}</div>
          <div class="nav-right">${authHTML}</div>
        </div>
      </nav>
    `;

    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (confirm('Keluar dari akun?')) await signOut();
      });
    }
  }

  /* ---------------- Public API ---------------- */

  window.App = {
    sb,
    // auth
    getSession,
    getCurrentUser,
    requireAuth,
    redirectIfAuthed,
    signIn,
    signOut,
    // stores
    listStores,
    listStoresWithLatest,
    createStore,
    findStoreByName,
    getStoreById,
    updateStore,
    deleteStore,
    // parse runs
    listParseRuns,
    getParseRun,
    deleteParseRun,
    listCompetitorProducts,
    // products
    saveParseResult,
    // ichibot
    importIchibotProducts,
    listIchibotProducts,
    getIchibotStats,
    getIchibotKategoriList,
    // matching
    getMatchesForNames,
    upsertMatch,
    deleteMatch,
    suggestIchibot,
    // dashboard
    getDashboardSummary,
    // utils
    formatHargaDiff,
    formatRupiah,
    formatAngka,
    formatTanggalRelatif,
    escapeHTML,
    // nav
    renderNav,
  };
})();
