
// ── PENDING INTAKE HANDLER ─────────────────────────────────────────────────
// Add this handling to your existing doPost function.
// Replace your current doPost with this version:

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    // Handle pending intake submissions from the public intake form
    if (payload.action === 'pendingIntake') {
      var state = readState_();
      if (!state.pendingIntakes) state.pendingIntakes = [];
      state.pendingIntakes.push(payload.data);
      writeState_(state);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Standard full-state save (existing behaviour)
    writeState_(payload);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
