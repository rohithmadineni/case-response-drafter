# Phase 2 Implementation Checklist

## Timeline: 1 Week

---

## Day 1-2: Supabase Setup ✅

- [ ] Sign up at supabase.com
- [ ] Create project `case-response-drafter`
- [ ] Run SQL to enable pgvector: `CREATE EXTENSION IF NOT EXISTS vector;`
- [ ] Create tables:
  - [ ] approved_drafts
  - [ ] draft_edits
  - [ ] iqs_scores
  - [ ] analytics
- [ ] Create RLS policies for all tables
- [ ] Create stored procedures:
  - [ ] store_approved_draft
  - [ ] find_similar_drafts
  - [ ] get_stats
- [ ] Get Project URL and Anon Key
- [ ] Test with SQL: `SELECT * FROM approved_drafts LIMIT 1;`

**Deliverable:** Supabase dashboard with empty tables ready to receive data

---

## Day 3: Sync Layer ✅

- [ ] Copy `supabase-client.js` to extension folder
- [ ] Create `extension/sync.js` with SyncManager class
- [ ] Add to `extension/popup.html`:
  - [ ] Supabase settings form
  - [ ] "Find Similar Cases" button
  - [ ] Test connection button
- [ ] Modify `extension/popup.js`:
  - [ ] Load Sync manager on startup
  - [ ] Update approve button to call `Sync.syncApprovedDraft()`
  - [ ] Add similar cases button handler
  - [ ] Add Supabase settings handlers
- [ ] Test: Fill form, approve draft, check Supabase dashboard

**Deliverable:** Extension syncs approved drafts to cloud

---

## Day 4: Semantic Search ✅

- [ ] In `supabase-client.js`:
  - [ ] Implement `_generateEmbedding()` (use hash for MVP)
  - [ ] Update `storeApprovedDraft()` to call embedding
  - [ ] Implement `findSimilarDrafts()` using RPC
- [ ] In `extension/sync.js`:
  - [ ] Implement `getSimilarCases()`
  - [ ] Implement `_findSimilarLocally()` for offline
- [ ] Test: Store 2-3 drafts, search for similar, verify results

**Deliverable:** Can find similar cases based on draft content

---

## Day 5: Analytics & Learning ✅

- [ ] In `extension/popup.js`:
  - [ ] Call `Sync.recordIQSScore()` after validation
  - [ ] Call `Sync.recordAnalytic()` for approvals
- [ ] In `supabase-client.js`:
  - [ ] Implement `recordEdit()` (optional for MVP)
  - [ ] Implement `recordIQSScore()`
  - [ ] Implement `recordAnalytic()`
- [ ] Create Supabase dashboard queries:
  - [ ] Total drafts stored
  - [ ] Most common response types
  - [ ] Approval rate by type
  - [ ] Common IQS check failures

**Deliverable:** System tracks what works, analytics visible in Supabase

---

## Day 6: Claude API (Optional) ✅

- [ ] Create `extension/claude-enhancer.js`:
  - [ ] Get Anthropic API key (user input in settings)
  - [ ] Build prompt: case facts + similar examples + IQS rules
  - [ ] Call Claude API
  - [ ] Fall back to template if error
- [ ] In popup settings:
  - [ ] Add Claude API key input
  - [ ] Add "Use Claude enhancement" toggle
- [ ] In draft modal:
  - [ ] Add "Get Claude suggestion" button
  - [ ] Show side-by-side: template vs Claude
- [ ] Test: Generate draft, toggle Claude, compare results

**Deliverable:** Optional AI-enhanced drafting (facts-only, no hallucinations)

---

## Day 7: Testing & Polish ✅

- [ ] Integration testing:
  - [ ] [ ] Offline → online → sync flow
  - [ ] [ ] Generate draft → find similar → approve → stored
  - [ ] [ ] Batch drafting (multiple cases)
  - [ ] [ ] Analytics dashboard
- [ ] Edge cases:
  - [ ] [ ] No internet when approving (should still save locally)
  - [ ] [ ] Network goes down mid-sync (should retry)
  - [ ] [ ] Similar cases with 0 matches (handle gracefully)
  - [ ] [ ] Claude API unavailable (fallback to template)
- [ ] Documentation:
  - [ ] [ ] Update README with Phase 2 features
  - [ ] [ ] Create user guide for Supabase setup
  - [ ] [ ] Add troubleshooting section
- [ ] Performance:
  - [ ] [ ] Search <1s with 100+ drafts
  - [ ] [ ] Sync doesn't block UI
  - [ ] [ ] No storage leaks

**Deliverable:** Production-ready Phase 2

---

## Optional: Batch Drafting (Day 8+)

