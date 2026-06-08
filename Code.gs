// ╔══════════════════════════════════════════════════════════════╗
// ║  FPT PERFORMANCE TRACKER — GOOGLE APPS SCRIPT BACKEND       ║
// ║  Deploy: Execute as Me | Who has access: Anyone              ║
// ║                                                              ║
// ║  Storage:                                                    ║
// ║    fpt_historical.json — read-only, all archived entries     ║
// ║    fpt_live.json       — athletes, profiles, new entries     ║
// ║                                                              ║
// ║  Triggers:                                                   ║
// ║    sendDailyReport()         — nightly ~9 PM ET              ║
// ║    archiveEntriesToHistorical() — nightly midnight ET        ║
// ║    sendWeeklyBackup()        — Sunday ~9 PM ET               ║
// ╚══════════════════════════════════════════════════════════════╝

// ── EMAIL CONSTANTS ───────────────────────────────────────────────────────
var CHRIS_EMAIL = 'Fryeperformance@gmail.com';
var IAN_EMAIL   = 'ic.richards55@gmail.com';

// ── SPLIT STORAGE ─────────────────────────────────────────────────────────

function getHistoricalFile_() {
  var files = DriveApp.getRootFolder().getFilesByName('fpt_historical.json');
  if (files.hasNext()) return files.next();
  DriveApp.getRootFolder().createFile('fpt_historical.json',
    JSON.stringify({ entries: [] }), MimeType.PLAIN_TEXT);
  return DriveApp.getRootFolder().getFilesByName('fpt_historical.json').next();
}

function getLiveFile_() {
  var files = DriveApp.getRootFolder().getFilesByName('fpt_live.json');
  if (files.hasNext()) return files.next();
  var empty = JSON.stringify({
    athletes: [], profiles: {}, entries: [], achievements: [],
    guests: [], schoolLogos: {}, pendingIntakes: []
  });
  DriveApp.getRootFolder().createFile('fpt_live.json', empty, MimeType.PLAIN_TEXT);
  return DriveApp.getRootFolder().getFilesByName('fpt_live.json').next();
}

function readHistorical_() {
  try {
    return JSON.parse(getHistoricalFile_().getBlob().getDataAsString());
  } catch(e) {
    return { entries: [] };
  }
}

function readLive_() {
  try {
    return JSON.parse(getLiveFile_().getBlob().getDataAsString());
  } catch(e) {
    return { athletes: [], profiles: {}, entries: [], achievements: [],
             guests: [], schoolLogos: {}, pendingIntakes: [] };
  }
}

function writeLive_(state) {
  getLiveFile_().setContent(JSON.stringify(state));
}

