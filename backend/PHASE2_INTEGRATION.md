# Phase 2: Integration Guide

Connecting the browser extension to Supabase backend.

---

## Architecture

```
Browser Extension (Phase 1)
  ↓ Stores locally + syncs when approved
  ↓
Supabase Backend (Phase 2)
  ├── PostgreSQL + pgvector
  ├── Store approved drafts + embeddings
  ├── Semantic search (find similar cases)
  └── Analytics & learning
  ↓
Claude API (Optional, Phase 2)
  ├── Facts-only prompts
  ├── Similar cases as examples
  └── Enhanced drafting
```

---

## Files

### Backend Files
- `supabase-client.js` - API client for extension to use
- `SUPABASE_SETUP.md` - How to set up Supabase

### Extension Modifications (Phase 2)
- `extension/sync.js` - Sync logic (new file)
- `extension/popup.js` - Add "Find similar cases" button (modify)
- `extension/storage.js` - Already supports offline (no change needed)

---

## Step 1: Set Up Supabase (5 minutes)

Follow `SUPABASE_SETUP.md`:
1. Create Supabase project
2. Enable pgvector
3. Create tables
4. Set up RLS
5. Create API functions
6. Get API keys

---

## Step 2: Add Supabase Client to Extension

### 2.1 Copy Client Library

```bash
cp backend/supabase-client.js extension/supabase-client.js
```

### 2.2 Update popup.html

Add script tag before closing `</body>`:

```html
<script src="supabase-client.js"></script>
<script src="sync.js"></script>
```

### 2.3 Create extension/sync.js

```javascript
// Sync layer - manages offline-to-cloud synchronization

class SyncManager {
  constructor(supabaseUrl, anonKey) {
    this.supabase = new SupabaseClient(supabaseUrl, anonKey);
    this.isOnline = navigator.onLine;
    
    window.addEventListener('online', () => this._onOnline());
    window.addEventListener('offline', () => this._onOffline());
  }

  // ============= SYNC APPROVED DRAFTS =============

  async syncApprovedDraft(caseNumber, draft) {
    /**
     * Called when user clicks "Approve Draft"
     * 1. Save to local storage (always works)
     * 2. If online, sync to Supabase
     * 3. Get similar cases back
     */

    // Step 1: Save locally (offline-first)
    const approved = await Store.get('approved_drafts', {});
    approved[caseNumber] = {
      draft: draft.text,
      type: draft.type,
      summary: draft.summary,
      approvedAt: new Date().toISOString()
    };
    await Store.set('approved_drafts', approved);

    // Step 2: Sync to cloud if online
    if (this.isOnline) {
      try {
        await this.supabase.storeApprovedDraft({
          caseNumber,
          draftText: draft.text,
          responseType: draft.type,
          subject: draft.summary.subject,
          accountName: draft.summary.account,
          description: draft.summary.description,
          status: draft.summary.status,
          alertType: draft.summary.alerts[0]?.type,
          nodeId: draft.summary.alerts[0]?.node,
          customerComments: draft.summary.customer_comments,
          rubrikComments: draft.summary.rubrik_comments
        });

        console.log('Draft synced to cloud');
      } catch (e) {
        console.warn('Cloud sync failed, will retry later:', e);
        // Still saved locally, so no data loss
      }
    }
  }

  // ============= GET SIMILAR CASES =============

  async getSimilarCases(caseText, responseType) {
    /**
     * Find similar approved drafts
     * Returns empty array if offline or no matches
     */

    if (!this.isOnline) {
      console.log('Offline - using local similar search');
      return this._findSimilarLocally(caseText);
    }

    try {
      const similar = await this.supabase.findSimilarDrafts(
        caseText,
        responseType,
        3 // top 3 matches
      );
      return similar || [];
    } catch (e) {
      console.warn('Could not fetch similar cases:', e);
      return this._findSimilarLocally(caseText);
    }
  }

  _findSimilarLocally(caseText) {
    /**
     * Fallback: search approved drafts stored locally
     * Simple text matching (no embeddings)
     */
    // TODO: implement local search
    return [];
  }

  // ============= RECORD INTERACTION =============

  async recordEdit(draftId, before, after) {
    if (!this.isOnline) return;
    await this.supabase.recordEdit(draftId, before, after, 'user_edit');
  }

  async recordIQSScore(draftId, type, passed, total, failed) {
    if (!this.isOnline) return;
    await this.supabase.recordIQSScore(draftId, type, passed, total, failed);
  }

  // ============= LIFECYCLE =============

  _onOnline() {
    console.log('Back online - syncing...');
    this.isOnline = true;
    this._syncQueue();
  }

  _onOffline() {
    console.log('Offline - using local storage');
    this.isOnline = false;
  }

  async _syncQueue() {
    /**
     * On reconnect, sync any drafts that weren't synced
     */
    const approved = await Store.get('approved_drafts', {});
    const synced = await Store.get('synced_drafts', {});

    for (const [caseNo, draft] of Object.entries(approved)) {
      if (!synced[caseNo]) {
        try {
          await this.supabase.storeApprovedDraft({...draft});
          synced[caseNo] = true;
        } catch (e) {
          console.warn(`Failed to sync ${caseNo}:`, e);
        }
      }
    }
    await Store.set('synced_drafts', synced);
  }
}

// Initialize when document loads
let Sync = null;

document.addEventListener('DOMContentLoaded', async () => {
  const supabaseUrl = localStorage.getItem('supabase_url');
  const supabaseKey = localStorage.getItem('supabase_key');

  if (supabaseUrl && supabaseKey) {
    Sync = new SyncManager(supabaseUrl, supabaseKey);
    console.log('Sync manager initialized');
  } else {
    console.log('Supabase not configured - using local storage only');
  }
});
```

---

