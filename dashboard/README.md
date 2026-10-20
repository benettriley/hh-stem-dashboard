# Harpeth Hall building dashboard (BrightSign)

Plain HTML/CSS/JS, no build step. Each page is a standalone 1920×1080 screen (scales to fit any size) that refreshes its own data every 5 minutes. There is no auto-advance: add each page to the BrightSign presentation as its own HTML slide/state and let the presentation handle timing.

## STEM pages (current focus, for high school students)
Each leads with a live, plain-English headline built from the numbers. Code: `stem.js`.

| URL | Story | Reports |
|---|---|---|
| `stem-rooms.html` | "201 Loft is the warmest room in STEM right now": every classroom/lab ranked, with thermostat setting | `comfort` |
| `stem-outside.html` | "Outside changed 18°F today. Inside STEM, just 0.7°F": outdoor vs. average room temp today | `buildings`, `comfort` |
| `stem-energy.html` | "STEM is heating and cooling at the same time": chiller (42°F water, gallons/min as bathtubs) and boilers (supply/return, heat absorbed) | `plant` |
| `stem-air.html` | "At 9:30 AM, AHU-01 opened its outside-air damper to 100%": free cooling, plus each air unit's supply air, damper and duct pressure | `air`, `buildings` |
## Campus pages (not in use right now)
| URL | Shows | Feed report (approx. size) |
|---|---|---|
| `comfort.html` | % of rooms within ±2 °F of setpoint, per-building tiles, warmest/coolest rooms | `comfort` (~830 KB) |
| `weather.html` | Outdoor temp/humidity, today's high/low + chart, average indoor temp by building, occupancy | `buildings` (~110 KB) |
| `plant.html` | Chillers, STEM boilers, hot/chilled water loops, pumps | `plant` (~50 KB) |
| `air.html` | Each air handler's supplied air temp, fan, fresh-air damper | `air` (~100 KB) |

`index.html` is just a list of links to the four pages.

## Files
- `config.js`: feed URL, refresh interval, comfort band + valid ranges, building order (= color order)
- `app.js`: page registry, shared helpers (`window.Dash`), loads a page's reports, renders it; campus pages
- `stem.js`: the STEM pages (registered with `Dash.register`)
- `charts.js`: SVG line chart
- `styles.css`: white editorial theme, HH green `#006751`; building colors `--b1..--b5`
- `sample-data.json`: synthetic data in the feed's shape (regenerate: `node tools/make-sample.js`)

## Data
Each page fetches `FEED_URL?report=<name>` from the Apps Script web app. With `FEED_URL` empty it uses `sample-data.json` and shows a **SAMPLE DATA** badge. If a fetch fails it keeps the last good data (also cached in localStorage per page) and shows **OFFLINE**. A report that hasn't been exported yet shows "Waiting for the HH-DASH … export."

## BrightSign package
`node tools/build-brightsign.js` writes `../brightsign/`: only the STEM pages and what they need (fonts bundled in `fonts/`, no Google Fonts), plus a README with BrightAuthor:connected steps. Re-run it after any change here; don't edit `brightsign/` directly. Preview the package with `node tools/serve.js 8081 brightsign`.

Long-running behavior: full reload daily at `RELOAD_AT_HOUR` (4 AM); between midnight and the first export (~6:05 AM) pages show yesterday's data and say so ("at 10:00 PM yesterday").

## Local preview
```
node tools/serve.js 8080
```
Then open http://localhost:8080/comfort.html (or weather / plant / air).
