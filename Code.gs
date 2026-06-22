// ╔══════════════════════════════════════════════════════════════╗
// ║  FPT PERFORMANCE TRACKER — GOOGLE APPS SCRIPT BACKEND       ║
// ║  Deploy: Execute as Me | Who has access: Anyone              ║
// ║                                                              ║
// ║  Gym Storage:                                                ║
// ║    fpt_historical.json — read-only, all archived gym entries ║
// ║    fpt_live.json       — athletes, profiles, new entries     ║
// ║                                                              ║
// ║  Team Storage:                                               ║
// ║    fpt_teams_historical.json — archived team entries         ║
// ║    fpt_teams_live.json       — teams, athletes, new entries  ║
// ║                                                              ║
// ║  Triggers:                                                   ║
// ║    sendDailyReport()              — nightly ~9 PM ET         ║
// ║    archiveEntriesToHistorical()   — nightly midnight ET      ║
// ║    archiveTeamEntriesToHistorical() — nightly midnight ET    ║
// ║    sendWeeklyBackup()             — Sunday ~9 PM ET          ║
// ╚══════════════════════════════════════════════════════════════╝

// ── EMAIL CONSTANTS ───────────────────────────────────────────────────────
var CHRIS_EMAIL = 'Fryeperformance@gmail.com';
var IAN_EMAIL   = 'ic.richards55@gmail.com';

// ══════════════════════════════════════════════════════════════════════════
// GYM STORAGE
// ══════════════════════════════════════════════════════════════════════════

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
    guests: [], schoolLogos: {}, pendingIntakes: [],
    adults: {}, challenges: {}, challengeEntries: []
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
             guests: [], schoolLogos: {}, pendingIntakes: [],
             adults: {}, challenges: {}, challengeEntries: [] };
  }
}

function writeLive_(state) {
  getLiveFile_().setContent(JSON.stringify(state));
}

// ── Pending-intake helpers ──────────────────────────────────────────────────
function _intakeKey_(p){
  return (((p && p.firstName) || '').trim() + '|' + ((p && p.lastName) || '').trim()).toLowerCase();
}
function _ensureIntakeIds_(live){
  var changed = false;
  (live.pendingIntakes || []).forEach(function(p){
    if (p && !p.id){ p.id = Utilities.getUuid(); changed = true; }
  });
  return changed;
}

// ══════════════════════════════════════════════════════════════════════════
// TEAM STORAGE
// ══════════════════════════════════════════════════════════════════════════

function getTeamsHistoricalFile_() {
  var files = DriveApp.getRootFolder().getFilesByName('fpt_teams_historical.json');
  if (files.hasNext()) return files.next();
  DriveApp.getRootFolder().createFile('fpt_teams_historical.json',
    JSON.stringify({ entries: [] }), MimeType.PLAIN_TEXT);
  return DriveApp.getRootFolder().getFilesByName('fpt_teams_historical.json').next();
}

function getTeamsLiveFile_() {
  var files = DriveApp.getRootFolder().getFilesByName('fpt_teams_live.json');
  if (files.hasNext()) return files.next();
  var empty = JSON.stringify({
    teams: [], athletes: {}, profiles: {}, entries: [], achievements: []
  });
  // teams: array of team name strings
  // athletes: { teamName: [athleteName, ...] }
  // profiles: { athleteName: { gender, sports, ... } }
  // entries: new entries not yet archived
  // achievements: active achievements
  DriveApp.getRootFolder().createFile('fpt_teams_live.json', empty, MimeType.PLAIN_TEXT);
  return DriveApp.getRootFolder().getFilesByName('fpt_teams_live.json').next();
}

function readTeamsHistorical_() {
  try {
    return JSON.parse(getTeamsHistoricalFile_().getBlob().getDataAsString());
  } catch(e) {
    return { entries: [] };
  }
}

function readTeamsLive_() {
  try {
    return JSON.parse(getTeamsLiveFile_().getBlob().getDataAsString());
  } catch(e) {
    return { teams: [], athletes: {}, profiles: {}, entries: [], achievements: [] };
  }
}

function writeTeamsLive_(state) {
  getTeamsLiveFile_().setContent(JSON.stringify(state));
}

// ══════════════════════════════════════════════════════════════════════════
// doGet — route by ?type= parameter
// ══════════════════════════════════════════════════════════════════════════

