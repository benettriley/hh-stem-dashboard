// STEM building pages, written for high school students: each page leads with a
// live, plain-English headline and shows the numbers behind it.
(function () {
  const { esc, fmt, timeStr, find, latest, points, isOn, missing, dataDay, onDay, when } = Dash.h;
  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const C = window.DASH_CONFIG;
  const STEM = 'Harpeth Hall STEM';
  const stem = (report, pred) => find(report, Object.assign({ building: STEM }, pred));
  const validTemp = (v) => typeof v === 'number' && v >= C.VALID_ROOM_TEMP_F[0] && v <= C.VALID_ROOM_TEMP_F[1];
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const head = (eyebrow, title, dek) =>
    `<header class="s-head"><div class="s-eyebrow">${eyebrow}</div><h1 class="s-title">${title}</h1>${dek ? `<p class="s-dek">${dek}</p>` : ''}</header>`;

  /** Value of a series nearest to time t. */
  function valueAt(s, t) {
    let best = null;
    points(s).forEach(([d, v]) => { if (!best || Math.abs(d - t) < Math.abs(best[0] - t)) best = [d, v]; });
    return best ? best[1] : null;
  }

  // ---------- rooms: sensors grouped by room number ----------
  /** STEM rooms keyed by number: { num, name, awair, wall: [temps], setpoints: [..] } */
  function stemRooms() {
    const rooms = new Map();
    const room = (num) => rooms.get(num) || rooms.set(num, { num, name: null, awair: null, awairS: null, wall: [], wallS: [], sp: [] }).get(num);
    stem('comfort', { point: 'Space Temperature Active' }).forEach((s) => {
      const m = s.equipment.match(/^(\d{3})\s+(.*)$/);
      if (!m || !validTemp(latest(s))) return;
      const r = room(m[1]);
      if (/AWAIR/i.test(m[2])) { r.awair = latest(s); r.awairS = s; }
      else {
        r.wall.push(latest(s));
        r.wallS.push(s);
        r.name = r.name || m[2].replace(/\s+(VAV|FCU)[\s-]?[\w-]*$/i, '');
      }
    });
    stem('comfort', { point: 'Space Temperature Setpoint Active' }).forEach((s) => {
      const m = s.equipment.match(/^(\d{3})\s/);
      const v = latest(s);
      if (m && rooms.has(m[1]) && typeof v === 'number' && v >= C.VALID_SETPOINT_F[0] && v <= C.VALID_SETPOINT_F[1]) rooms.get(m[1]).sp.push(v);
    });
    return [...rooms.values()].map((r) => {
      const temps = [...r.wall, ...(r.awair != null ? [r.awair] : [])];
      return Object.assign(r, {
        label: `${r.num} ${r.name || 'Lab'}`,
        temp: avg(temps),
        wallAvg: r.wall.length ? avg(r.wall) : null,
        setpoint: r.sp.length ? avg(r.sp) : null,
      });
    });
  }

  // Spaces students don't use.
  const NOT_A_CLASSROOM = /mech|storage|corridor|stair/i;

  function renderRooms(el) {
    const rooms = stemRooms().filter((r) => !NOT_A_CLASSROOM.test(r.label)).sort((a, b) => b.temp - a.temp);
    if (!rooms.length) { el.innerHTML = missing('COMFORT'); return; }
    const hot = rooms[0];
    const cold = rooms[rooms.length - 1];
    const w = when(['comfort']);
    const lo = Math.floor(Math.min(...rooms.map((r) => Math.min(r.temp, r.setpoint || r.temp))) - 0.5);
    const hi = Math.ceil(Math.max(...rooms.map((r) => Math.max(r.temp, r.setpoint || r.temp))) + 0.5);
    const x = (v) => ((v - lo) / (hi - lo)) * 100;
    const ticks = [];
    for (let v = lo; v <= hi; v++) ticks.push(v);

    el.innerHTML = `<div class="s-rooms">
      <div>
        ${head(`STEM building · ${w === 'right now' ? 'live' : 'latest reading'}`, `${esc(hot.label)} ${w === 'right now' ? 'is' : 'was'} the warmest room in STEM ${w}.`,
          `${esc(cold.label)} is the coolest. Every classroom and lab, warmest to coolest.`)}
        <div class="s-stats">
          <div><div class="mid">${fmt(hot.temp, 1)}<small>°F</small></div><div class="label">Warmest · ${esc(hot.num)}</div></div>
          <div><div class="mid">${fmt(cold.temp, 1)}<small>°F</small></div><div class="label">Coolest · ${esc(cold.num)}</div></div>
          <div><div class="mid">${fmt(hot.temp - cold.temp, 1)}<small>°F</small></div><div class="label">Difference</div></div>
          <div><div class="mid">${fmt(avg(rooms.map((r) => r.temp)), 1)}<small>°F</small></div><div class="label">Building average</div></div>
        </div>
        <p class="s-note">Dots show each room's temperature. The thin line marks what its thermostat is set to. Rooms with two sensors show the average.</p>
      </div>
      <div class="s-dotplot">
        <div class="s-axis">${ticks.map((v) => `<span style="left:${x(v)}%">${v}°</span>`).join('')}</div>
        ${rooms.map((r) => `<div class="s-row">
          <div class="s-row-label">${esc(r.label)}</div>
          <div class="s-track">
            ${ticks.map((v) => `<i style="left:${x(v)}%"></i>`).join('')}
            ${r.setpoint != null ? `<b class="s-set" style="left:${x(r.setpoint)}%"></b>` : ''}
            <span class="s-dot" style="left:${x(r.temp)}%"></span>
          </div>
          <div class="s-row-val">${fmt(r.temp, 1)}°</div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  // ---------- outside vs inside ----------
  function renderOutside(el) {
    const oat = stem('buildings', { point: 'Outdoor Air Temperature Active' })[0];
    const rh = stem('buildings', { point: 'Outdoor Air Humidity Active' })[0];
    const day = dataDay(['buildings', 'comfort']);
    const out = points(oat).filter(onDay(day));
    if (!out.length) { el.innerHTML = missing('BUILDINGS'); return; }

    // Indoor: average of every STEM room sensor in each 15-minute slot.
    const slots = new Map();
    stem('comfort', { point: 'Space Temperature Active' }).filter((s) => /^\d{3}\s/.test(s.equipment)).forEach((s) => {
      points(s).forEach(([d, v]) => {
        if (!onDay(day)([d]) || !validTemp(v)) return;
        const k = Math.round(d.getTime() / 900000) * 900000;
        (slots.get(k) || slots.set(k, []).get(k)).push(v);
      });
    });
    const inside = [...slots.entries()].filter(([, a]) => a.length >= 5).sort((a, b) => a[0] - b[0]).map(([t, a]) => [new Date(t), avg(a)]);

    const range = (p) => { const v = p.map((q) => q[1]); return [Math.min(...v), Math.max(...v)]; };
    const [oLo, oHi] = range(out);
    const [iLo, iHi] = inside.length ? range(inside) : [null, null];
    const swingOut = oHi - oLo;
    const swingIn = inside.length ? iHi - iLo : null;

    el.innerHTML = `<div class="s-outside">
      <div class="s-outside-text">
        ${head(`STEM building · ${day.label}`, `Outside changed ${fmt(swingOut)}°F ${day.label}. Inside STEM, just ${fmt(swingIn, 1)}°F.`,
          'Walls, windows and the heating and cooling system work together to keep classrooms steady while the weather swings.')}
        <div class="s-stats s-stats-2">
          <div><div class="mid">${fmt(latest(oat))}<small>°F</small></div><div class="label">Outside ${when(['buildings'])}</div></div>
          <div><div class="mid">${inside.length ? fmt(inside[inside.length - 1][1], 1) : '--'}<small>°F</small></div><div class="label">Inside ${when(['comfort'])} (average)</div></div>
          <div><div class="mid">${fmt(oLo)}–${fmt(oHi)}<small>°F</small></div><div class="label">Outside low–high</div></div>
          <div><div class="mid">${fmt(latest(rh))}<small>%</small></div><div class="label">Outside humidity</div></div>
        </div>
      </div>
      <div class="s-chart">
        <div class="legend"><span><span class="swatch" style="background:var(--b2)"></span>Outside</span><span><span class="swatch" style="background:var(--b1)"></span>Inside STEM (room average)</span></div>
        <div class="chart-wrap" id="s-chart-out"></div>
      </div>
    </div>`;
    Charts.lineChart(el.querySelector('#s-chart-out'), {
      series: [{ name: 'Outside', color: 'var(--b2)', points: out }, { name: 'Inside', color: 'var(--b1)', points: inside }],
      xStart: day.start, xEnd: day.end, unit: '°', yPad: 2, endLabels: true, strokeWidth: 4, timeZone: C.TIME_ZONE, label: `Outside vs inside temperature ${day.label}`,
    });
  }

  // ---------- energy: heating + cooling loops ----------
  function renderEnergy(el) {
    const v = (equipment, point) => latest(stem('plant', { equipment, point })[0]);
    if (!stem('plant', {}).length) { el.innerHTML = missing('PLANT'); return; }
    const day = dataDay(['plant']);
    const w = when(['plant']);
    const is = w === 'right now' ? 'is' : 'was';

    const chwT = v('Chiller 1', 'Evaporator Leaving Water Temperature');
    const chwSp = v('Chiller 1', 'Chilled Water Setpoint');
    const cap = v('Chiller 1', 'Actual Running Capacity');
    const mode = v('Chiller 1', 'Running Mode');
    const flow = v('CHWS', 'Chilled Water Flow Local');
    const cooling = (typeof cap === 'number' && cap > 0) || isOn(mode) === true;

    const boilers = ['Boiler 1', 'Boiler 2'].map((b) => ({ name: b, rate: v(b, 'Boiler Firing Rate'), out: v(b, 'Boiler Leaving Temperature') }));
    const firing = boilers.filter((b) => typeof b.rate === 'number' && b.rate > 0);
    const hws = v('HWS', 'Hot Water Supply Temperature');
    const hwr = v('HWS', 'Hot Water Return Temperature');
    const heating = firing.length > 0;

    const lead = capFirst(w);
    const title = cooling && heating ? `${lead}, STEM ${is} heating and cooling at the same time.`
      : cooling ? `${lead}, STEM ${is} making cold water to cool the building.`
        : heating ? `${lead}, STEM ${is} making hot water to heat the building.`
          : `${lead}, the heating and cooling plant ${is} resting.`;
    const tubSec = typeof flow === 'number' && flow > 0 ? 40 / (flow / 60) : null;   // 40-gallon bathtub

    el.innerHTML = `<div class="s-energy">
      ${head('STEM building · heating & cooling', title,
        cooling && heating ? 'Big buildings often do both: some spaces (labs, sunny rooms, crowded classes) need cooling while others need warmth.' : '')}
      <div class="s-loops">
        <section class="s-loop s-cool">
          <div class="s-loop-head"><h2>Cooling · Chiller 1</h2>${typeof mode === 'string' ? `<span class="pill ${cooling ? 'good' : 'off'}">${esc(mode.replace(/^Chiller In\s+/i, '').replace(/\s+Mode$/i, ''))}</span>` : ''}</div>
          <div class="big">${fmt(chwT, 1)}<small>°F</small></div>
          <div class="label">Water leaving the chiller · target ${fmt(chwSp)}°F</div>
          <div class="s-facts">
            <div><b>${fmt(flow)}</b> gallons per minute flowing through the building${tubSec ? ` · that's a bathtub every <b>${fmt(tubSec)}</b> seconds` : ''}</div>
            <div>Chiller working at <b>${fmt(cap)}%</b> of its full power</div>
          </div>
          <div class="chart-wrap s-spark" id="s-spark-chw"></div>
          <div class="label">Chilled water temperature ${day.label}</div>
        </section>
        <section class="s-loop s-heat">
          <div class="s-loop-head"><h2>Heating · Boilers</h2><span class="pill ${heating ? 'good' : 'off'}">${heating ? `${firing.map((b) => esc(b.name)).join(' + ')} firing` : 'Idle'}</span></div>
          <div class="big">${fmt(hws, 1)}<small>°F</small></div>
          <div class="label">Hot water going out to the building</div>
          <div class="s-facts">
            <div>It comes back at <b>${fmt(hwr, 1)}°F</b>: the rooms soaked up <b>${typeof hws === 'number' && typeof hwr === 'number' ? fmt(hws - hwr, 1) : '--'}°F</b> worth of heat from every gallon</div>
            ${boilers.map((b) => `<div>${esc(b.name)} burner at <b>${fmt(b.rate)}%</b></div>`).join('')}
          </div>
          <div class="chart-wrap s-spark" id="s-spark-hw"></div>
          <div class="label">Hot water temperature ${day.label}</div>
        </section>
      </div>
    </div>`;
    const spark = (id, s, color) => Charts.lineChart(el.querySelector(id), {
      series: [{ name: '', color, points: points(s).filter(onDay(day)) }], xStart: day.start, xEnd: day.end, unit: '°', yPad: 1, timeZone: C.TIME_ZONE,
    });
    spark('#s-spark-chw', stem('plant', { equipment: 'Chiller 1', point: 'Evaporator Leaving Water Temperature' })[0], 'var(--b1)');
    spark('#s-spark-hw', stem('plant', { equipment: 'HWS', point: 'Hot Water Supply Temperature' })[0], 'var(--b2)');
  }

  // ---------- fresh air / free cooling ----------
  const IN_H2O_TO_PSI = 0.0361;

  function renderAir(el) {
    const units = ['AHU-01', 'RTU-02', 'RTU-03'];
    if (!stem('air', {}).length) { el.innerHTML = missing('AIR'); return; }
    const day = dataDay(['air', 'buildings']);
    const pt = (u, re) => stem('air', { equipment: u, point: re })[0];
    const damper = pt('AHU-01', /^Outdoor Air Damper Position/);
    const dPts = points(damper).filter(onDay(day));
    const oat = stem('buildings', { point: 'Outdoor Air Temperature Active' })[0];
    const oPts = points(oat).filter(onDay(day));

    const peak = dPts.reduce((b, p) => (!b || p[1] > b[1] ? p : b), null);
    const title = peak && peak[1] >= 50
      ? `${day.isToday ? '' : 'Yesterday '}${day.isToday ? 'At' : 'at'} ${timeStr(peak[0])}, AHU-01 opened its outside-air damper to ${fmt(peak[1])}%.`
      : 'STEM brings in fresh outside air all day.';
    const dek = peak && peak[1] >= 50 && oat
      ? `It was only ${fmt(valueAt(oat, peak[0]))}°F outside, cool enough to chill the building with outdoor air instead of running the chiller. Engineers call this "free cooling."`
      : 'Each air unit mixes outdoor air with building air, cools it, and pushes it through the ducts to every room.';

    el.innerHTML = `<div class="s-air">
      <div class="s-air-main">
        ${head('STEM building · fresh air', title, dek)}
        <div class="s-pair">
          <div class="chart-card"><h2 class="s-h2">AHU-01 outside-air damper (% open)</h2><div class="chart-wrap" id="s-chart-damper"></div></div>
          <div class="chart-card"><h2 class="s-h2">Outside temperature</h2><div class="chart-wrap" id="s-chart-oat"></div></div>
        </div>
      </div>
      <div class="s-units">
        ${units.map((u) => {
          const fan = latest(pt(u, /^Supply Fan Status/));
          const sat = latest(pt(u, /^Discharge Air Temperature$/));
          const dmp = latest(pt(u, /^Outdoor Air Damper Position/));
          const dsp = latest(pt(u, /^Duct Static Pressure Active/));
          return `<div class="s-unit">
            <div class="s-loop-head"><h2>${esc(u)}</h2>${fan == null ? '' : `<span class="pill ${isOn(fan) ? 'good' : 'off'}">Fan ${isOn(fan) ? 'on' : 'off'}</span>`}</div>
            <div class="mid">${fmt(sat)}<small>°F</small></div>
            <div class="label">Air it sends to rooms</div>
            <div class="s-facts">
              <div>Outside-air damper <b>${fmt(dmp)}%</b> open</div>
              ${typeof dsp === 'number' ? `<div>Duct pressure <b>${fmt(dsp, 2)}</b> inches of water (just <b>${fmt(dsp * IN_H2O_TO_PSI, 3)}</b> psi)</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
    const opts = { xStart: day.start, xEnd: day.end, timeZone: C.TIME_ZONE };
    Charts.lineChart(el.querySelector('#s-chart-damper'), Object.assign({ series: [{ name: 'Damper', color: 'var(--hh)', points: dPts }], unit: '%', yPad: 5, yMin: 0, yMax: 100 }, opts));
    Charts.lineChart(el.querySelector('#s-chart-oat'), Object.assign({ series: [{ name: 'Outside', color: 'var(--b2)', points: oPts }], unit: '°', yPad: 2 }, opts));
  }

  Dash.register('stem-rooms', { title: 'STEM Rooms', reports: ['comfort'], render: renderRooms });
  Dash.register('stem-outside', { title: 'STEM Outside vs Inside', reports: ['buildings', 'comfort'], render: renderOutside });
  Dash.register('stem-energy', { title: 'STEM Heating & Cooling', reports: ['plant'], render: renderEnergy });
  Dash.register('stem-air', { title: 'STEM Fresh Air', reports: ['air', 'buildings'], render: renderAir });})();
