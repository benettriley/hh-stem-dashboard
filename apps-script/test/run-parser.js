// Local check of parseEnsembleCsv() against a real export, with minimal stand-ins
// for the Apps Script Utilities functions it uses.
// Usage: node apps-script/test/run-parser.js ["path/to/export.csv"]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

process.env.TZ = 'America/Chicago';

const Utilities = {
  parseCsv(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  },
  // Only supports the 'M/d/yyyy h:mm:ss a' pattern used by toIso_().
  parseDate(s, tz, fmt) {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i);
    if (!m) throw new Error('Unparseable date: ' + s);
    let h = +m[4] % 12;
    if (/pm/i.test(m[7])) h += 12;
    return new Date(+m[3], m[1] - 1, +m[2], h, +m[5], +m[6]);
  },
};

const ctx = { Utilities, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);

const csvPath = process.argv[2] || path.join(__dirname, 'HH-DASH TEST.csv');
const out = ctx.parseEnsembleCsv(fs.readFileSync(csvPath, 'utf8'), { subject: 'HH-DASH TEST STEM' });

console.log('meta:', JSON.stringify(out.meta));
out.series.forEach(s => {
  console.log(`- ${s.id} | ${s.building} | ${s.equipment} | ${s.point} | ${s.units} | ${s.samples.length} samples | first ${JSON.stringify(s.samples[0])} | latest ${JSON.stringify(s.latest)}`);
});
