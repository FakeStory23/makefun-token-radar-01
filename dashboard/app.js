/* Token Radar dashboard: renders window.RADAR with no network and no framework.
 *
 * State lives in the URL hash so every view is a link: #tab=all|watchlist|early|live,
 * #q=<search>, #cat=<category>, #sort=<column>, #dir=asc|desc, #detail=<slug>.
 * The three screenshots are three hashes: the board, a detail view, a filtered view.
 */
(function () {
  'use strict';

  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('rows').innerHTML =
      '<tr><td colspan="8">No radar data. Run main.ts first — it writes data.js beside this page.</td></tr>';
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows');
  var emptyEl = $('empty');
  var countEl = $('count');
  var detailEl = $('detail');
  var detailBody = $('detail-body');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n == null || !isFinite(n)) return '<span class="muted">—</span>';
    var v = (Math.round(n * 10) / 10).toFixed(1);
    return n >= 0
      ? '<span class="pos">+' + v + '%</span>'
      : '<span class="neg">' + v + '%</span>';
  }

  function age(n) {
    if (n == null) return '—';
    if (n < 365) return n + 'd';
    var y = Math.floor(n / 365);
    var d = n % 365;
    return y + 'y ' + d + 'd';
  }

  function chains(r, limit) {
    return (r.chains || []).slice(0, limit == null ? 3 : limit).join(', ') || '—';
  }

  /* ---------- state ---------- */
  function readHash() {
    var h = {};
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return h;
    raw.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) h[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return h;
  }

  function writeHash() {
    var parts = [];
    if (state.tab !== 'all') parts.push('tab=' + state.tab);
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.sort !== 'rank' || state.dir !== 'asc') parts.push('sort=' + state.sort, 'dir=' + state.dir);
    if (state.detail) parts.push('detail=' + encodeURIComponent(state.detail));
    var next = parts.length ? '#' + parts.join('&') : '#';
    if (window.location.hash !== next) history.replaceState(null, '', next);
  }

  var h0 = readHash();
  var state = {
    tab: ['all', 'watchlist', 'early', 'live'].indexOf(h0.tab) >= 0 ? h0.tab : 'all',
    q: h0.q || '',
    cat: h0.cat || '',
    sort: h0.sort || 'rank',
    dir: h0.dir === 'desc' ? 'desc' : 'asc',
    detail: h0.detail || '',
  };

  /* ---------- meta strip + category list ---------- */
  $('meta-asof').textContent = R.as_of;
  $('meta-scanned').textContent = (R.scanned_size || R.board_size).toLocaleString('en-US');
  $('meta-watch').textContent = R.watchlist_size;
  $('meta-rows').textContent = R.board_size;

  var catSel = $('cat');
  var cats = {};
  R.rows.forEach(function (r) { if (r.category) cats[r.category] = true; });
  Object.keys(cats)
    .sort()
    .forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      catSel.appendChild(o);
    });

  /* ---------- filtering + sorting ---------- */
  function visibleRows() {
    var pool = state.tab === 'live' ? R.live.slice() : R.rows.slice();
    if (state.tab === 'watchlist') pool = pool.filter(function (r) { return r.watchlist; });
    if (state.tab === 'early') pool = pool.filter(function (r) { return !r.watchlist; });
    if (state.cat) pool = pool.filter(function (r) { return r.category === state.cat; });
    if (state.q) {
      var q = state.q.toLowerCase();
      pool = pool.filter(function (r) {
        return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.toLowerCase().indexOf(q) >= 0;
      });
    }
    var key = state.sort;
    var dir = state.dir === 'desc' ? -1 : 1;
    pool.sort(function (a, b) {
      var av = key === 'chains' ? (a.chains[0] || '') : a[key];
      var bv = key === 'chains' ? (b.chains[0] || '') : b[key];
      if (av == null && bv == null) return a.slug < b.slug ? -1 : 1;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir || (a.slug < b.slug ? -1 : 1);
      if (av !== bv) return (av - bv) * dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return pool;
  }

  function render() {
    var pool = visibleRows();
    var live = state.tab === 'live';

    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === state.tab ? 'true' : 'false');
    });
    document.querySelectorAll('#board thead th').forEach(function (th) {
      if (th.dataset.sort === state.sort) th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
    var lastTh = document.querySelector('#board thead th[data-sort="implied_value_usd"]');
    lastTh.textContent = live ? 'Market cap' : 'Implied value';
    lastTh.dataset.sort = live ? 'mcap_usd' : 'implied_value_usd';

    countEl.textContent = 'Showing ' + pool.length + ' of ' + (live ? R.live_size : R.board_size) + ' rows';
    emptyEl.hidden = pool.length > 0;

    var html = '';
    pool.forEach(function (r) {
      var rankCell = live ? '<b>—</b>' : '<b>' + r.rank + '</b>';
      var valueCell = live
        ? '<span class="val">' + money(r.mcap_usd) + '</span>'
        : '<span class="val">' + money(r.implied_value_usd) + '</span>';
      var badge = !live && r.watchlist ? '<span class="badge">Watchlist</span>' : '';
      html +=
        '<tr data-slug="' + esc(r.slug) + '" aria-selected="' + (state.detail === r.slug) + '">' +
        '<td class="rank">' + rankCell + '</td>' +
        '<td><span class="name">' + esc(r.name) + badge + '</span><small>' + esc(r.slug) + '</small></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="chains">' + esc(chains(r, 2)) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (live ? '—' : age(r.age_days)) + '</td>' +
        '<td class="num">' + valueCell + '</td>' +
        '</tr>';
    });
    rowsEl.innerHTML = html;
    renderDetail();
    writeHash();
  }

  /* ---------- detail panel ---------- */
  function findRow(slug) {
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) return { row: R.rows[i], live: false };
    for (var j = 0; j < R.live.length; j++) if (R.live[j].slug === slug) return { row: R.live[j], live: true };
    return null;
  }

  function renderDetail() {
    if (!state.detail) {
      detailEl.hidden = true;
      detailBody.innerHTML = '';
      return;
    }
    var found = findRow(state.detail);
    if (!found) {
      detailEl.hidden = true;
      return;
    }
    var r = found.row;
    var out = '';
    if (found.live) {
      out +=
        '<h2>' + esc(r.name) + '</h2>' +
        '<p class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'No category') + ' · ' + esc(chains(r)) + ' · token already trades</p>' +
        '<div class="facts">' +
        '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd></div>' +
        '<div><dt>Market cap</dt><dd>' + money(r.mcap_usd) + '</dd></div>' +
        '<div><dt>7-day change</dt><dd>' + pct(r.change_7d) + '</dd></div>' +
        '<div><dt>Status</dt><dd>Live token</dd></div>' +
        '</div>' +
        '<h3>Why there is no farm plan</h3>' +
        '<p>This protocol records a token that already trades, so the market has priced it. ' +
        'The radar shows it at the market\u2019s own value and scores nothing for it — a farm plan ' +
        'here would be a plan to buy a traded token, not to farm a launch.</p>';
    } else {
      var m = r.model;
      var base = Math.round(r.tvl_usd * m.base_multiple);
      out +=
        '<h2>' + esc(r.name) + (r.watchlist ? ' <span class="badge">Watchlist</span>' : '') + '</h2>' +
        '<p class="sub">Rank ' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'No category') + ' · ' + esc(chains(r)) + ' · records no token</p>' +
        '<div class="facts">' +
        '<div><dt>Implied value</dt><dd>' + money(r.implied_value_usd) + '<small>rank ' + r.rank + ' of ' + R.board_size + '</small></dd></div>' +
        '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '<small>7-day ' + (r.change_7d == null ? 'unreported' : (r.change_7d >= 0 ? '+' : '') + r.change_7d + '%') + '</small></dd></div>' +
        '<div><dt>Age</dt><dd>' + age(r.age_days) + '<small>listed ' + esc(r.listed_at || 'unknown') + '</small></dd></div>' +
        '<div><dt>Chains</dt><dd>' + r.chains.length + '<small>' + esc(chains(r)) + '</small></dd></div>' +
        '</div>' +
        '<h3>Model breakdown — how ' + money(r.implied_value_usd) + ' is reached</h3>' +
        '<div class="facts">' +
        '<div><dt>Base · TVL × 0.25</dt><dd>' + money(base) + '</dd></div>' +
        '<div><dt>Growth · ' + (m.growth_pct >= 0 ? '+' : '') + m.growth_pct + '%</dt><dd>× ' + m.growth_multiplier.toFixed(2) + '</dd></div>' +
        '<div><dt>Maturity · ' + age(m.age_days) + '</dt><dd>× ' + m.maturity_multiplier.toFixed(2) + '</dd></div>' +
        '<div><dt>Breadth · ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</dt><dd>× ' + m.breadth_multiplier.toFixed(2) + '</dd></div>' +
        '<div><dt>Category · ' + esc(r.category || 'none') + '</dt><dd>× ' + m.category_multiplier.toFixed(2) + '</dd></div>' +
        '</div>' +
        '<h3>Farm plan — six steps</h3>' +
        '<ol class="steps">' +
        r.farm_steps
          .map(function (s) {
            var at = s.indexOf(' Cost: ');
            var text = at >= 0 ? s.slice(0, at) : s;
            var cost = at >= 0 ? s.slice(at + 7) : '';
            return '<li><p>' + esc(text) + '</p><p class="cost"><b>Cost &amp; time:</b> ' + esc(cost) + '</p></li>';
          })
          .join('') +
        '</ol>';
    }
    detailBody.innerHTML = out;
    detailEl.hidden = false;
  }

  /* ---------- events ---------- */
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tab = b.dataset.tab;
      state.detail = '';
      render();
    });
  });

  $('q').value = state.q;
  $('q').addEventListener('input', function (e) {
    state.q = e.target.value;
    render();
  });

  catSel.value = state.cat;
  catSel.addEventListener('change', function (e) {
    state.cat = e.target.value;
    render();
  });

  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.dataset.sort;
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else {
        state.sort = key;
        state.dir = key === 'name' || key === 'category' || key === 'chains' ? 'asc' : 'desc';
      }
      render();
    });
  });

  rowsEl.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    state.detail = state.detail === tr.dataset.slug ? '' : tr.dataset.slug;
    render();
    if (state.detail) detailEl.scrollIntoView({ block: 'nearest' });
  });

  $('detail-close').addEventListener('click', function () {
    state.detail = '';
    render();
  });

  window.addEventListener('hashchange', function () {
    var h = readHash();
    state.tab = ['all', 'watchlist', 'early', 'live'].indexOf(h.tab) >= 0 ? h.tab : 'all';
    state.q = h.q || '';
    state.cat = h.cat || '';
    state.sort = h.sort || 'rank';
    state.dir = h.dir === 'desc' ? 'desc' : 'asc';
    state.detail = h.detail || '';
    $('q').value = state.q;
    catSel.value = state.cat;
    render();
  });

  render();
})();