- [ ] UI for uploading CSV with multiple cases
- [ ] Batch process logic:
  - [ ] Validate all cases
  - [ ] Generate drafts in parallel
  - [ ] Export as spreadsheet
  - [ ] Sync all to Supabase
- [ ] Display batch progress

---

## Code Structure After Phase 2

```
case-response-drafter/
├── extension/
│   ├── manifest.json
│   ├── popup.html           (+ Supabase settings form)
│   ├── popup.js             (+ sync handlers)
│   ├── popup.css
│   ├── content.js
│   ├── background.js
│   ├── storage.js
│   ├── supabase-client.js   (NEW)
│   ├── sync.js              (NEW)
│   ├── claude-enhancer.js   (NEW - optional)
│   └── icons/
│
├── backend/
│   ├── SUPABASE_SETUP.md       (SQL setup guide)
│   ├── PHASE2_INTEGRATION.md   (integration guide)
│   ├── supabase-client.js      (copied to extension/)
│   └── PHASE2_CHECKLIST.md     (this file)
│
└── PHASE_1_COMPLETE.md
```

---

## Testing Matrix

| Scenario | Expected | Status |
|----------|----------|--------|
| Online: Approve draft | Syncs to Supabase | ⬜ |
| Offline: Approve draft | Saves locally, syncs on reconnect | ⬜ |
| Search: 2+ drafts | Returns similar cases | ⬜ |
| Search: 0-1 drafts | Returns empty gracefully | ⬜ |
| Search: Offline | Uses local search | ⬜ |
| Claude: Available | Shows enhanced draft | ⬜ |
| Claude: Unavailable | Falls back to template | ⬜ |
| Stats: View in Supabase | Shows aggregates | ⬜ |
| Multi-browser: Same account | Drafts sync across devices | ⬜ |

---

## Success Criteria

✅ System learns from approvals (stores similar cases)  
✅ Semantic search works (finds similar drafts)  
✅ Offline-first (syncs when online)  
✅ Claude optional (facts-only, no assumptions)  
✅ Analytics visible (what works best)  
✅ Zero hallucinations (guards in place)  
✅ <1 second search (fast UI)  
✅ Multi-device sync (same cases everywhere)  

---

## Known Limitations (Phase 2)

⚠️ Embeddings are hash-based (placeholder)
- Real MVP: use OpenAI text-embedding-3-small (~$0.02 per 1M tokens)
- Or: use Cohere or other provider

⚠️ Claude API cost (optional)
- ~$0.01 per draft with smart-cached examples
- Optional feature, template works fine without it

⚠️ No batch prediction yet
- Phase 3: pre-generate drafts for all open cases

---

## Files to Create/Modify

### Create (New)
- [ ] `backend/SUPABASE_SETUP.md`
- [ ] `backend/PHASE2_INTEGRATION.md`
- [ ] `backend/supabase-client.js`
- [ ] `backend/PHASE2_CHECKLIST.md`
- [ ] `extension/sync.js`
- [ ] `extension/claude-enhancer.js` (optional)

### Modify
- [ ] `extension/popup.html` - Add Supabase settings
- [ ] `extension/popup.js` - Add sync logic
- [ ] `extension/manifest.json` - Add permissions for Supabase

### No Change Needed
- `extension/storage.js` - Already supports offline
- `extension/popup.css` - Styles work as-is

---

## Deployment

### Development
```bash
# Load unpacked in Chrome (already doing this)
# Sync manager will write to localhost (optional)
```

### Staging
```bash
# Create Supabase project in staging
# Test sync with test data
```

### Production
```bash
# Create Supabase project (prod tier)
# Update extension with prod Supabase URL
# Users configure their own Supabase keys (self-hosted)
```

---

## Go/No-Go Decision Points

**After Day 2 (Supabase Setup):**
- Do we have empty tables ready?
- Do we have API keys?
- → Go / No-Go for sync layer

**After Day 3 (Sync):**
- Does extension show Supabase settings?
- Do approved drafts appear in Supabase?
- → Go / No-Go for search

**After Day 4 (Search):**
- Can we find similar cases?
- Does offline fallback work?
- → Go / No-Go for Claude API

**After Day 7 (Complete):**
- All tests passing?
- Documentation complete?
- → Go to production

---

## Next After Phase 2

**Phase 3 Ideas:**
- Batch drafting (draft 10 cases at once)
- Salesforce sync (save drafts back to cases)
- Analytics dashboard (external view of trends)
- Fine-tuning (improve Claude with real approvals)
- Mobile app (manage on phone)

---

## Contact / Questions

If blocked, check:
1. Supabase dashboard → SQL errors
2. Browser console → JavaScript errors
3. Network tab → API calls failing
4. Extension storage → data not persisting

Good luck! 🚀