// ── doGet — merge historical + live and return combined state ─────────────
function doGet(e) {
  var historical = readHistorical_();
  var live       = readLive_();

  var combined = {
    athletes:       live.athletes       || [],
    profiles:       live.profiles       || {},
    achievements:   live.achievements   || [],
    guests:         live.guests         || [],
    schoolLogos:    live.schoolLogos    || {},
    pendingIntakes: live.pendingIntakes || [],
    entries:        (historical.entries || []).concat(live.entries || [])
  };

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: combined }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doPost — only write fpt_live.json ────────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    // Handle pending intake submissions from intake.html
    if (payload.action === 'pendingIntake') {
      var live = readLive_();
      if (!live.pendingIntakes) live.pendingIntakes = [];
      live.pendingIntakes.push(payload.data);
      writeLive_(live);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Guard: only write if payload looks like a real state object
    if (!Array.isArray(payload.athletes)) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid state payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Strip historical entries — only persist new live entries
    // Historical entries carry source:'historical_*'; live entries don't
    var liveEntries = (payload.entries || []).filter(function(e) {
      return !e.source || e.source.indexOf('historical') === -1;
    });

    var liveState = {
      athletes:       payload.athletes       || [],
      profiles:       payload.profiles       || {},
      achievements:   payload.achievements   || [],
      guests:         payload.guests         || [],
      schoolLogos:    payload.schoolLogos    || {},
      pendingIntakes: payload.pendingIntakes || [],
      entries:        liveEntries
    };

    writeLive_(liveState);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── NIGHTLY ARCHIVE — move live entries into historical ───────────────────
// Trigger: every day at midnight ET
function archiveEntriesToHistorical() {
  var live        = readLive_();
  var liveEntries = live.entries || [];

  if (!liveEntries.length) {
    Logger.log('No live entries to archive.');
    return;
  }

  var historical = readHistorical_();

  // Dedup by ID — prevents re-archiving entries already in historical
  // if writeLive_() ever fails to clear live.entries after a prior archive
  var seenIds    = new Set((historical.entries || []).map(function(e) { return e.id; }));
  var newEntries = liveEntries.filter(function(e) { return !seenIds.has(e.id); });

  historical.entries = (historical.entries || []).concat(newEntries);
  getHistoricalFile_().setContent(JSON.stringify(historical));

  live.entries = [];
  writeLive_(live);

  Logger.log('Archived ' + newEntries.length + ' entries. ' +
             'Historical total: ' + historical.entries.length);
}

// ── EMAIL HELPERS ─────────────────────────────────────────────────────────

function exerciseLabel_(ex) {
  var map = { fly: '10-10 Fly', fly510: '5-10 Fly', broad: 'Broad Jump',
              vert: 'Skyhook', rsi42: '4/2 RSI' };
  return map[ex] || ex;
}

function formatValue_(entry) {
  if (entry.exercise === 'broad') {
    return entry.valueFt + "'" + entry.valueIn + '"  (' + entry.total + ' in)';
  }
  return entry.value;
}

function buildCsv_(entries) {
  var rows = ['Date,Athlete,Exercise,Value,Ft,In,Total(in)'];
  entries.forEach(function(e) {
    var row = [
      e.date,
      e.athlete,
      exerciseLabel_(e.exercise),
      e.exercise === 'broad' ? '' : e.value,
      e.exercise === 'broad' ? e.valueFt : '',
      e.exercise === 'broad' ? e.valueIn : '',
      e.exercise === 'broad' ? e.total   : ''
    ];
    rows.push(row.join(','));
  });
  return rows.join('\n');
}

function getTodayET_() {
  var now = new Date();
  var et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  var y   = et.getFullYear();
  var m   = String(et.getMonth() + 1).padStart(2, '0');
  var d   = String(et.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function formatDisplayDate_(isoDate) {
  var parts = isoDate.split('-');
  return parts[1] + '/' + parts[2] + '/' + parts[0];
}

// ── DAILY REPORT ──────────────────────────────────────────────────────────
// Trigger: every day ~9 PM ET (runs before midnight archive)
// Today's entries are always in fpt_live.json — no need to read historical
function sendDailyReport() {
  var live    = readLive_();
  var today   = getTodayET_();
  var entries = (live.entries || []).filter(function(e) { return e.date === today; });

  var displayDate = formatDisplayDate_(today);
  var subject     = 'FPT Daily Report — ' + displayDate;

  // Group by athlete
  var byAthlete = {};
  entries.forEach(function(e) {
    if (!byAthlete[e.athlete]) byAthlete[e.athlete] = [];
    byAthlete[e.athlete].push(e);
  });
  var athleteNames = Object.keys(byAthlete).sort();

  // HTML body
  var html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;' +
             'background:#0a0a0a;color:#f0f0f0;border-radius:8px;overflow:hidden;">';

  html += '<div style="background:#1a1a1a;padding:24px 28px;border-bottom:2px solid #e8c84a;">';
  html += '<div style="font-size:11px;letter-spacing:3px;color:#e8c84a;text-transform:uppercase;' +
          'margin-bottom:4px;">Frye Performance Training</div>';
  html += '<div style="font-size:22px;font-weight:700;color:#ffffff;">Daily Report</div>';
  html += '<div style="font-size:13px;color:#888;margin-top:4px;">' + displayDate + '</div>';
  html += '</div>';

  html += '<div style="background:#111;padding:16px 28px;border-bottom:1px solid #222;display:flex;">';
  html += '<span style="color:#e8c84a;font-size:28px;font-weight:700;">' + entries.length + '</span>';
  html += '<span style="color:#888;font-size:13px;margin-left:8px;margin-top:10px;">entries logged across ' +
          athleteNames.length + ' athlete' + (athleteNames.length !== 1 ? 's' : '') + '</span>';
  html += '</div>';

  if (entries.length === 0) {
    html += '<div style="padding:32px 28px;color:#666;font-size:14px;">No entries were logged today.</div>';
  } else {
    athleteNames.forEach(function(athlete) {
      var aEntries = byAthlete[athlete];
      html += '<div style="padding:20px 28px;border-bottom:1px solid #1a1a1a;">';
      html += '<div style="font-size:15px;font-weight:600;color:#e8c84a;margin-bottom:10px;">' + athlete + '</div>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
      html += '<tr style="color:#666;border-bottom:1px solid #222;">';
      html += '<th style="text-align:left;padding:4px 8px 4px 0;font-weight:500;">Exercise</th>';
      html += '<th style="text-align:right;padding:4px 0 4px 8px;font-weight:500;">Value</th>';
      html += '</tr>';
      aEntries.forEach(function(e) {
        html += '<tr style="border-bottom:1px solid #111;">';
        html += '<td style="padding:5px 8px 5px 0;color:#ccc;">' + exerciseLabel_(e.exercise) + '</td>';
        html += '<td style="padding:5px 0 5px 8px;text-align:right;color:#fff;font-weight:500;">' +
                formatValue_(e) + '</td>';
        html += '</tr>';
      });
      html += '</table></div>';
    });
  }

  html += '<div style="padding:16px 28px;background:#1a1a1a;font-size:11px;color:#444;">';
  html += 'FPT Performance Tracking System &nbsp;·&nbsp; Auto-generated ' + displayDate;
  html += '</div></div>';

  var csvBlob = Utilities.newBlob(buildCsv_(entries), 'text/csv', 'FPT_Daily_' + today + '.csv');

  GmailApp.sendEmail(
    CHRIS_EMAIL,
    subject,
    'Please view this email in an HTML-capable client.',
    { htmlBody: html, cc: IAN_EMAIL, attachments: [csvBlob], name: 'Ian Richards' }
  );

  Logger.log('Daily report sent for ' + today + ' — ' + entries.length +
             ' entries, ' + athleteNames.length + ' athletes.');
}

// ── WEEKLY FULL BACKUP ────────────────────────────────────────────────────
// Trigger: every Sunday ~9 PM ET
// Needs all entries — merges historical + live
function sendWeeklyBackup() {
  var historical  = readHistorical_();
  var live        = readLive_();
  var entries     = (historical.entries || []).concat(live.entries || []);
  var today       = getTodayET_();
  var displayDate = formatDisplayDate_(today);
  var subject     = 'FPT Full Backup — ' + displayDate;

  entries.sort(function(a, b) {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return a.athlete.localeCompare(b.athlete);
  });

  var athleteCount = new Set(entries.map(function(e) { return e.athlete; })).size;

  var html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;' +
             'background:#0a0a0a;color:#f0f0f0;border-radius:8px;overflow:hidden;">';

  html += '<div style="background:#1a1a1a;padding:24px 28px;border-bottom:2px solid #e8c84a;">';
  html += '<div style="font-size:11px;letter-spacing:3px;color:#e8c84a;text-transform:uppercase;' +
          'margin-bottom:4px;">Frye Performance Training</div>';
  html += '<div style="font-size:22px;font-weight:700;color:#ffffff;">Weekly Full Backup</div>';
  html += '<div style="font-size:13px;color:#888;margin-top:4px;">' + displayDate + '</div>';
  html += '</div>';

  html += '<div style="padding:24px 28px;">';
  html += '<p style="color:#ccc;font-size:14px;line-height:1.6;">Your full database backup is attached ' +
          'as a CSV file. Keep this somewhere safe — combined with the daily CSVs from this week, ' +
          'it can reconstruct the complete dataset if anything goes wrong.</p>';
  html += '<div style="background:#1a1a1a;border-radius:6px;padding:16px 20px;margin-top:16px;">';
  html += '<div style="font-size:13px;color:#888;margin-bottom:8px;">Snapshot Summary</div>';
  html += '<div style="font-size:28px;font-weight:700;color:#e8c84a;">' + entries.length +
          ' <span style="font-size:14px;color:#888;font-weight:400;">total entries</span></div>';
  html += '<div style="font-size:14px;color:#ccc;margin-top:4px;">' + athleteCount + ' athletes</div>';
  html += '</div></div>';

  html += '<div style="padding:16px 28px;background:#1a1a1a;font-size:11px;color:#444;">';
  html += 'FPT Performance Tracking System &nbsp;·&nbsp; Full backup generated ' + displayDate;
  html += '</div></div>';

  var csvBlob = Utilities.newBlob(buildCsv_(entries), 'text/csv', 'FPT_FullBackup_' + today + '.csv');

  GmailApp.sendEmail(
    CHRIS_EMAIL,
    subject,
    'Please view this email in an HTML-capable client.',
    { htmlBody: html, cc: IAN_EMAIL, attachments: [csvBlob], name: 'Ian Richards' }
  );

  Logger.log('Weekly backup sent — ' + entries.length + ' entries, ' + athleteCount + ' athletes.');
}

// ── DIAGNOSTICS ───────────────────────────────────────────────────────────

function getStats() {
  var live       = readLive_();
  var historical = readHistorical_();
  var totalEntries = (historical.entries || []).length + (live.entries || []).length;

  Logger.log('Athletes  : ' + (live.athletes || []).length);
  Logger.log('Profiles  : ' + Object.keys(live.profiles || {}).length);
  Logger.log('Achievements: ' + (live.achievements || []).length);
  Logger.log('Live entries      : ' + (live.entries || []).length);
  Logger.log('Historical entries: ' + (historical.entries || []).length);
  Logger.log('Total entries     : ' + totalEntries);
  Logger.log('Pending intakes   : ' + (live.pendingIntakes || []).length);
}

function checkServerState() {
  var live       = readLive_();
  var historical = readHistorical_();
  var allEntries = (historical.entries || []).concat(live.entries || []);

  Logger.log('Athletes: ' + (live.athletes || []).length);
  Logger.log('Total entries: ' + allEntries.length);
  Logger.log('Latest 3 entries:');
  allEntries.slice(-3).forEach(function(e) {
    Logger.log(e.date + ' | ' + e.athlete + ' | ' + e.exercise + ' | ' + (e.value || e.total));
  });
}
