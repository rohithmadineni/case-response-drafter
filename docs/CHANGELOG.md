# Changelog

## 1.0.0 – 2026-10-06
- Offline page: paste or drop history (Salesforce output, CSV, email thread), instant local summary, templates for all 12 email types, live IQS checklist, Resolution Details, copy / save.
- CLI (`tools/draft.js`) with text and JSON output.
- Dashboard: My cases view (owner, scope), reply check (needs reply / overdue / new alert / waiting / no reply ×3+), filter tiles and charts, slide-over drafting panel, saved drafts, pre-drafting in background.
- Two-agent pipeline: Agent 1 local summarizer (~10 ms; replaced a ~90 s AI call), Agent 2 single compact AI call (~1.3 KB prompt scoped to the chosen type and scenario).
- Salesforce calls throttled with priority queue and automatic retry on rate limits.
- Banned-phrase and markdown scrubbing on every draft.
- Knowledge base (24 scenarios, 28 process templates) and the `sfdc-case-response-drafter` skill.
- 20 unit tests and a browser smoke test with synthetic fixtures.
