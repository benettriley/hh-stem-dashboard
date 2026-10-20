/**
 * Harpeth Hall dashboard: Tracer Ensemble email export -> JSON feed.
 *
 * Flow:
 *   1. Ensemble emails a CSV (subject starts with CONFIG.SUBJECT_PREFIX).
 *   2. processInbox() (time trigger) parses new attachments and saves the latest
 *      data per report as JSON in a Drive folder.
 *   3. doGet() serves that JSON to the dashboard site / BrightSign.
 *
 * First run: open this project, run setup() once and approve permissions,
 * then Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 */

const CONFIG = {
  SUBJECT_PREFIX: 'HH-DASH',
  PROCESSED_LABEL: 'HH-DASH/processed',
  DRIVE_FOLDER: 'HH-DASH data',
  COMBINED_FILE: 'dashboard.json',
  TRIGGER_MINUTES: 5,
  SEARCH_WINDOW: '3d',
  TIME_ZONE: 'America/Chicago',
  // Only Ensemble's own, DKIM-signed mail is accepted; anything else is ignored
  // (otherwise anyone who knows the mailbox could put fake numbers on the screens).
  ALLOWED_SENDER: 'tes_admin@ensemblecloud.com',
  DKIM_DOMAIN: 'ensemblecloud.com',
};

// ---------- setup ----------

function setup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processInbox')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(CONFIG.TRIGGER_MINUTES).create();
  getLabel_();
  getFolder_();
  processInbox();
}

// ---------- inbox processing ----------

function processInbox() {
  const label = getLabel_();
  const query = `from:${CONFIG.ALLOWED_SENDER} subject:"${CONFIG.SUBJECT_PREFIX}" has:attachment -label:${CONFIG.PROCESSED_LABEL.replace('/', '-')} newer_than:${CONFIG.SEARCH_WINDOW}`;
  const threads = GmailApp.search(query, 0, 50);
  if (!threads.length) {
    // Recover if a previous run stopped before the combined file was written.
    if (!getFolder_().getFilesByName(CONFIG.COMBINED_FILE).hasNext()) rebuildCombined_();
    return;
  }

  // Oldest first so the newest export wins.
  const messages = threads
    .flatMap(t => t.getMessages())
    .filter(m => m.getSubject().indexOf(CONFIG.SUBJECT_PREFIX) === 0)
    .filter(m => {
      const ok = isFromEnsemble(m.getFrom(), m.getHeader('Authentication-Results'));
      if (!ok) console.warn(`Ignored "${m.getSubject()}" from ${m.getFrom()}: not authenticated Ensemble mail`);
      return ok;
    })
    .sort((a, b) => a.getDate() - b.getDate());

  messages.forEach(msg => {
    const csvs = msg.getAttachments().filter(a => /\.csv$/i.test(a.getName()) || a.getContentType() === 'text/csv');
    csvs.forEach(att => {
      const report = parseEnsembleCsv(att.getDataAsString(), {
        subject: msg.getSubject(),
        receivedAt: msg.getDate().toISOString(),
        fileName: att.getName(),
      });
      saveReport_(reportKey_(msg.getSubject()), report);
    });
  });

  threads.forEach(t => t.addLabel(label));
  rebuildCombined_();
}

/**
 * True only for mail from CONFIG.ALLOWED_SENDER that Gmail verified with a passing DKIM
 * signature from CONFIG.DKIM_DOMAIN. The From line alone can be forged; the DKIM result
 * in Gmail's own Authentication-Results header can't be without Ensemble's signing key.
 */
function isFromEnsemble(from, authResults) {
  const addr = (String(from || '').match(/<([^>]+)>/) || [null, from])[1];
  if (String(addr || '').trim().toLowerCase() !== CONFIG.ALLOWED_SENDER.toLowerCase()) return false;
  const dkim = new RegExp(`dkim=pass[^;]*header\\.i=[^;\\s]*@${CONFIG.DKIM_DOMAIN.replace(/\./g, '\\.')}(\\s|;|$)`, 'i');
  return dkim.test(String(authResults || ''));
}

// ---------- CSV parsing ----------

/**
 * Converts an Ensemble Data Export CSV into:
 *   { meta, series: [{ id, building, equipment, point, units, latest, samples: [[isoTime, value], ...] }] }
 *
 * Ensemble's CSV is "wide": one row per timestamp, one column per data log, blank cells
 * where a log has no sample at that time, and a trailing comma on every line:
 *   Date and Time,"Harpeth Hall STEM, 101 AWAIR, Space Temperature Active °F",...,
 *   10/20/2026 12:00:00 AM,,69.4,69.1,70.9,59.5
 * Timestamps are local building time with no zone.
 */
