# Tracer Ensemble → BrightSign: Data Export reference

Catalog of everything the Ensemble **Data Export** (Dashboards & Reports → Reports → Create → Data Export) can send, gathered 2026-10-20 by walking the form without saving.

Pipeline: **Ensemble scheduled export → Gmail-only account → Apps Script parses attachment → JSON for our site → site plays in BrightSign presentation.**

---

## 1. What the export form offers

| Step | Options |
|---|---|
| Export Details | Report name, description, **Time Period**: Today, Yesterday, This Week, Last Week, This Month, Last Month, This Year, Last Year, or Custom start/end date+time |
| Data Sources | Building → Family Type → Equipment → Point → **Data Log** (multi-select, "Select All" at each level). *Only stored data logs are exported; no live values.* |
| Export Recurrence | List of entries, each = Single Date / Date Range (every day between two dates) / Weekly (pick days) / Monthly / Yearly **+ one Run Time (minute precision)** + File Format **Excel or CSV**. No "hourly" option; add multiple entries instead. Ensemble tip: avoid identical run times across reports. |
| Email Recipients | Free-text **To** and **Cc** (semicolon-separated), custom **Subject**, custom **Message** |

## 2. Buildings (5) and equipment (422 objects)

| Building | Spaces | Air handlers / systems | Plant | Other |
|---|---|---|---|---|
| STEM (siteId 1) | 58 | AHU-01, RTU-02, RTU-03 (+ VAS, Areas) | Chiller 1, Boilers 1–2, CHWS, HWS | 11 AWAIR sensors, 3 prep-room EFs, 5 V-boxes |
| Athletic Wellness Center (2) | 13 rooftop units | 1 Area | — | EF-1 |
| Visual Arts (3) | 35 | Heat and Cool Control (+ VAS, Area) | Chiller | — |
| Middle School (4) | 68 | Ahu-1, Ahu-2 (+ VAS, Areas) | Chiller | — |
| Upper School (5) | 56 | AHU-1, RTU-1/2/3 (+ VAS, Areas) | CH-01 (generic) | — |

A **Meters** family exists, but no meters are installed, so there is **no energy (kW/kWh) data**.

## 3. Data logs (1,532 total)

Logging interval: almost all **every 15 minutes**. Exceptions in STEM: outdoor air temp/humidity **hourly**, boiler status points every 30 min, Operating Mode/System Requests every 2 min, and 21 pump/valve/filter status points logged **on change only** (interval 0).

### Dashboard-worthy points

| Point | Where | # logs | Dashboard use |
|---|---|---|---|
| Space Temperature Active | all 5 | 243 | Room temps, campus comfort map, building averages |
| Space Temperature Setpoint Active | all 5 | 225 | "% of rooms in comfort range" (temp vs setpoint) |
| Space Temperature Average / Min / Max | all 5 (per air system) | ~6–8 per bldg | Building-level summary tiles |
| Occupancy Status | all 5 | 21 | Occupied/unoccupied by building |
| Heat/Cool Mode Status | all 5 | 11 | Heating vs cooling indicator |
| Outdoor Air Temperature / Humidity Active | STEM (HWS) | 2 | Weather tile, inside-vs-outside chart (hourly) |
| Evaporator Leaving Water Temp, Chilled Water Setpoint, Actual Running Capacity, Running Mode | STEM, VA, MS chillers | 3 each | Chiller "how cold is the water / how hard is it working" |
| Boiler Entering/Leaving Temp, Firing Rate, Status | STEM | 2 each | Boiler page |
| Hot Water Supply/Return Temp | STEM | 1 each | Heating loop delta-T |
| Chilled Water Flow, CHWP/HWP Speed Command | STEM | 1–2 | Pumps & flow animation |
| Supply Fan Status/Speed, Outdoor Air Damper Position, Mixed Air Temp | AHUs (STEM richest) | 1–13 | "Fresh air" page |
| Discharge Air Flow / Air Flow Setpoint | VAVs (not AWC) | 104–206 | Airflow per room |

