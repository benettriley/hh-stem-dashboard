// Minimal SVG line chart for signage (no pointer, so no hover layer).
// lineChart(el, {
//   series: [{ name, color, points: [[Date, number], ...] }],
//   xStart: Date, xEnd: Date, unit: '°F', yPad: 1, yMin, yMax, endLabels: true, timeZone
// })
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  function niceStep(span, target) {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  function hourLabel(d, tz) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', timeZone: tz }).replace(':00', '').replace(' ', '').toLowerCase();
  }

  function lineChart(el, opts) {
    el.innerHTML = '';
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 300;
    const m = { top: 16, right: opts.endLabels ? 250 : 24, bottom: 44, left: 64 };
    const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.label || 'line chart' }, el);

    const all = opts.series.flatMap((s) => s.points.map((p) => p[1]));
    if (!all.length) {
      svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 22 }, svg).textContent = 'No data yet today';
      return;
    }
    const pad = opts.yPad == null ? 1 : opts.yPad;
    let y0 = Math.min(...all) - pad;
    let y1 = Math.max(...all) + pad;
    const step = niceStep(y1 - y0, 4);
    y0 = Math.floor(y0 / step) * step;
    y1 = Math.ceil(y1 / step) * step;
    if (opts.yMin != null) y0 = Math.max(y0, opts.yMin);   // e.g. 0–100 for percentages
    if (opts.yMax != null) y1 = Math.min(y1, opts.yMax);

    const x0 = opts.xStart.getTime();
    const x1 = Math.max(opts.xEnd.getTime(), x0 + 3600000);
    const px = (t) => m.left + ((t - x0) / (x1 - x0)) * (W - m.left - m.right);
    const py = (v) => H - m.bottom - ((v - y0) / (y1 - y0)) * (H - m.top - m.bottom);

    // grid + y ticks
    for (let v = y0; v <= y1 + 1e-9; v += step) {
      svgEl('line', { x1: m.left, x2: W - m.right, y1: py(v), y2: py(v), stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
      svgEl('text', { x: m.left - 12, y: py(v) + 7, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 19 }, svg)
        .textContent = `${Math.round(v * 10) / 10}${opts.unit || ''}`;
    }
    // x ticks every 3 hours
    const tz = opts.timeZone;
    const first = new Date(x0);
    first.setMinutes(0, 0, 0);
    for (let t = first.getTime(); t <= x1; t += 3600000) {
      const d = new Date(t);
      const hr = Number(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }));
      if (t < x0 || hr % 3) continue;
      svgEl('text', { x: px(t), y: H - m.bottom + 30, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 19 }, svg).textContent = hourLabel(d, tz);
    }
    svgEl('line', { x1: m.left, x2: W - m.right, y1: H - m.bottom, y2: H - m.bottom, stroke: 'var(--axis)', 'stroke-width': 1 }, svg);

    // lines (2px) + end markers; end labels nudged apart so they never collide
    const ends = [];
    opts.series.forEach((s) => {
      if (!s.points.length) return;
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${px(p[0].getTime()).toFixed(1)},${py(p[1]).toFixed(1)}`).join('');
      svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': opts.strokeWidth || 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      const last = s.points[s.points.length - 1];
      svgEl('circle', { cx: px(last[0].getTime()), cy: py(last[1]), r: 6, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      ends.push({ x: px(last[0].getTime()), y: py(last[1]), s, v: last[1] });
    });
    if (opts.endLabels) {
      ends.sort((a, b) => a.y - b.y);
      const gap = 26;
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;
      ends.forEach((e) => {
        const t = svgEl('text', { x: W - m.right + 16, y: e.y + 7, fill: 'var(--ink-2)', 'font-size': 20 }, svg);
        t.textContent = `${e.s.name} ${Math.round(e.v)}${opts.unit || ''}`;
      });
    }
  }

  window.Charts = { lineChart };
})();
