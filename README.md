# Harpeth Hall STEM building dashboard

Live building data on BrightSign screens, written for high school students.

```
Tracer Ensemble ──(hourly CSV email)──▶ Gmail ──▶ Apps Script ──(JSON feed)──▶ dashboard pages ──▶ BrightSign
```

1. **Tracer Ensemble** emails four scheduled CSV exports (`HH-DASH COMFORT / BUILDINGS / PLANT / AIR`) every hour, 6:05 AM–10:14 PM, to `EnsembleDataExport@harpethhall.org`.
2. **Apps Script** (`apps-script/Code.gs`, project "HH Dashboard Feed") checks Gmail every 5 minutes, parses the CSVs and serves them as JSON (`?report=comfort` etc.).
3. **Dashboard** (`dashboard/`): plain HTML/CSS/JS pages, one per slide, that fetch the feed every 5 minutes.
4. **BrightSign**: each page URL is a slide in BrightSign Author, hosted on Cloudflare Workers.

## Folders
| Path | What |
|---|---|
| `dashboard/` | Source for all pages. STEM pages: `stem-rooms`, `stem-outside`, `stem-energy`, `stem-air` (`stem.js`). Campus pages (not in use): `comfort`, `weather`, `plant`, `air`. See `dashboard/README.md`. |
| `apps-script/` | Apps Script source + local parser test (`node apps-script/test/run-parser.js`). |
| `tools/` | `build-brightsign.js` (builds `brightsign/`), `serve.js` (local preview), `make-sample.js` (sample data). |
| `wrangler.jsonc` | Cloudflare Workers static-assets config (serves `brightsign/`). |
| `ENSEMBLE_DATA_EXPORT.md` | Everything learned about Ensemble's data, exports, the live setup and data quirks. |

## Common tasks
```bash
node tools/serve.js 8080                 # preview dashboard/ at http://localhost:8080/stem-rooms.html
node tools/build-brightsign.js           # build brightsign/ (STEM pages only, fonts bundled)
npx wrangler deploy                      # publish brightsign/ to Cloudflare Workers
```

Apps Script changes: edit `apps-script/Code.gs`, paste into the online editor and save (the 5-minute trigger uses the latest saved code; the web app URL needs **Deploy → Manage deployments → Edit → New version**).
