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
      { id: 'stores', href: 'stores.html', label: 'Toko Kompetitor', auth: true },
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
    // products
    saveParseResult,
    // utils
    formatRupiah,
    formatAngka,
    formatTanggalRelatif,
    escapeHTML,
    // nav
    renderNav,
  };
})();