function parseEnsembleCsv(text, meta) {
  const rows = Utilities.parseCsv(text.replace(/^\uFEFF/, ''))
    .filter(r => r.some(c => String(c).trim() !== ''));
  if (!rows.length || !/date|time/i.test(rows[0][0])) {
    return { meta: Object.assign({ error: 'Unexpected CSV header', preview: rows.slice(0, 3) }, meta), series: [] };
  }

  const header = rows[0];
  const body = rows.slice(1);

  const series = header
    .map((name, i) => ({ name: String(name).trim(), i }))
    .filter(h => h.i > 0 && h.name)
    .map(h => {
      const col = parseColumnName_(h.name);
      const samples = body
        .map(r => [toIso_(r[0]), toNum_(r[h.i])])
        .filter(s => s[0] && s[1] !== null);
      return Object.assign(col, {
        latest: samples.length ? samples[samples.length - 1] : null,
        samples,
      });
    });

  return { meta: Object.assign({ rowCount: body.length, seriesCount: series.length }, meta), series };
}

const UNIT_RE = /\s+(°F|°C|%|ppm|ppb|cfm|gpm|psi|psid|rpm|Hz|kW|kWh|tons|hrs|hours|min|in\. ?W\.?C\.?|in\(H₂O\)|in\(H2O\)|iwc|Pa|ft|µg\/m³|ug\/m3)$/i;

/** "Harpeth Hall STEM, 101 AWAIR, Space Temperature Active °F" -> parts. */
function parseColumnName_(name) {
  const parts = name.split(',').map(s => s.trim());
  let point = parts.pop();
  const unitMatch = point.match(UNIT_RE);
  if (unitMatch) point = point.slice(0, unitMatch.index).trim();
  const equipment = parts.pop() || '';
  const building = parts.join(', ');
  return {
    id: slug_(`${equipment} ${point}`),
    building,
    equipment,
    point,
    units: unitMatch ? unitMatch[1] : '',
  };
}

// ---------- storage ----------

function saveReport_(key, report) {
  writeJson_(`${key}.json`, report);
}

function rebuildCombined_() {
  const folder = getFolder_();
  const reports = {};
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName() === CONFIG.COMBINED_FILE || !/\.json$/.test(f.getName())) continue;
    reports[f.getName().replace(/\.json$/, '')] = JSON.parse(f.getBlob().getDataAsString());
  }
  writeJson_(CONFIG.COMBINED_FILE, { updatedAt: new Date().toISOString(), reports });
}

function writeJson_(name, obj) {
  const folder = getFolder_();
  const content = JSON.stringify(obj);
  const existing = folder.getFilesByName(name);
  if (existing.hasNext()) existing.next().setContent(content);
  else folder.createFile(name, content, MimeType.PLAIN_TEXT);
}

function readJson_(name) {
  const it = getFolder_().getFilesByName(name);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : null;
}

// ---------- web app ----------

/** GET ?report=<key> for one report, otherwise everything. */
function doGet(e) {
  const key = e && e.parameter && e.parameter.report;
  const data = key ? readJson_(`${slug_(key)}.json`) : readJson_(CONFIG.COMBINED_FILE);
  return ContentService
    .createTextOutput(JSON.stringify(data || { error: 'No data yet' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- helpers ----------

function getLabel_() {
  return GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL) || GmailApp.createLabel(CONFIG.PROCESSED_LABEL);
}

function getFolder_() {
  const it = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER);
}

/** "HH-DASH TEST STEM" -> "test-stem" */
function reportKey_(subject) {
  return slug_(subject.slice(CONFIG.SUBJECT_PREFIX.length)) || 'default';
}

function slug_(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Numeric cells -> number; status cells ("Occupied", "Chiller In Run Mode") stay text; blank -> null. */
function toNum_(v) {
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  return isNaN(n) ? s : n;
}

/** "10/20/2026 1:15:00 PM" (building local time) -> ISO string, or null. */
function toIso_(v) {
  const s = String(v).trim();
  if (!s) return null;
  try {
    return Utilities.parseDate(s, CONFIG.TIME_ZONE, 'M/d/yyyy h:mm:ss a').toISOString();
  } catch (e) {
    return null;
  }
}
