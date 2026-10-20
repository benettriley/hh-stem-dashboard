// Dashboard settings. Edit here; no build step.
window.DASH_CONFIG = {
  // Apps Script web app (returns dashboard.json), deployed with access "Anyone".
  // Set to '' to preview with sample-data.json instead.
  FEED_URL: 'https://script.google.com/macros/s/AKfycbxubXMRNmIez97P82o2L_jP_2BuAnmwaIKdN0I6yv-_pQp9yH7txW5xaWA4FYKWDnDO/exec',
  SAMPLE_URL: 'sample-data.json',

  REFRESH_MINUTES: 5,        // how often each page re-fetches its report
  RELOAD_AT_HOUR: 4,         // full page reload once a day at this hour (building time), for long-running players
  STALE_HOURS: 2,            // show a "data is old" warning after this
  COMFORT_BAND_F: 2,         // room counts as comfortable within ± this many °F of setpoint
  // Rooms whose setpoint or temperature falls outside these ranges are left out of the
  // comfort math (some controllers report 45 °F "setpoints"; one sensor reads 31.9 °F).
  VALID_SETPOINT_F: [60, 80],
  VALID_ROOM_TEMP_F: [50, 90],
  TIME_ZONE: 'America/Chicago',

  // Fixed building order = fixed color order (dashboard/styles.css --b1..--b5).
  BUILDINGS: [
    { key: 'Harpeth Hall STEM', short: 'STEM' },
    { key: 'Harpeth Hall Middle School', short: 'Middle School' },
    { key: 'Harpeth Hall Upper School', short: 'Upper School' },
    { key: 'Harpeth Hall Visual Arts', short: 'Visual Arts' },
    { key: 'Harpeth Hall Athletic Wellness Center', short: 'Wellness Center' },
  ],
};