### NOT available via export
- STEM **AWAIR** CO2, humidity, PM2.5, TVOC, noise, light, Awair score: **not logged** (only AWAIR temperature is). Live-only.
- Live alarms, anything not set up as a data log, energy.

### Stale logs at time of survey (STEM)
AHU-01 Area / VAS and RTU-02 Area / VAS: last sample 2026-07-20. RTU-03 Area: 2026-09-26. Some CHWS/HWS logs: 10/16–10/19 (several are on-change logs, so an old date can be normal). Ask facilities before relying on these.

## 4. Timing plan

Samples land at :00/:15/:30/:45 (a few minutes late). Email adds a minute or more of delay.

| Need | Time Period | Recurrence | Freshness on screen |
|---|---|---|---|
| "Today so far" trends | Today | Weekly (all days or Mon–Fri) entries at **:05 past each hour** you care about (e.g. 6:05 AM–5:05 PM = 12 entries) | ~20–80 min old |
| Yesterday recap | Yesterday | Daily at ~12:30 AM | full previous day |
| Week view | This Week or Last Week | Daily at ~1:00 AM | 1 day |

Stagger multiple reports by a few minutes (e.g. :05, :08, :11) per Ensemble's tip.

## 5. Recommended export setup
- **CSV**, not Excel: Apps Script parses it directly with `Utilities.parseCsv`.
- **Several small reports** (one per dashboard page) rather than one 1,532-log export: smaller attachments, simpler parsing.
- Distinct **Subject** per report (e.g. `HH-DASH STEM-HOURLY`) so Apps Script can route by subject.
- Send **To** the Gmail-only account.

## 6. Apps Script side (outline)
1. Time-driven trigger every 5–10 min.
2. `GmailApp.search('subject:"HH-DASH" has:attachment is:unread')`.
3. For each message: read the CSV attachment → `Utilities.parseCsv` → normalize to `{building, equipment, point, unit, samples:[[time,value],...]}`.
4. Save latest JSON (Drive file or Script Properties/Sheet), mark the email read or apply a label.
5. Serve it: Apps Script **Web App** `doGet()` returning `ContentService` JSON; the dashboard site `fetch()`es that URL on a timer. Or push the JSON to the site's host.

## 7. Confirmed by test export (HH-DASH TEST, 2026-10-20 11:05 AM)
- Delivered to EnsembleDataExport@harpethhall.org from `tes_admin`, subject as set, attachment `<Report Name>.csv` (text/csv). Arrived within a few minutes.
- **Wide layout**: `Date and Time` column, then one column per data log named `"<Building>, <Equipment>, <Point> <units>"`. One row per distinct timestamp; blank cells where a log has no sample; trailing comma on every line.
- Timestamps are `M/D/YYYY h:mm:ss AM` in building local time, no zone. Logs don't share timestamps (AWAIR at :14/:29/:44/:59, VAVs at :00/:15/:30/:45, outdoor air hourly).
- The 11:05 run included the 11:00 samples, so a :05 run time captures the top-of-hour sample.
- Parser: `apps-script/Code.gs` → `parseEnsembleCsv()`; local check: `node apps-script/test/run-parser.js`.

Still unknown: cap on recurrence entries per report; attachment size with many logs.

## 8. Live setup (2026-10-20)
- Apps Script project **HH Dashboard Feed**, owned by ensembledataexport@harpethhall.org (source: `apps-script/Code.gs`).
- Workspace admin: project's OAuth client `953830659092-g3hejj8ciomfh5ctfl1uq22jvdhbdpa5.apps.googleusercontent.com` marked **Trusted** (needed for Gmail/Drive restricted scopes; otherwise `Error 400: admin_policy_enforced`).
- Trigger: `processInbox` every 5 min. Gmail label `HH-DASH/processed`. Drive folder `HH-DASH data` (`<report>.json` + `dashboard.json`).
- Web app **version 2** (2026-10-20 12:02 PM), Execute as owner, **access: Anyone** (no sign-in; used by the BrightSign dashboard):
  `https://script.google.com/macros/s/AKfycbxubXMRNmIez97P82o2L_jP_2BuAnmwaIKdN0I6yv-_pQp9yH7txW5xaWA4FYKWDnDO/exec`
  - all reports: `.../exec` · one report: `.../exec?report=comfort`
  - Read-only, but anyone with the URL can read the building data. If it leaks: create a new deployment, archive this one, update `dashboard/config.js`.
  - Full feed is ~1.1 MB and takes ~5 s to load.