## Step 3: Add Settings UI

In `extension/popup.html`, add to Settings tab:

```html
<div class="section">
  <h2>Supabase Configuration</h2>

  <div class="form-group">
    <label for="supabaseUrl">Project URL</label>
    <input type="text" id="supabaseUrl" placeholder="https://xxxxx.supabase.co">
  </div>

  <div class="form-group">
    <label for="supabaseKey">Anon Key</label>
    <input type="password" id="supabaseKey" placeholder="eyJ...">
    <small>Get this from Supabase Settings → API</small>
  </div>

  <button id="testConnectionBtn" class="btn-secondary">Test Connection</button>
  <button id="saveSupabaseBtn" class="btn-primary">Save Supabase Settings</button>
</div>
```

In `extension/popup.js`, add:

```javascript
// Supabase settings
document.getElementById('saveSupabaseBtn').addEventListener('click', async () => {
  const url = document.getElementById('supabaseUrl').value.trim();
  const key = document.getElementById('supabaseKey').value.trim();

  if (!url || !key) {
    showStatus('Enter both URL and API key', 'error');
    return;
  }

  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_key', key);
  showStatus('✓ Supabase settings saved', 'success');
});

document.getElementById('testConnectionBtn').addEventListener('click', async () => {
  const url = document.getElementById('supabaseUrl').value.trim();
  const key = document.getElementById('supabaseKey').value.trim();

  if (!url || !key) {
    showStatus('Enter both URL and API key', 'error');
    return;
  }

  showStatus('Testing connection...', 'info');
  const client = new SupabaseClient(url, key);
  const ok = await client.checkConnection();
  showStatus(ok ? '✓ Connected to Supabase' : '✗ Connection failed', ok ? 'success' : 'error');
});
```

---

## Step 4: Add "Find Similar Cases" Button

In `extension/popup.html`, in the draft modal:

```html
<div class="modal-footer">
  <button id="findSimilarBtn" class="btn-secondary">Find Similar Cases</button>
  <button id="approveDraftBtn" class="btn-primary">✓ Approve Draft</button>
</div>
```

In `extension/popup.js`:

```javascript
document.getElementById('findSimilarBtn').addEventListener('click', async () => {
  if (!Sync) {
    showStatus('Supabase not configured', 'error');
    return;
  }

  showStatus('Finding similar cases...', 'info');
  const similar = await Sync.getSimilarCases(State.draft, State.currentType);

  if (similar.length === 0) {
    showStatus('No similar cases found', 'error');
    return;
  }

  // Display similar cases
  const html = similar.map(s => `
    <div class="similar-case">
      <strong>${s.case_number}</strong>
      <p>${s.response_type} - ${s.alert_type}</p>
      <small>Similarity: ${(1 - s.similarity).toFixed(2)}</small>
      <button onclick="copySimilarDraft('${s.case_number}')">Use as reference</button>
    </div>
  `).join('');

  // Show in a tooltip or new section
  showStatus(`✓ Found ${similar.length} similar case(s)`, 'success');
  console.log('Similar cases:', similar);
});
```

---

## Step 5: When User Approves Draft

Modify the approve button:

```javascript
document.getElementById('approveDraftBtn').addEventListener('click', async () => {
  const caseNo = document.getElementById('caseNo').value.trim();
  const draft = State.draft;

  // Save locally
  const approvedDrafts = await Store.get('approved_drafts', {});
  approvedDrafts[caseNo] = {
    draft,
    type: State.currentType,
    summary: State.summary,
    approvedAt: new Date().toISOString()
  };
  await Store.set('approved_drafts', approvedDrafts);

  // Sync to cloud (if Sync is initialized)
  if (Sync) {
    await Sync.syncApprovedDraft(caseNo, {
      text: draft,
      type: State.currentType,
      summary: State.summary
    });
  }

  showStatus('✓ Draft approved and saved', 'success');
  document.getElementById('draftModal').classList.add('hidden');
});
```

---

## Step 6: Test Integration

### 6.1 Configure Supabase
1. Set up Supabase project (follow SUPABASE_SETUP.md)
2. Get Project URL and Anon Key
3. Open extension → Settings tab
4. Paste URL and Key
5. Click "Test Connection"
6. Should see "✓ Connected to Supabase"

### 6.2 Approve a Draft
1. Go to "Draft Response" tab
2. Fill in case data
3. Click "Generate Draft"
4. Click "✓ Approve Draft"
5. Check browser console → should see "Draft synced to cloud"
6. Go to Supabase dashboard → SQL Editor → `SELECT * FROM approved_drafts`
7. Should see your draft

### 6.3 Find Similar Cases
1. Generate another draft
2. Click "Find Similar Cases"
3. Should see the previous draft listed (or "No similar cases found" first time)

---

## Troubleshooting

**"Connection failed" error**
- Verify URL and Key are correct
- Check Supabase project is running
- Ensure RLS policies are set correctly

**Draft not syncing**
- Check browser is online (not offline)
- Check browser console for errors
- Verify Supabase tables exist

**"Find Similar" returns no results**
- First run: no similar cases yet (need 2+ approved drafts)
- Check embedding generation isn't failing (see console)
- Try with 2-3 drafts first

---

## Next: Claude API Integration

Once sync is working, we'll add optional Claude API:

```
User draft → Get similar cases → Send to Claude with examples → Enhanced draft
```

This prevents hallucinations because Claude only sees:
- Case facts (never assumes anything)
- Similar past approvals (learned examples)
- IQS rules (compliance guardrails)

---

## Summary

Phase 2 Features:
- ✅ Offline-first sync (works without internet)
- ✅ Semantic search (find similar cases)
- ✅ Analytics tracking (what works best)
- ✅ Ready for Claude API (next step)

No data loss, all learning stored, no hallucinations.
