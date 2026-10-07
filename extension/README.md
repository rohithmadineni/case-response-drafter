# IQS Response Agent (browser extension)

Reads the Salesforce case you have open, summarises it, and drafts the next customer email in the Proactive Support
format, checked against the IQS rules. Everything runs locally in the browser: no network calls, no AI service, nothing
is sent or written to Salesforce. Every output is a draft for you to review.

## Install (Chrome / Edge / Brave)
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** and select this `extension/` folder.
3. Open a Salesforce case, click the extension icon.

## Use
1. **Summary tab** – the case is read automatically (press **↻** to re-read). You get the stage, what the customer is
   waiting on, what they asked, flags to check before sending, and a short de-duplicated timeline.
2. **Draft tab** – the email type is chosen from the case history ("Auto – …"); override it if you like, set the
   next-update days, add optional notes, press **Generate draft**. Edit the draft in place – the IQS checklist updates live.
3. **Copy**, paste into Salesforce.

Notes understood by the templates (one per line): `Root cause:`, `Action taken:`, `Validation:`, `Duplicate of:`,
`Delivered on:`, and for Field Engineer details `Name:`, `Contact:`, `Email:`, `Arrival date:`, `Arrival time:`.
Bracketed placeholders such as `[ROOT CAUSE IN PLAIN LANGUAGE]` mean something still needs filling; the checklist flags them.

If the page can't be read (not a case page, history not loaded), use **Paste case details instead** – it accepts
Salesforce query output, a CSV export, or an email thread.

## Email types
Initial Response · Follow-up · Support tunnel request · Support tunnel enabled (start of investigation) · Update with
findings · Approval request · Proceeding after approval · Request shipping details · RMA raised · Part delivered
follow-up (self-replace / Field Engineer / Zoom) · Field Engineer details · Hold · Monitoring update + request to close ·
Short summary requesting closure · Closure · Closure – Resolution Summary · Simple closure · Ghosted closure · Duplicate closure.
These follow `Proactive_Support_Sample_Mails.md`.

Business Impact is chosen per alert (Node Bad still BAD vs recovered, power supply AC lost, disk, DIMM, IERR, OS/log
partition, archival, VMware/Hyper-V, multiple nodes) and shown in the first three Rubrik emails. Unknown alert types get
a neutral statement, never "node BAD".

## Files
```
manifest.json   MV3; permissions: activeTab, scripting; hosts: *.salesforce.com, *.force.com, *.cloudforce.com
popup.html/.css/.js   UI (Summary / Draft tabs, settings, paste fallback)
extract.js      injected into the case tab on demand; reads fields + history, de-duplicates
engine.js       parsing, summary, stage detection, templates, IQS check (pure functions, no I/O)
tests/          engine, extractor and popup tests (jsdom)
_legacy/        the previous agents/content script, kept for reference only – not loaded
```

## Develop / test
```bash
cd extension && npm install   # (or rely on ../node_modules) – only jsdom, for tests
npm test                      # engine + extractor + popup
```
`engine.js` began as a port of `../src` (the offline page / dashboard logic) and is now maintained here.

## Known limits – please read
- **The page reader is verified only against a synthetic Lightning-style page, not a live Salesforce org.** It uses the
  `data-target-selection-name` field markers, label/value fallbacks and the activity-timeline markup. Salesforce page
  layouts vary and only the history that is loaded on screen can be read ("Show more / View All" must be expanded first;
  the extension warns when it sees those links). If a field or the history comes back wrong, use the paste fallback and
  send me the page's markup so the selectors can be tuned.
- Times shown in the timeline are the browser's local time converted to UTC; email dates in drafts are always UTC.
- Drafts are rule-based. Case-specific root causes come from your notes or from evidence found in internal comments.
- The old IndexedDB "learning" store did not influence drafts and was removed.
- The loaded case is kept in this browser's `localStorage` for 8 hours so it survives the popup closing; **Settings →
  Clear saved case data** removes it.
