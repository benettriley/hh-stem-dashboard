// Harpeth Hall building dashboard: one page per HTML file (<body data-page="comfort">).
// Each page loads only its own report from the Apps Script feed and refreshes itself;
// the BrightSign presentation decides which page is on screen and for how long.
(function () {
  const C = window.DASH_CONFIG;

  let data = null;
  let offline = false;

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, digits = 0) => (typeof v === 'number' ? v.toFixed(digits) : '--');
  const pct = (v) => Math.max(0, Math.min(100, typeof v === 'number' ? v : 0));

  const bIndex = (b) => C.BUILDINGS.findIndex((x) => x.key === b);
  const bShort = (b) => (C.BUILDINGS[bIndex(b)] || {}).short || String(b).replace(/^Harpeth Hall /, '');
  const bColor = (b) => `var(--b${bIndex(b) + 1})`;

  const timeStr = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: C.TIME_ZONE });

  function series(report) {
    return (data && data.reports && data.reports[report] && data.reports[report].series) || [];
  }
  function find(report, pred) {
    return series(report).filter((s) => Object.keys(pred).every((k) => (pred[k] instanceof RegExp ? pred[k].test(s[k]) : s[k] === pred[k])));
  }
  const latest = (s) => (s && s.latest ? s.latest[1] : null);
  const points = (s) => (s ? s.samples.filter((p) => typeof p[1] === 'number').map((p) => [new Date(p[0]), p[1]]) : []);

  /** Status values may arrive as text ("Occupied", "Chiller In Run Mode") or numbers. */
  function isOn(v) {
    if (typeof v === 'number') return v > 0;
    if (typeof v !== 'string') return null;
    if (/unocc|off|stop|disabl|inactive|standby/i.test(v)) return false;
    if (/occ|on|run|enabl|active/i.test(v)) return true;
    return null;
  }
  const pill = (on, onText, offText) =>
    on == null ? '<span class="pill">Unknown</span>' : `<span class="pill ${on ? 'good' : 'off'}">${on ? onText : offText}</span>`;

  /** "101 Commons VAV 2-05" -> "101 Commons"; plain unit names stay as-is. */
  const roomName = (eq) => (/^\d/.test(eq) ? eq.replace(/\s+(VAV|FCU)[\s-]?[\w-]*$/i, '') : eq);

  function reportTime(report) {
    const t = series(report).map((s) => (s.latest ? s.latest[0] : '')).sort().pop();
    return t ? new Date(t) : null;
  }
  const missing = (name) => `<div class="empty">Waiting for the HH-DASH ${name} export.</div>`;

  // ---------- page: comfort ----------
  function renderComfort(el) {
    const temps = find('comfort', { point: 'Space Temperature Active' });
    const sps = find('comfort', { point: 'Space Temperature Setpoint Active' });
    if (!temps.length) { el.innerHTML = missing('COMFORT'); return; }

    const spBy = new Map(sps.map((s) => [`${s.building}|${s.equipment}`, latest(s)]));
    const within = (v, [lo, hi]) => typeof v === 'number' && v >= lo && v <= hi;
    const all = temps
      .map((s) => ({ b: s.building, eq: s.equipment, t: latest(s), sp: spBy.get(`${s.building}|${s.equipment}`) }))
      .filter((r) => typeof r.t === 'number' && typeof r.sp === 'number');
    const rooms = all
      .filter((r) => within(r.sp, C.VALID_SETPOINT_F) && within(r.t, C.VALID_ROOM_TEMP_F))
      .map((r) => Object.assign(r, { dev: r.t - r.sp }));
    const skipped = all.length - rooms.length;

    const band = C.COMFORT_BAND_F;
    const ok = (r) => Math.abs(r.dev) <= band;
    const campus = rooms.length ? Math.round((100 * rooms.filter(ok).length) / rooms.length) : null;

    const tiles = C.BUILDINGS.map((b) => {
      const rs = rooms.filter((r) => r.b === b.key);
      if (!rs.length) return '';
      const p = Math.round((100 * rs.filter(ok).length) / rs.length);
      const avg = rs.reduce((a, r) => a + r.t, 0) / rs.length;
      return `<div class="card bldg" style="--bc:${bColor(b.key)}">
        <h3>${esc(b.short)}</h3>
        <div class="pct">${p}<small>%</small></div>
        <div class="sub">rooms comfortable</div>
        <div class="meter"><div style="width:${p}%"></div></div>
        <div class="facts">
          <div>Average <b>${fmt(avg, 1)}°F</b></div>
          <div>Rooms <b>${rs.length}</b></div>
          <div>Too warm <b>${rs.filter((r) => r.dev > band).length}</b></div>
          <div>Too cool <b>${rs.filter((r) => r.dev < -band).length}</b></div>
        </div>
      </div>`;
    }).join('');

    const list = (arr) => (arr.length
      ? `<ul class="room-list">${arr.map((r) => `<li>
          <div>${esc(roomName(r.eq))}<div class="where">${esc(bShort(r.b))}</div></div>
          <div class="dev">${fmt(r.t, 1)}°F<small>${r.dev > 0 ? '+' : ''}${fmt(r.dev, 1)}° vs ${fmt(r.sp, 1)}°</small></div>
        </li>`).join('')}</ul>`
      : '<div class="empty">Every room is within range.</div>');
    const warm = rooms.filter((r) => r.dev > band).sort((a, b) => b.dev - a.dev).slice(0, 4);
    const cool = rooms.filter((r) => r.dev < -band).sort((a, b) => a.dev - b.dev).slice(0, 4);

    el.innerHTML = `<div class="comfort-grid">
      <div class="comfort-left">
        <div class="card comfort-hero">
          <div class="big">${campus == null ? '--' : campus}<small>%</small></div>
          <p>of ${rooms.length} rooms across campus are within <b>${band}°F</b> of their setpoint right now.
            ${skipped ? `<br><span class="sub">${skipped} room${skipped === 1 ? '' : 's'} not counted (no valid setpoint or sensor reading)</span>` : ''}</p>
        </div>
        <div class="bldg-grid">${tiles}</div>
      </div>
      <div class="room-lists">
        <div class="card"><h2><span class="pill warning">Warmest rooms</span></h2>${list(warm)}</div>
        <div class="card"><h2><span class="pill cool">Coolest rooms</span></h2>${list(cool)}</div>
      </div>
    </div>`;
  }

  // ---------- page: weather & buildings ----------
  /** Average several series per building onto shared 15-minute slots. */
  function buildingAverages(list) {
    const by = new Map();
    list.forEach((s) => {
      const m = by.get(s.building) || new Map();
      points(s).forEach(([d, v]) => {
        const slot = Math.round(d.getTime() / 900000) * 900000;
        const a = m.get(slot) || [];
        a.push(v);
        m.set(slot, a);
      });
      by.set(s.building, m);
    });
    return C.BUILDINGS.filter((b) => by.has(b.key)).map((b) => ({
      name: b.short,
      color: bColor(b.key),
      building: b.key,
      points: [...by.get(b.key).entries()].sort((x, y) => x[0] - y[0]).map(([t, a]) => [new Date(t), a.reduce((p, q) => p + q, 0) / a.length]),
    }));
  }

  function renderWeather(el) {
    const oat = find('buildings', { point: 'Outdoor Air Temperature Active' })[0];
    const oah = find('buildings', { point: 'Outdoor Air Humidity Active' })[0];
    if (!oat && !series('buildings').length) { el.innerHTML = missing('BUILDINGS'); return; }

    const op = points(oat);
    const vals = op.map((p) => p[1]);
    const avgs = buildingAverages(find('buildings', { point: 'Space Temperature Average' }));

    const occ = C.BUILDINGS.map((b) => {
      const occS = find('buildings', { building: b.key, point: 'Occupancy Status' });
      if (!occS.length) return '';
      const states = occS.map((s) => isOn(latest(s)));
      const occupied = states.some((x) => x === true) ? true : states.every((x) => x === false) ? false : null;
      const mode = latest(find('buildings', { building: b.key, point: 'Heat/Cool Mode Status' })[0]);
      const avg = avgs.find((a) => a.building === b.key);
      const now = avg && avg.points.length ? avg.points[avg.points.length - 1][1] : null;
      return `<div class="occ" style="--bc:${bColor(b.key)}">
        <div class="name">${esc(b.short)}</div>
        <div class="temp">${fmt(now, 1)}°F</div>
        <div>${pill(occupied, 'Occupied', 'Unoccupied')}</div>
        <div class="sub">${mode == null ? '' : esc(typeof mode === 'number' ? `Mode ${mode}` : mode)}</div>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="weather-grid">
      <div class="card weather-now">
        <div>
          <h2>Outside now</h2>
          <div class="big">${fmt(latest(oat))}<small>°F</small></div>
          <div class="label">${oat && oat.latest ? `as of ${timeStr(new Date(oat.latest[0]))}` : ''}</div>
        </div>
        <div class="weather-stats">
          <div><div class="mid">${vals.length ? fmt(Math.max(...vals)) : '--'}<small>°</small></div><div class="label">Today's high</div></div>
          <div><div class="mid">${vals.length ? fmt(Math.min(...vals)) : '--'}<small>°</small></div><div class="label">Today's low</div></div>
          <div><div class="mid">${fmt(latest(oah))}<small>%</small></div><div class="label">Humidity</div></div>
        </div>
        <div class="chart-card"><h2>Outdoor temperature today</h2><div class="chart-wrap" id="chart-oat"></div></div>
      </div>
      <div class="card chart-card">
        <h2>Average indoor temperature by building</h2>
        <div class="legend">${avgs.map((a) => `<span><span class="swatch" style="background:${a.color}"></span>${esc(a.name)}</span>`).join('')}</div>
        <div class="chart-wrap" id="chart-bldg"></div>
      </div>
      <div class="occ-row">${occ}</div>
    </div>`;

    const day = startOfDay();
    Charts.lineChart($('#chart-oat', el), { series: [{ name: 'Outside', color: 'var(--hh)', points: op }], xStart: day, xEnd: new Date(), unit: '°', yPad: 2, timeZone: C.TIME_ZONE, label: 'Outdoor temperature today' });
    Charts.lineChart($('#chart-bldg', el), { series: avgs, xStart: day, xEnd: new Date(), unit: '°', yPad: 0.5, endLabels: true, strokeWidth: 3, timeZone: C.TIME_ZONE, label: 'Average indoor temperature by building' });
  }

  // ---------- page: plant ----------
  function renderPlant(el) {
    if (!series('plant').length) { el.innerHTML = missing('PLANT'); return; }
    const v = (equipment, point, building) => latest(find('plant', Object.assign({ equipment, point }, building ? { building } : {}))[0]);

    // Running Mode arrives as e.g. "Chiller In Run Mode" / "Chiller In Start Mode" / "Chiller In Stop Mode".
    const modePill = (mode) => {
      if (typeof mode !== 'string') return pill(null);
      const word = mode.replace(/^Chiller In\s+/i, '').replace(/\s+Mode$/i, '') || mode;
      const cls = /run/i.test(word) ? 'good' : /start/i.test(word) ? 'warning' : 'off';
      return `<span class="pill ${cls}">${esc(word)}</span>`;
    };
    const chillers = find('plant', { point: 'Evaporator Leaving Water Temperature' }).map((s) => {
      const cap = v(s.equipment, 'Actual Running Capacity', s.building);
      return `<div class="card">
        <div class="equip-head"><div><h3>${esc(bShort(s.building))} ${esc(s.equipment)}</h3><div class="sub">Chiller</div></div>${modePill(v(s.equipment, 'Running Mode', s.building))}</div>
        <div class="big">${fmt(latest(s), 1)}<small>°F</small></div>
        <div class="vs">water leaving · setpoint ${fmt(v(s.equipment, 'Chilled Water Setpoint', s.building), 1)}°F</div>
        <div class="meter-row"><span>Capacity</span><b>${fmt(cap)}%</b></div>
        <div class="meter"><div style="width:${pct(cap)}%"></div></div>
      </div>`;
    });

    const boilers = find('plant', { point: 'Boiler Leaving Temperature' }).map((s) => {
      const rate = v(s.equipment, 'Boiler Firing Rate', s.building);
      return `<div style="margin-bottom:22px">
        <div class="equip-head"><h3>${esc(s.equipment)}</h3>${pill(typeof rate === 'number' ? rate > 0 : null, 'Firing', 'Idle')}</div>
        <div class="mid">${fmt(latest(s))}<small>°F out</small></div>
        <div class="meter-row"><span>Firing rate</span><b>${fmt(rate)}%</b></div>
        <div class="meter"><div style="width:${pct(rate)}%"></div></div>
      </div>`;
    }).join('');

    const pump = (name) => {
      const sp = latest(find('plant', { point: `${name} Speed Command` })[0]);
      return `<div class="meter-row"><span>${name}</span><b>${fmt(sp)}%</b></div><div class="meter"><div style="width:${pct(sp)}%"></div></div>`;
    };
    const hws = v('HWS', 'Hot Water Supply Temperature');
    const hwr = v('HWS', 'Hot Water Return Temperature');

    el.innerHTML = `<div class="plant-grid">
      ${chillers.join('')}
      <div class="card"><h2>STEM boilers</h2>${boilers || '<div class="empty">No boiler data.</div>'}</div>
      <div class="card"><h2>STEM hot water loop</h2>
        <div class="loop">
          <div><div class="mid">${fmt(hws)}<small>°F</small></div><div class="label">Supply</div></div>
          <div><div class="mid">${fmt(hwr)}<small>°F</small></div><div class="label">Return</div></div>
        </div>
        <div class="vs" style="margin-top:16px">Heat delivered to rooms: <b>${typeof hws === 'number' && typeof hwr === 'number' ? fmt(hws - hwr) : '--'}°F</b> drop</div>
        ${pump('HWP-1')}${pump('HWP-2')}
      </div>
      <div class="card"><h2>STEM chilled water loop</h2>
        <div class="mid">${fmt(v('CHWS', 'Chilled Water Flow Local'))}<small>gal/min</small></div>
        <div class="label">Flow</div>
        ${pump('CHWP-1')}${pump('CHWP-2')}
      </div>
    </div>`;
  }

  // ---------- page: air ----------
  /** Meter only when the unit actually logs that value. */
  const meterRow = (label, v) => (typeof v === 'number'
    ? `<div class="meter-row"><span>${label}</span><b>${fmt(v)}%</b></div><div class="meter"><div style="width:${pct(v)}%"></div></div>`
    : '');

  function renderAir(el) {
    if (!series('air').length) { el.innerHTML = missing('AIR'); return; }
    // One card per air handler that has any data (not every unit logs fan status).
    const units = [];
    series('air').forEach((s) => {
      if (!units.some((u) => u.building === s.building && u.equipment === s.equipment)) units.push({ building: s.building, equipment: s.equipment });
    });
    const v = (s, point) => latest(find('air', { building: s.building, equipment: s.equipment, point })[0]);
    const ordered = units.sort((a, b) => bIndex(a.building) - bIndex(b.building) || a.equipment.localeCompare(b.equipment));
    el.innerHTML = `<div class="air-grid">${ordered.map((s) => {
      const status = v(s, 'Supply Fan Status');
      const speed0 = v(s, 'Supply Fan Speed Command');
      const on = status != null ? isOn(status) : typeof speed0 === 'number' ? speed0 > 0 : null;
      const speed = v(s, 'Supply Fan Speed Command');
      const damper = v(s, 'Outdoor Air Damper Position');
      const dat = v(s, 'Discharge Air Temperature');
      const datSp = v(s, 'Discharge Air Temperature Setpoint Active');
      return `<div class="card air-card" style="--bc:${bColor(s.building)}">
        <div class="equip-head"><div><h3>${esc(s.equipment)}</h3><div class="sub">${esc(bShort(s.building))}</div></div>${on == null ? '' : pill(on, 'Fan on', 'Fan off')}</div>
        <div class="mid">${fmt(dat)}<small>°F</small></div>
        <div class="label">air supplied${typeof datSp === 'number' ? ` · target ${fmt(datSp)}°F` : ''}</div>
        ${meterRow('Fan speed', speed)}
        ${meterRow('Fresh air damper', damper)}
      </div>`;
    }).join('')}</div>`;
  }

  // Page registry. Other files (stem.js) add pages with Dash.register(); `reports` lists the
  // feed reports a page needs (each fetched with ?report=name).
  const PAGES = {
    comfort: { title: 'Campus Comfort', reports: ['comfort'], render: renderComfort },
    weather: { title: 'Weather &amp; Buildings', reports: ['buildings'], render: renderWeather },
    plant: { title: 'Heating &amp; Cooling Plant', reports: ['plant'], render: renderPlant },
    air: { title: 'Fresh Air', reports: ['air'], render: renderAir },
  };
  let PAGE_KEY = null;
  let PAGE = null;

  /** Midnight (building time) of the day containing `ref`. */
  function startOfDay(ref = new Date()) {
    const local = new Date(ref.toLocaleString('en-US', { timeZone: C.TIME_ZONE }));
    return new Date(ref.getTime() - ref.getMilliseconds() - (local.getHours() * 3600 + local.getMinutes() * 60 + local.getSeconds()) * 1000);
  }
  const dayKey = (d) => d.toLocaleDateString('en-US', { timeZone: C.TIME_ZONE });

  /** Newest sample time across the given reports. */
  function dataTime(reports) {
    const ts = reports.map(reportTime).filter(Boolean);
    return ts.length ? new Date(Math.max(...ts)) : null;
  }

  /**
   * The day the data belongs to. Between midnight and the first export (~6 AM) the feed
   * still holds yesterday, so charts show that day and wording says "yesterday".
   */
  function dataDay(reports) {
    const t = dataTime(reports) || new Date();
    const isToday = dayKey(t) === dayKey(new Date());
    return { start: startOfDay(t), end: isToday ? new Date() : t, isToday, label: isToday ? 'today' : 'yesterday' };
  }
  const onDay = (day) => ([d]) => d >= day.start && d <= day.end;

  /** "right now" / "at 3:00 PM" / "at 10:00 PM yesterday", based on how old the data is. */
  function when(reports) {
    const t = dataTime(reports);
    if (!t) return 'right now';
    if (Date.now() - t.getTime() <= 90 * 60000) return 'right now';
    if (dayKey(t) === dayKey(new Date())) return `at ${timeStr(t)}`;
    return `at ${timeStr(t)} yesterday`;
  }

  function render() {
    const el = $('.page');
    try { PAGE.render(el); } catch (e) { el.innerHTML = `<div class="empty">Couldn't draw this page: ${esc(e.message)}</div>`; }
    updateStatus();
  }

  // ---------- data ----------
  let CACHE_KEY = null;

  /** Live: fetch just this page's reports (?report=name, in parallel) and wrap them like the full feed. */
  async function fetchFeed() {
    if (!C.FEED_URL) {
      const res = await fetch(C.SAMPLE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    const sep = C.FEED_URL.includes('?') ? '&' : '?';
    const got = await Promise.all(PAGE.reports.map(async (name) => {
      const res = await fetch(`${C.FEED_URL}${sep}report=${encodeURIComponent(name)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return [name, json && !json.error ? json : null];   // null = not exported yet
    }));
    return { reports: Object.fromEntries(got.filter(([, r]) => r)) };
  }

  async function load() {
    try {
      const json = await fetchFeed();
      if (!json || !json.reports) throw new Error('Unexpected feed');
      data = json;
      offline = false;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(json)); } catch (e) { /* storage is optional */ }
    } catch (e) {
      offline = true;
      if (!data) {
        try { data = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e2) { data = null; }
      }
      console.warn('Feed load failed:', e);
    }
    render();
  }

  // ---------- status tag (only visible when something is wrong) ----------
  function updateStatus() {
    const badge = $('#badge');
    const isSample = data && (data.sample || Object.values(data.reports || {}).some((r) => r.meta && r.meta.sample));
    const times = data ? PAGE.reports.map(reportTime).filter(Boolean) : [];
    const t = times.length ? new Date(Math.min(...times)) : null;   // oldest report on the page
    const stale = t && Date.now() - t.getTime() > C.STALE_HOURS * 3600000;
    badge.hidden = false;
    if (offline) { badge.className = 'badge offline'; badge.textContent = data ? 'Offline · last saved data' : 'Offline'; }
    else if (isSample) { badge.className = 'badge'; badge.textContent = 'Sample data'; }
    else if (stale) { badge.className = 'badge'; badge.textContent = `Data from ${timeStr(t)}`; }
    else badge.hidden = true;
  }

  /** Full-bleed page (no masthead/footer), built here so the four page files stay tiny. */
  function buildShell() {
    document.title = `${PAGE.title.replace('&amp;', '&')} · Harpeth Hall`;
    document.body.innerHTML = `<div id="stage">
      <main id="pages"><section class="page" data-page="${PAGE_KEY}"></section></main>
      <span id="badge" class="badge" hidden></span>
    </div>`;
  }

  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    const stage = $('#stage');
    stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  }

  function boot() {
    PAGE_KEY = document.body.dataset.page;
    PAGE = PAGES[PAGE_KEY];
    if (!PAGE) {
      document.body.textContent = `Unknown dashboard page "${PAGE_KEY}". Known pages: ${Object.keys(PAGES).join(', ')}.`;
      return;
    }
    CACHE_KEY = `hh-dash-${PAGE_KEY}`;
    buildShell();
    fit();
    addEventListener('resize', fit);
    // Draw the last saved copy immediately so the slide is never blank while the feed loads.
    try { data = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { data = null; }
    if (data) render();
    load();
    setInterval(load, C.REFRESH_MINUTES * 60000);
    scheduleDailyReload();
  }

  /** Full reload once a day so a player that runs for weeks starts fresh (cached data redraws instantly). */
  function scheduleDailyReload() {
    if (C.RELOAD_AT_HOUR == null) return;
    let next = startOfDay().getTime() + C.RELOAD_AT_HOUR * 3600000;
    if (next <= Date.now() + 60000) next += 24 * 3600000;
    setTimeout(() => location.reload(), next - Date.now());
  }

  // Shared helpers for page files like stem.js.
  window.Dash = {
    register(key, def) { PAGES[key] = def; },
    redraw() { if (PAGE) render(); },   // for testing from the console
    h: { $, esc, fmt, pct, timeStr, series, find, latest, points, isOn, pill, roomName, missing, startOfDay, meterRow, dataDay, onDay, when },
  };

  // Page scripts load after this file; boot once they've all registered.
  document.addEventListener('DOMContentLoaded', boot);
})();
