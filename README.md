# Case Response Drafter

Drafts the next customer email for a Rubrik Proactive Support case – Initial Response, follow-up, update, approval request, hold, monitoring update, or closure – from the Salesforce case history, in Rohith Madineni's format and checked against the IQS Scoring Guide (v1.5.2).

It comes in four parts that share one rule set:

| Part | Where it runs | Needs | Best for |
|---|---|---|---|
| `dist/Case-Response-Drafter-Offline.html` | Any browser, double-click to open | Nothing (no internet) | Pasting a case history and getting a draft + IQS check instantly |
| `tools/draft.js` | Terminal (Node 18+) | Node.js | Drafting from an exported history file |
| `dist/dashboard.html` | Claude Cowork (live artifact) | Cowork + Salesforce connector | All your cases, "what needs a reply", AI drafts |
| `skill/sfdc-case-response-drafter/SKILL.md` | Claude Cowork / Claude Code | Salesforce connector | Asking Claude in chat: "draft the next email for case 0133…" |

Nothing in this project sends email or writes to Salesforce. Every output is a draft for you to review.

---

## Quick start

### Offline page (no setup)
1. Open `dist/Case-Response-Drafter-Offline.html` in Chrome, Edge, Firefox or Safari.
2. Paste the case **Description** and the **comment history**, or drop a `.txt` / `.csv` file onto the page.
   Accepted history formats:
   - Salesforce query output (`Record 1: CommentBody / CreatedDate / CreatedBy.Name`)
   - CSV export with `CommentBody, CreatedDate, CreatedBy.Name` columns
   - A plain email thread where each message starts with `From:`
3. Choose the email type (or **Auto**), optionally add notes such as `Root cause: …`, `Action taken: …`, `Duplicate of: 0133…`.
4. Click **Build summary + draft**. Review the IQS checklist, then copy or save the draft.

Your last case is remembered in the browser's local storage only.

### Command line
```bash
npm run example                       # drafts the bundled sample case
node tools/draft.js --history my_case.txt --desc my_description.txt \
     --case 01335379 --subject "[Customer] Proactive Case: (Cluster name: X) Node is Bad" \
     --status "In Progress" --type Auto --days 2 \
     --notes "Root cause: ...\nAction taken: ..."
node tools/draft.js ... --json        # machine-readable output
```

### Cowork dashboard
Upload `dist/dashboard.html` as a Cowork artifact with the tool `mcp__salesforce__salesforce_query_records` enabled (or ask Claude in Cowork to "create an artifact from dashboard.html with the Salesforce query tool"). It loads every case for an owner, checks which need a reply, and drafts with one AI call per email.

### Skill
Copy `skill/sfdc-case-response-drafter/` into your Claude skills folder (or save it with Cowork's save-skill). Then: `/sfdc-case-response-drafter 01335379 closure`.

---

## How it works

```
Salesforce case + comments
        │
        ▼
Agent 1 – local summarizer (src/app.js → localSummary)   ~10 ms, O(n) in comments
  • classifies each comment: customer / rubrik / internal / alert / rma / auto-notice
  • extracts alert, nodes, contact, 12-point timeline, last messages, promised date,
    follow-up count, open asks, unanswered questions, evidence from internal notes,
    actions (alerts cleared, RMAs), stage, and "check before sending" flags
  • output: ~3 KB fact sheet (an 80 KB / 74-comment history compresses to ~2.8 KB)
        │
        ▼
Agent 2 – drafter
  • offline / CLI: rule-based templates for all 12 email types (instant)
  • dashboard: one compact AI call (fact sheet + rules for the chosen type only)
        │
        ▼
IQS check  – What / When / Why, business impact, 24×7 line, closure signals,
             banned phrases, sign-off, unfilled placeholders
```

### House rules enforced everywhere
- Never "data loss"; never "No data disruption to backup/restore operations was observed"; "close", not "archive".
- UTC times; default next update = today + 2 days, 12:00 PM UTC (or one day after a date the customer gave).
- Plain text, no markdown; no raw commands, log lines or internal IDs in customer emails.
- Closure = Problem Summary / Root Cause / Resolution Steps + standard closing lines.
- Signature: `Rohith Madineni / Customer Success Engineer – Proactive Support / Rubrik`.

The full rules, IQS checklist, 24 alert scenarios and 28 process templates are in `knowledge-base/proactive_support_response_kb.json`.

---

## Project layout
```
case-response-drafter/
├── README.md
├── package.json                 npm scripts: build, test, test:page, draft, example
├── src/
│   ├── shared.js                Salesforce queue, parsing, classification, context building, AI prompt rules
│   ├── app.js                   dashboard UI + local summarizer + templates + AI pipeline
│   ├── offline.js               offline page UI, input parsers, extra templates, IQS checker
│   └── templates/               HTML shells with /*SHARED*/ /*APP*/ /*LIB*/ /*OFFLINE*/ slots
├── dist/                        built outputs (regenerate with `npm run build`)
├── tools/
│   ├── build.py                 assembles dist/ from src/
│   └── draft.js                 command-line drafter
├── tests/
│   ├── run_tests.js             20 unit tests (parsing, summary, drafts, IQS)
│   ├── offline_page.test.js     browser smoke test (jsdom)
│   └── fixtures/                synthetic sample data (no real customer data)
├── knowledge-base/              rules, scenarios and templates as JSON
├── skill/                       the Claude skill
└── docs/CHANGELOG.md
```

## Develop
```bash
npm install          # only needed for the jsdom page test
npm run build        # rebuild dist/ after editing src/
npm test             # build + unit tests
npm run test:page    # build + offline page smoke test
```
Notes:
- `src/app.js` grew in stages; later definitions of `generate`, `preDraft` and `ensureSummary` intentionally override earlier ones (JavaScript uses the last function declaration). Edit the last definition.
- `dist/lib.cjs` is generated – edit `src/`, not `dist/`.
- Keep real customer data out of `tests/fixtures/`.

## Limits
- Offline and CLI drafts are template-based: accurate for routine IRs, follow-ups and closures, but case-specific root-cause wording comes from your `Root cause:` note. Use the dashboard's AI draft or the skill for nuanced cases.
- The local summarizer relies on Salesforce comment conventions (From/To headers, alert-bot text, node-status lines). Unusual formats may need an edit to `localSummary`.
- Always review before sending.
