// Generates dashboard/sample-data.json in the same shape as the Apps Script feed
// (dashboard.json), so the site can be built before the real exports arrive.
// Values are synthetic. meta.sample = true makes the dashboard show a SAMPLE badge.
// Usage: node tools/make-sample.js
const fs = require('fs');
const path = require('path');

const now = new Date();
const midnight = new Date(now);
midnight.setHours(0, 0, 0, 0);

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = (amp) => (rand() - 0.5) * 2 * amp;
const round1 = (n) => Math.round(n * 10) / 10;

/** Timestamps from midnight to now every `minutes`, offset by `offset` minutes. */
function times(minutes, offset = 0) {
  const out = [];
  for (let t = midnight.getTime() + offset * 60000; t <= now.getTime(); t += minutes * 60000) out.push(new Date(t));
  return out;
}
const hourOf = (d) => d.getHours() + d.getMinutes() / 60;

function series(building, equipment, point, units, fn, minutes = 15, offset = 0) {
  const samples = times(minutes, offset).map((d) => [d.toISOString(), fn(d)]);
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: slug(`${equipment} ${point}`),
    building: `Harpeth Hall ${building}`,
    equipment,
    point,
    units,
    latest: samples[samples.length - 1] || null,
    samples,
  };
}

function report(name, list) {
  return {
    meta: { sample: true, subject: `HH-DASH ${name}`, receivedAt: now.toISOString(), seriesCount: list.length },
    series: list,
  };
}

const outdoor = (d) => round1(52 + 14 * Math.max(0, Math.sin(((hourOf(d) - 7) / 12) * Math.PI)) + noise(0.6));