- Code changes in the editor need **Deploy → Manage deployments → Edit → New version** to reach the web app URL (the trigger always runs the latest saved code).

## 9. Production export reports (created 2026-10-20)
All: Time Period **Today**, **CSV**, To `EnsembleDataExport@harpethhall.org`, email only (no report history), weekly entries with all 7 days checked at every hour **6 AM–10 PM** (17 runs/day). Subject = report name → Apps Script key (`HH-DASH COMFORT` → `comfort`).

| Ensemble report (id) | Run minute | Data logs |
|---|---|---|
| HH-DASH COMFORT (3) | :05 | Space Temperature Active + Space Temperature Setpoint Active, all buildings, all equipment (468 logs) |
| HH-DASH BUILDINGS (4) | :08 | Outdoor Air Temperature/Humidity Active, Space Temperature Average, Space Maximum/Minimum Temperature, Occupancy Status, Heat/Cool Mode Status (all buildings) |
| HH-DASH PLANT (5) | :11 | Evaporator Leaving Water Temp, Chilled Water Setpoint, Actual Running Capacity, Running Mode, Boiler Entering/Leaving Temp, Boiler Firing Rate, Boiler Status, Hot Water Supply/Return Temp, Chilled Water Flow Local, CHWP-1/2 + HWP-1/2 Speed Command |
| HH-DASH AIR (6) | :14 | Family = Air Handlers only: Supply Fan Status/Speed Command, Outdoor Air Damper Position, Discharge Air Temp + Setpoint Active, Mixed Air Temp Local, Duct Static Pressure Active + Setpoint Active |

Notes:
- Adding many run times by hand is slow (16 clicks each). The form's save is `POST /api/ReportManagement/dataExport` (edit: `PUT`) with `ReportScheduleParams[]` (`DaysOfWeek` 0–6, `Hour`, `Minute`, `Interval:"P1W"`, `CreateCSV`) and a matching `CalendarEntry[]`; the reports above were saved through the form with extra schedule entries appended to that request.
- Status points (occupancy, modes, fan/boiler status) may arrive as text; the parser keeps non-numeric cells as strings.
- `HH-DASH TEST` (id 2, single run, already sent) and `1` (pre-existing, unscheduled) are left as-is.

### Verified with the first live run (12:05–12:14 PM, 2026-10-20)
All four arrived and parsed: COMFORT 468 series, BUILDINGS 77, PLANT 27, AIR 53. Real-data quirks the dashboard handles:
- Status points arrive as text: Occupancy `"Occupied"`, Heat/Cool `"Heat"`/`"Cool"`, Running Mode `"Chiller In Run|Start|Stop Mode"`, Supply Fan `"On"`.
- **Boiler Status reports `"Occupied"`**, so it's useless as on/off; the dashboard uses Boiler Firing Rate > 0 instead.
- **32 of 225 room setpoints are outside 60–80 °F** (22 of 35 Visual Arts rooms, 9 Middle School; mostly 45–54 °F) and one Upper School sensor (V1-12) reads 31.9 °F. These rooms are left out of the comfort % (`VALID_SETPOINT_F` / `VALID_ROOM_TEMP_F` in `dashboard/config.js`). Worth asking facilities.
- Upper School air handlers log damper + discharge temp but no fan status/speed; Middle School/Visual Arts units log no damper.
- STEM AHU-01/RTU-02 Area occupancy and mode logs have no samples today (stale since July).