function doGet(e) {
  var type = (e && e.parameter && e.parameter.type) ? e.parameter.type : 'gym';

  if (type === 'teams') {
    var teamsHistorical = readTeamsHistorical_();
    var teamsLive       = readTeamsLive_();

    var combined = {
      teams:        teamsLive.teams        || [],
      athletes:     teamsLive.athletes     || {},
      profiles:     teamsLive.profiles     || {},
      achievements: teamsLive.achievements || [],
      entries:      (teamsHistorical.entries || []).concat(teamsLive.entries || [])
    };

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, data: combined }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default: gym data
  var historical = readHistorical_();
  var live       = readLive_();
  if (_ensureIntakeIds_(live)) writeLive_(live);  // backfill ids on legacy pendings

  var combined = {
    athletes:       live.athletes       || [],
    profiles:       live.profiles       || {},
    achievements:   live.achievements   || [],
    guests:         live.guests         || [],
    schoolLogos:    live.schoolLogos    || {},
    pendingIntakes: live.pendingIntakes || [],
    adults:         live.adults         || {},
    challenges:     live.challenges     || {},
    challengeEntries: live.challengeEntries || [],
    entries:        (historical.entries || []).concat(live.entries || [])
  };

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: combined }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════════════
// doPost — route by payload.type and payload.action
// ══════════════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    // ── Pending intake from intake.html (id + dedup-by-name + lock) ────────
    if (payload.action === 'pendingIntake') {
      var lock = LockService.getScriptLock();
      try { lock.waitLock(10000); } catch (e) {}
      try {
        var live = readLive_();
        if (!live.pendingIntakes) live.pendingIntakes = [];
        var data = payload.data || {};
        if (!data.id) data.id = Utilities.getUuid();
        var key = _intakeKey_(data);
        var existingIdx = -1;
        for (var pi = 0; pi < live.pendingIntakes.length; pi++) {
          if (key !== '|' && _intakeKey_(live.pendingIntakes[pi]) === key) { existingIdx = pi; break; }
        }
        if (existingIdx >= 0) {
          data.id = live.pendingIntakes[existingIdx].id || data.id;  // keep stable id
          live.pendingIntakes[existingIdx] = data;                    // replace, never stack
        } else {
          live.pendingIntakes.push(data);
        }
        writeLive_(live);
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, id: data.id, replaced: existingIdx >= 0 }))
          .setMimeType(ContentService.MimeType.JSON);
      } finally { lock.releaseLock(); }
    }

    // ── Reject a pending intake (atomic, by id) ───────────────────────────
    if (payload.action === 'rejectIntake') {
      var lockR = LockService.getScriptLock();
      try { lockR.waitLock(10000); } catch (e) {}
      try {
        var liveR = readLive_();
        _ensureIntakeIds_(liveR);
        var beforeR = (liveR.pendingIntakes || []).length;
        liveR.pendingIntakes = (liveR.pendingIntakes || []).filter(function(p){ return p.id !== payload.id; });
        writeLive_(liveR);
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, removed: beforeR - liveR.pendingIntakes.length }))
          .setMimeType(ContentService.MimeType.JSON);
      } finally { lockR.releaseLock(); }
    }

    // ── Approve a pending intake → roster/profile (atomic, by id) ──────────
    if (payload.action === 'approveIntake') {
      var lockA = LockService.getScriptLock();
      try { lockA.waitLock(10000); } catch (e) {}
      try {
        var liveA = readLive_();
        _ensureIntakeIds_(liveA);
        var pend = liveA.pendingIntakes || [];
        var d = null;
        for (var ai = 0; ai < pend.length; ai++) { if (pend[ai].id === payload.id) { d = pend[ai]; break; } }
        if (!d) {
          return ContentService.createTextOutput(JSON.stringify({ ok: true, alreadyGone: true }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        var name = ((d.firstName || '').trim() + (d.lastName ? ' ' + d.lastName.trim() : '')).trim();
        if (!name) {
          return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'No name on intake.' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        if (!liveA.athletes) liveA.athletes = [];
        if (!liveA.profiles) liveA.profiles = {};
        var onRoster = liveA.athletes.indexOf(name) !== -1;
        if (!onRoster) {
          liveA.athletes.push(name);
          liveA.profiles[name] = {
            gender: d.gender || 'male', dob: d.dob || '', level: d.level || 'k12',
            highSchool: d.highSchool || '', hsGradYear: d.hsGradYear || '',
            college: d.college || '', collegeGradYear: d.collegeGradYear || '',
            collegeClass: d.collegeClass || '', redshirt: d.redshirt || false,
            fptMonth: d.fptMonth || '', fptYear: d.fptYear || '',
            sports: d.sports || '', positions: d.positions || '',
            instagram: d.instagram || '', email: d.email || '',
            parent1Email: d.parent1Email || '', parent2Email: d.parent2Email || '',
            inactive: false
          };
        }
        liveA.pendingIntakes = pend.filter(function(p){ return p.id !== payload.id; });
        writeLive_(liveA);
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, name: name, alreadyOnRoster: onRoster }))
          .setMimeType(ContentService.MimeType.JSON);
      } finally { lockA.releaseLock(); }
    }

    // ── Copy team athlete to gym roster ───────────────────────────────────
    if (payload.action === 'copyAthleteToGym') {
      return handleCopyAthleteToGym_(payload);
    }

    // ── Team portal state save ────────────────────────────────────────────
    if (payload.type === 'teams') {
      return handleTeamsPost_(payload);
    }

    // ── Gym portal state save (default) ──────────────────────────────────
    return handleGymPost_(payload);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Gym post handler ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
// handleGymPost_  — dedup fix + explicit cross-day deletion (deletedIds)
//
// REPLACES the current handleGymPost_. Adds one capability on top of the
// dedup fix already deployed: if the client sends payload.deletedIds (ids the
// user explicitly deleted), those entries are removed from BOTH historical and
// live. This is safe because it's an explicit instruction — a stale client
// only ever sends ids the user actively deleted, never inferred from absence.
// ══════════════════════════════════════════════════════════════════════════
function handleGymPost_(payload) {
  if (!Array.isArray(payload.athletes)) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid gym state payload' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var historical = readHistorical_();
  var histById = {};
  (historical.entries || []).forEach(function(e) { if (e && e.id != null) histById[e.id] = e; });

  var incoming = payload.entries || [];
  var seenLive = {};
  var liveEntries = [];
  var histChanged = false;

  function sig(e) {
    return [e.athlete, e.exercise, e.date, e.value, e.total, e.valueFt, e.valueIn].join('|');
  }

  for (var i = 0; i < incoming.length; i++) {
    var e = incoming[i];
    if (!e || e.id == null) continue;
    if (seenLive[e.id]) continue;
    seenLive[e.id] = true;

    var h = histById[e.id];
    if (h) {
      if (sig(h) !== sig(e)) {
        for (var k in e) { if (e.hasOwnProperty(k)) h[k] = e[k]; }
        histChanged = true;
      }
    } else {
      liveEntries.push(e);
    }
  }

  // ── Explicit deletions (cross-day): remove these ids from historical + live ──
  var deletedIds = payload.deletedIds || [];
  if (deletedIds.length) {
    var delSet = {};
    deletedIds.forEach(function(id) { if (id != null) delSet[id] = true; });

    var histBefore = (historical.entries || []).length;
    historical.entries = (historical.entries || []).filter(function(e) { return !delSet[e.id]; });
    if (historical.entries.length !== histBefore) histChanged = true;

    liveEntries = liveEntries.filter(function(e) { return !delSet[e.id]; });
  }

  if (histChanged) {
    getHistoricalFile_().setContent(JSON.stringify(historical));
  }

  // pendingIntakes is owned by the dedicated intake actions (submit/reject/
  // approve), NOT the coach's full-state save — preserve whatever the backend
  // currently holds so routine gym saves can never clobber a submission or
  // undo a reject.
  var _curLive = readLive_();

  var liveState = {
    athletes:       payload.athletes       || [],
    profiles:       payload.profiles       || {},
    achievements:   payload.achievements   || [],
    guests:         payload.guests         || [],
    schoolLogos:    payload.schoolLogos    || {},
    pendingIntakes: (_curLive.pendingIntakes || []),
    adults:         payload.adults         || {},
    challenges:     payload.challenges     || {},
    challengeEntries: payload.challengeEntries || [],
    entries:        liveEntries
  };

  writeLive_(liveState);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, liveCount: liveEntries.length,
                                       histUpdated: histChanged, deleted: deletedIds.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Team post handler ─────────────────────────────────────────────────────
function handleTeamsPost_(payload) {
  // Guard: only write if payload looks like a real teams state object
  if (!payload.teams || !payload.athletes) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid teams state payload' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Strip historical entries — only persist new live entries
  var liveEntries = (payload.entries || []).filter(function(e) {
    return !e.source || e.source.indexOf('historical') === -1;
  });

  var liveState = {
    teams:        payload.teams        || [],
    athletes:     payload.athletes     || {},
    profiles:     payload.profiles     || {},
    achievements: payload.achievements || [],
    entries:      liveEntries
  };

  writeTeamsLive_(liveState);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Copy athlete from team to gym ─────────────────────────────────────────
// One-time snapshot: copies athlete + all their team entries into gym roster
// Team record is left intact
function handleCopyAthleteToGym_(payload) {
  var athleteName = payload.athleteName;
  if (!athleteName) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'No athleteName provided' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Read team data
  var teamsHistorical = readTeamsHistorical_();
  var teamsLive       = readTeamsLive_();
  var teamProfile     = (teamsLive.profiles || {})[athleteName] || {};
  var teamEntries     = (teamsHistorical.entries || [])
    .concat(teamsLive.entries || [])
    .filter(function(e) { return e.athlete === athleteName; });

  // Read gym data
  var gymLive = readLive_();

  // Add athlete to gym roster if not already present
  if (!gymLive.athletes) gymLive.athletes = [];
  if (gymLive.athletes.indexOf(athleteName) === -1) {
    gymLive.athletes.push(athleteName);
  }

  // Merge profile (non-destructive — don't overwrite existing gym profile fields)
  if (!gymLive.profiles) gymLive.profiles = {};
  if (!gymLive.profiles[athleteName]) gymLive.profiles[athleteName] = {};
  Object.keys(teamProfile).forEach(function(k) {
    if (!gymLive.profiles[athleteName][k]) {
      gymLive.profiles[athleteName][k] = teamProfile[k];
    }
  });

  // Copy team entries into gym historical (deduplicated by ID)
  var gymHistorical = readHistorical_();
  var existingIds   = new Set((gymHistorical.entries || []).map(function(e) { return e.id; }));
  var newEntries    = teamEntries.filter(function(e) { return !existingIds.has(e.id); });
  gymHistorical.entries = (gymHistorical.entries || []).concat(newEntries);

  // Write both gym files
  getHistoricalFile_().setContent(JSON.stringify(gymHistorical));
  writeLive_(gymLive);

  Logger.log('Copied ' + athleteName + ' to gym. ' + newEntries.length + ' entries added.');

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, entriesCopied: newEntries.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════════════
// NIGHTLY ARCHIVES
// ══════════════════════════════════════════════════════════════════════════

// Trigger: every day at midnight ET
// ══════════════════════════════════════════════════════════════════════════
// HARDENED NIGHTLY SWEEP — replaces archiveEntriesToHistorical()
// Fix: never clear live unless the historical write is verified to contain
// the newly-archived entries. Prevents silent data loss on a failed/partial
// historical write (the large-file write-timeout failure mode).
// ══════════════════════════════════════════════════════════════════════════
function archiveEntriesToHistorical() {
  var live        = readLive_();
  var liveEntries = live.entries || [];

  if (!liveEntries.length) {
    Logger.log('Gym: no live entries to archive.');
    return;
  }

  var historical = readHistorical_();
  var existing   = historical.entries || [];

  // Dedup by ID — prevents re-archiving on trigger retry
  var seenIds    = {};
  existing.forEach(function(e) { seenIds[e.id] = true; });
  var newEntries = liveEntries.filter(function(e) { return !seenIds[e.id]; });

  if (!newEntries.length) {
    // Everything already archived (trigger retry). Safe to clear live.
    live.entries = [];
    writeLive_(live);
    Logger.log('Gym: all live entries already in historical. Live cleared.');
    return;
  }

  var expectedCount = existing.length + newEntries.length;
  historical.entries = existing.concat(newEntries);

  // Write historical
  getHistoricalFile_().setContent(JSON.stringify(historical));

  // ── VERIFY the write persisted before touching live ──
  var verify      = readHistorical_();
  var verifyCount = (verify.entries || []).length;
  var verifyIds   = {};
  (verify.entries || []).forEach(function(e) { verifyIds[e.id] = true; });
  var allPresent  = newEntries.every(function(e) { return verifyIds[e.id]; });

  if (verifyCount >= expectedCount && allPresent) {
    // Confirmed: every new entry is in historical. Now safe to clear live.
    live.entries = [];
    writeLive_(live);
    Logger.log('Gym: archived ' + newEntries.length + ' entries (verified). ' +
               'Historical total: ' + verifyCount);
  } else {
    // Write did NOT fully persist. Do NOT clear live — data stays safe in live
    // and will be retried on the next run. Alert so it gets noticed.
    Logger.log('Gym: ARCHIVE VERIFY FAILED. Expected >=' + expectedCount +
               ', got ' + verifyCount + ', allPresent=' + allPresent +
               '. Live NOT cleared — data preserved for retry.');
    try {
      GmailApp.sendEmail(
        IAN_EMAIL,
        'FPT [ALERT] Nightly archive verify FAILED',
        'The midnight archive could not confirm ' + newEntries.length +
        ' entries were written to historical. Live was NOT cleared, so no data was lost. ' +
        'It will retry next run. Expected >=' + expectedCount + ' historical entries, found ' +
        verifyCount + '.',
        { cc: CHRIS_EMAIL, name: 'FPT System' }
      );
    } catch (mailErr) {
      Logger.log('Alert email failed: ' + mailErr);
    }
  }
}

// Trigger: every day at midnight ET (add separately in Triggers panel)
// ══════════════════════════════════════════════════════════════════════════
function archiveTeamEntriesToHistorical() {
  var live        = readTeamsLive_();
  var liveEntries = live.entries || [];

  if (!liveEntries.length) {
    Logger.log('Teams: no live entries to archive.');
    return;
  }

  var historical = readTeamsHistorical_();
  var existing   = historical.entries || [];

  var seenIds = {};
  existing.forEach(function(e) { if (e && e.id != null) seenIds[e.id] = true; });
  var newEntries = liveEntries.filter(function(e) { return !seenIds[e.id]; });

  if (!newEntries.length) {
    live.entries = [];
    writeTeamsLive_(live);
    Logger.log('Teams: all live entries already archived. Live cleared.');
    return;
  }

  var expected = existing.length + newEntries.length;
  historical.entries = existing.concat(newEntries);
  getTeamsHistoricalFile_().setContent(JSON.stringify(historical));

  // verify before clearing live
  var verify = readTeamsHistorical_();
  var vIds = {};
  (verify.entries || []).forEach(function(e) { if (e && e.id != null) vIds[e.id] = true; });
  var allPresent = newEntries.every(function(e) { return vIds[e.id]; });

  if ((verify.entries || []).length >= expected && allPresent) {
    live.entries = [];
    writeTeamsLive_(live);
    Logger.log('Teams: archived ' + newEntries.length + ' entries (verified). ' +
               'Historical total: ' + (verify.entries || []).length);
  } else {
    Logger.log('Teams: ARCHIVE VERIFY FAILED. Live NOT cleared — data preserved for retry.');
    try {
      GmailApp.sendEmail(IAN_EMAIL, 'FPT [ALERT] Teams archive verify FAILED',
        'Teams midnight archive could not confirm ' + newEntries.length +
        ' entries were written. Live was NOT cleared, so no data was lost. It will retry next run.',
        { name: 'FPT System' });
    } catch (e) { Logger.log('Alert email failed: ' + e); }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// EMAIL HELPERS
// ══════════════════════════════════════════════════════════════════════════

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
// Filters on loggedAt (when entered into system) not result date
// so backdated entries still appear in the report for the day they were logged
function sendDailyReport() {
  var live    = readLive_();
  var today   = getTodayET_();
  var entries = (live.entries || []).filter(function(e) {
    if (!e.loggedAt) return e.date === today; // fallback for legacy entries
    var d  = new Date(e.loggedAt);
    var et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    var ds = et.getFullYear() + '-' + String(et.getMonth()+1).padStart(2,'0') + '-' + String(et.getDate()).padStart(2,'0');
    return ds === today;
  });

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

// ══════════════════════════════════════════════════════════════════════════
// DIAGNOSTICS
// ══════════════════════════════════════════════════════════════════════════

function getStats() {
  var live       = readLive_();
  var historical = readHistorical_();
  var totalEntries = (historical.entries || []).length + (live.entries || []).length;

  Logger.log('=== GYM ===');
  Logger.log('Athletes    : ' + (live.athletes || []).length);
  Logger.log('Profiles    : ' + Object.keys(live.profiles || {}).length);
  Logger.log('Achievements: ' + (live.achievements || []).length);
  Logger.log('Live entries      : ' + (live.entries || []).length);
  Logger.log('Historical entries: ' + (historical.entries || []).length);
  Logger.log('Total entries     : ' + totalEntries);
  Logger.log('Pending intakes   : ' + (live.pendingIntakes || []).length);

  var teamsLive       = readTeamsLive_();
  var teamsHistorical = readTeamsHistorical_();
  var totalTeamEntries = (teamsHistorical.entries || []).length + (teamsLive.entries || []).length;

  Logger.log('=== TEAMS ===');
  Logger.log('Teams       : ' + (teamsLive.teams || []).length);
  Logger.log('Live entries      : ' + (teamsLive.entries || []).length);
  Logger.log('Historical entries: ' + (teamsHistorical.entries || []).length);
  Logger.log('Total entries     : ' + totalTeamEntries);
}

function checkServerState() {
  var live       = readLive_();
  var historical = readHistorical_();
  var allEntries = (historical.entries || []).concat(live.entries || []);

  Logger.log('Gym athletes: ' + (live.athletes || []).length);
  Logger.log('Gym total entries: ' + allEntries.length);
  Logger.log('Latest 3 gym entries:');
  allEntries.slice(-3).forEach(function(e) {
    Logger.log(e.date + ' | ' + e.athlete + ' | ' + e.exercise + ' | ' + (e.value || e.total));
  });
}


// ══════════════════════════════════════════════════════════════════════════
function sendLateEntryBackup() {
  var live  = readLive_();
  var today = getTodayET_();

  // ET hour:minute helper
  function etParts(iso) {
    var d  = new Date(iso);
    var et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    var ds = et.getFullYear() + '-' + String(et.getMonth()+1).padStart(2,'0') + '-' + String(et.getDate()).padStart(2,'0');
    return { date: ds, mins: et.getHours() * 60 + et.getMinutes() };
  }

  var CUTOFF = 19 * 60 + 45; // 7:45 PM — when the daily report runs

  var late = (live.entries || []).filter(function(e) {
    if (!e.loggedAt) return false;            // no timestamp = can't be a today late entry
    var p = etParts(e.loggedAt);
    return p.date === today && p.mins > CUTOFF;
  });

  if (!late.length) {
    Logger.log('Late backup: no entries logged after 7:45 PM. No email sent.');
    return;
  }

  var csv = buildCsv_(late);
  var displayDate = formatDisplayDate_(today);
  var subject = 'FPT [LATE ENTRIES] ' + displayDate + ' — ' + late.length + ' logged after 7:45 PM';
  var body = late.length + ' entr' + (late.length === 1 ? 'y was' : 'ies were') +
             ' logged after the 7:45 PM daily report on ' + displayDate +
             '. CSV attached as a backup of those entries.';

  try {
    GmailApp.sendEmail(CHRIS_EMAIL, subject, body, {
      cc: IAN_EMAIL,
      name: 'FPT System',
      attachments: [Utilities.newBlob(csv, 'text/csv', 'FPT_Late_' + today + '.csv')]
    });
    Logger.log('Late backup: emailed ' + late.length + ' late entries.');
  } catch (e) {
    Logger.log('Late backup email failed: ' + e);
  }
}


// ── Monthly PR query (manual utility — logs June PRs to console) ──────────
function getJunePRs() {
  var historical = readHistorical_();
  var live = readLive_();
  var allEntries = (historical.entries || []).concat(live.entries || []);
  var profiles = live.profiles || {};
  var juneEntries = allEntries.filter(function(e) {
    return e.date && e.date.startsWith('2026-06');
  });
  var athletes = [...new Set(juneEntries.map(function(e) { return e.athlete; }))];
  var results = [];
  athletes.forEach(function(ath) {
    var prof = profiles[ath] || {};
    var fptStart = prof.fptYear && prof.fptMonth ?
      prof.fptYear + '-' + String(prof.fptMonth).padStart(2,'0') : null;
    var isFirstMonth = fptStart && fptStart.startsWith('2026-06');
    if (isFirstMonth) return; // exclude first month
    ['fly','broad','vert'].forEach(function(ex) {
      var priorBest = allEntries.filter(function(e) {
        return e.athlete === ath && e.exercise === ex && e.date < '2026-06-01';
      });
      var juneBest = juneEntries.filter(function(e) {
        return e.athlete === ath && e.exercise === ex;
      });
      if (!priorBest.length || !juneBest.length) return;
      var lower = ex === 'fly';
      var prior = lower ? Math.min.apply(null, priorBest.map(function(e){return e.value;}))
                        : ex === 'broad' ? Math.max.apply(null, priorBest.map(function(e){return e.total;}))
                        : Math.max.apply(null, priorBest.map(function(e){return e.value;}));
      var current = lower ? Math.min.apply(null, juneBest.map(function(e){return e.value;}))
                          : ex === 'broad' ? Math.max.apply(null, juneBest.map(function(e){return e.total;}))
                          : Math.max.apply(null, juneBest.map(function(e){return e.value;}));
      var isPR = lower ? current < prior : current > prior;
      if (isPR) results.push({
        athlete: ath, exercise: ex,
        prior: prior, current: current
      });
    });
  });
  Logger.log(JSON.stringify(results));
}
// ══════════════════════════════════════════════════════════════════════════
// NAME REMAP TOOL — reconnect entries stuck under an old/misspelled name.
//
// Use when an athlete was renamed but old entries kept the previous spelling
// (their data shows as "missing" because entries don't match the roster name).
//
//   1. Add "Old Name": "Correct Name" pairs to REMAP below as you find them.
//   2. Run reportRemap()  — dry run, logs how many entries each pair will fix.
//   3. Run applyRemap()   — applies across historical + live, verified write.
//
// Matching is normalized (trim + case-insensitive) so spacing/case variants of
// the OLD name are caught too. Updates entries AND achievements.
// ══════════════════════════════════════════════════════════════════════════

var REMAP = {
  'Nate Susher':     'Nate Swisher',
  'Kadenne Merigo':  'Kadence Merigo',
  'Savannah McLean': 'Savannah McClean'
};

function _norm_(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

// Build a normalized-old -> correct lookup
function _remapIndex_() {
  var idx = {};
  Object.keys(REMAP).forEach(function(oldName) { idx[_norm_(oldName)] = REMAP[oldName]; });
  return idx;
}

function _applyRemapTo_(entries, idx, counts) {
  (entries || []).forEach(function(e) {
    if (!e) return;
    var target = idx[_norm_(e.athlete)];
    if (target && e.athlete !== target) {
      counts[target] = (counts[target] || 0) + 1;
      e.athlete = target;
    }
  });
}

function reportRemap() {
  var idx = _remapIndex_();
  var hist = readHistorical_();
  var live = readLive_();
  var counts = {};
  // count without mutating originals (work on copies)
  function count(entries) {
    (entries || []).forEach(function(e) {
      if (!e) return;
      var t = idx[_norm_(e.athlete)];
      if (t && e.athlete !== t) counts[t] = (counts[t] || 0) + 1;
    });
  }
  count(hist.entries); count(live.entries);
  Logger.log('=== REMAP DRY RUN ===');
  Object.keys(REMAP).forEach(function(o) {
    Logger.log('  ' + o + ' -> ' + REMAP[o] + '  : ' + (counts[REMAP[o]] || 0) + ' entries (across hist+live)');
  });
  var total = Object.keys(counts).reduce(function(s,k){return s+counts[k];},0);
  Logger.log('  TOTAL entries to remap: ' + total);
  Logger.log('(Nothing written. Run applyRemap() to apply.)');
}

function applyRemap() {
  var idx = _remapIndex_();
  var hist = readHistorical_();
  var live = readLive_();
  var counts = {};

  _applyRemapTo_(hist.entries, idx, counts);
  _applyRemapTo_(hist.achievements, idx, counts); // harmless if undefined
  _applyRemapTo_(live.entries, idx, counts);
  _applyRemapTo_(live.achievements, idx, counts);

  // write historical, verify, then live
  var expectedLen = (hist.entries || []).length;
  getHistoricalFile_().setContent(JSON.stringify(hist));
  var verify = readHistorical_();
  if ((verify.entries || []).length !== expectedLen) {
    Logger.log('ABORT: historical write did not verify. Live untouched.');
    return;
  }
  writeLive_(live);

  var total = Object.keys(counts).reduce(function(s,k){return s+counts[k];},0);
  Logger.log('=== REMAP APPLIED ===');
  Object.keys(counts).forEach(function(k) { Logger.log('  -> ' + k + ': ' + counts[k] + ' entries'); });
  Logger.log('  TOTAL remapped: ' + total + '. Historical verified, live updated.');
}