// ---------- rooms ----------
const range = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(2, '0')}`);
const rooms = {
  STEM: ['101 Commons VAV 2-05', '101 Commons VAV 2-10', '105 Corridor VAV 1-09', '106 Life Science VAV 1-10', '107 Prep VAV 1-08',
    '108 Life Science VAV 1-06', '110 Life Science VAV 1-03', '112 Corridor VAV 1-11', '115 Maker Space VAV 1-02', '201 Loft VAV 2-07',
    '202 Seminar VAV 2-04', '206 Chemistry VAV 2-15', '208 Chemistry VAV 2-13', '210 Physics VAV 2-06', '212 Physics VAV 2-01',
    '217 Lobby VAV 2-03', 'FCU-04', 'FCU-06', ...range('VAV 3-1-', 1, 13)],
  'Athletic Wellness Center': ['12.5T-RTU-1', '12.5T-RTU-2', '25T-RTU-1', '25T-RTU-2', '3T-RTU-1', '3T-RTU-2', '4T-RTU-1', '4T-RTU-2', '5T-RTU-1', '5T-RTU-2', '7.5T-RTU-1', '7.5T-RTU-2', '7.5T-RTU-3'],
  'Visual Arts': range('V-', 1, 35),
  'Middle School': [...range('V1-', 1, 50), ...range('V2-', 1, 14)],
  'Upper School': ['FCU-01', ...range('V1-', 1, 16), ...range('V1A-', 1, 18), ...range('V2-', 1, 12), ...range('V3-', 1, 10)],
};

const comfort = [];
Object.entries(rooms).forEach(([b, list]) => {
  list.forEach((room) => {
    const sp = [68.5, 69, 70, 71, 72][Math.floor(rand() * 5)];
    const bias = rand() < 0.08 ? noise(5) : noise(1.2); // a few rooms run hot/cold
    comfort.push(series(b, room, 'Space Temperature Active', '°F', (d) => round1(sp + bias + 0.6 * Math.sin(hourOf(d) / 3) + noise(0.3))));
    comfort.push(series(b, room, 'Space Temperature Setpoint Active', '°F', () => sp));
  });
});

// ---------- buildings ----------
const areas = {
  STEM: ['AHU-01 Area', 'RTU-02 Area', 'RTU-03 Area'],
  'Athletic Wellness Center': ['Athletic Wellness Center Area'],
  'Visual Arts': ['Visual Arts Area'],
  'Middle School': ['AHU-1 Area', 'AHU-2 Area'],
  'Upper School': ['AHU-01 Area', 'RTU-01 Area', 'RTU-02 Area', 'RTU-03 Area'],
};
const occupied = (d) => (hourOf(d) >= 7 && hourOf(d) < 17 ? 'Occupied' : 'Unoccupied');
const buildings = [
  series('STEM', 'HWS', 'Outdoor Air Temperature Active', '°F', outdoor, 60),
  series('STEM', 'HWS', 'Outdoor Air Humidity Active', '%', (d) => round1(78 - 30 * Math.max(0, Math.sin(((hourOf(d) - 7) / 12) * Math.PI)) + noise(2)), 60),
];
Object.entries(areas).forEach(([b, list], bi) => {
  list.forEach((a) => {
    const base = 69.5 + bi * 0.4;
    buildings.push(series(b, a, 'Space Temperature Average', '°F', (d) => round1(base + (occupied(d) === 'Occupied' ? 1.2 : -0.8) + noise(0.3))));
    buildings.push(series(b, a, 'Space Maximum Temperature', '°F', (d) => round1(base + 3 + noise(0.6))));
    buildings.push(series(b, a, 'Space Minimum Temperature', '°F', (d) => round1(base - 2.5 + noise(0.6))));
    buildings.push(series(b, a, 'Occupancy Status', '', occupied));
    buildings.push(series(b, a, 'Heat/Cool Mode Status', '', () => 'Heat'));
  });
});

// ---------- plant ----------
const plant = [];
[['STEM', 'Chiller 1'], ['Visual Arts', 'Chiller'], ['Middle School', 'Chiller']].forEach(([b, ch], i) => {
  plant.push(series(b, ch, 'Evaporator Leaving Water Temperature', '°F', () => round1(42 + i * 0.6 + noise(0.4))));
  plant.push(series(b, ch, 'Chilled Water Setpoint', '°F', () => 42 + i));
  plant.push(series(b, ch, 'Actual Running Capacity', '%', (d) => round1(Math.max(0, 25 + 30 * Math.sin(((hourOf(d) - 8) / 12) * Math.PI) + noise(4)))));
  plant.push(series(b, ch, 'Running Mode', '', () => (i === 1 ? 'Chiller In Stop Mode' : 'Chiller In Run Mode')));
});
['Boiler 1', 'Boiler 2'].forEach((bl, i) => {
  plant.push(series('STEM', bl, 'Boiler Entering Temperature', '°F', () => round1(118 + noise(2)), 15));
  plant.push(series('STEM', bl, 'Boiler Leaving Temperature', '°F', () => round1(i ? 120 : 138 + noise(2)), 15));
  plant.push(series('STEM', bl, 'Boiler Firing Rate', '%', (d) => (i ? 0 : round1(Math.max(0, 45 - 25 * Math.sin(((hourOf(d) - 7) / 12) * Math.PI) + noise(5))))));
  plant.push(series('STEM', bl, 'Boiler Status', '', () => (i ? 'Off' : 'On'), 30));
});
plant.push(series('STEM', 'HWS', 'Hot Water Supply Temperature', '°F', () => round1(136 + noise(2))));
plant.push(series('STEM', 'HWS', 'Hot Water Return Temperature', '°F', () => round1(121 + noise(2))));
plant.push(series('STEM', 'CHWS', 'Chilled Water Flow Local', 'gpm', (d) => round1(Math.max(0, 80 + 60 * Math.sin(((hourOf(d) - 8) / 12) * Math.PI) + noise(5)))));
['CHWP-1', 'CHWP-2'].forEach((p, i) => plant.push(series('STEM', 'CHWS', `${p} Speed Command`, '%', () => (i ? 0 : round1(55 + noise(5))))));
['HWP-1', 'HWP-2'].forEach((p, i) => plant.push(series('STEM', 'HWS', `${p} Speed Command`, '%', () => (i ? 0 : round1(48 + noise(5))))));

// ---------- air ----------
const ahus = [['STEM', 'AHU-01'], ['STEM', 'RTU-02'], ['STEM', 'RTU-03'], ['Middle School', 'Ahu-1'], ['Middle School', 'Ahu-2'],
  ['Upper School', 'AHU-1'], ['Upper School', 'RTU-1'], ['Upper School', 'RTU-2'], ['Upper School', 'RTU-3'], ['Visual Arts', 'Heat and Cool Control']];
const air = [];
ahus.forEach(([b, a], i) => {
  const on = (d) => (hourOf(d) >= 6 && hourOf(d) < 18) || i === 0;
  air.push(series(b, a, 'Supply Fan Status', '', (d) => (on(d) ? 'On' : 'Off')));
  air.push(series(b, a, 'Supply Fan Speed Command', '%', (d) => (on(d) ? round1(55 + noise(10)) : 0)));
  air.push(series(b, a, 'Outdoor Air Damper Position', '%', (d) => (on(d) ? round1(20 + 25 * rand()) : 0)));
  air.push(series(b, a, 'Discharge Air Temperature', '°F', () => round1(56 + noise(1.5))));
  air.push(series(b, a, 'Discharge Air Temperature Setpoint Active', '°F', () => 55));
  air.push(series(b, a, 'Duct Static Pressure Active', 'in. W.C.', (d) => (on(d) ? round1(1.2 + noise(0.2)) : 0)));
});

const out = {
  updatedAt: now.toISOString(),
  sample: true,
  reports: {
    comfort: report('COMFORT', comfort),
    buildings: report('BUILDINGS', buildings),
    plant: report('PLANT', plant),
    air: report('AIR', air),
  },
};
const dest = path.join(__dirname, '..', 'dashboard', 'sample-data.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB, ${comfort.length + buildings.length + plant.length + air.length} series)`);
