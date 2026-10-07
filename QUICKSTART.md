# Quick Start - IQS Response Agent

## 🚀 Install in 2 Minutes

### Step 1: Load Extension
```
1. Open chrome://extensions/
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the "extension" folder
5. Icon appears in toolbar
```

## 📖 Use in 3 Steps

### Step 1: Go to Case
Open any Salesforce case in your browser.

### Step 2: Click Icon
Click the extension icon in toolbar → Popup opens

### Step 3: Load & Generate
```
Click "📋 Load Case" → Case details loaded
Type: "Follow-up for this case - customer waiting"
Click "Generate Response" → Done!
```

## 🎯 What You Get

**Input:**
```
"Follow-up for case - customer wants status on node bad alert"
```

**Output:**
```
Subject: [ProactiveCare] Regarding Case #01234567 - Issue Update

Hi Customer,

Thank you for your patience while we investigated the node bad alert.

STATUS UPDATE:
- Issue confirmed and root cause identified
- We are implementing the following fix: [ACTION TAKEN]
- Expected resolution: [TIMEFRAME]

NEXT STEPS:
- Monitor the system over the next 24 hours
- We will follow up by October 8, 12:00 PM UTC with status
- Please let us know immediately if the issue recurs

Best regards,
Rubrik Proactive Care
Case #01234567
```

**IQS Score:** 95%

## 💡 How to Use

### First Time Setup
1. Load extension ✓
2. Go to Salesforce case
3. Click extension icon
4. Click "📋 Load Case"
5. Type your request and generate

### Second Time (Agent Learns)
1. Go to SIMILAR case
2. Click extension icon
3. Click "📋 Load Case"
4. Type request
5. Agent finds previous similar response
6. Uses it as reference → Better draft!

## 📚 Response Types

Agent recognizes these types automatically:

```
"Follow-up for..." → Follow-up response
"IR for..." → Initial Response
"Closure for..." → Case closure
"Approval for..." → Approval request
"Escalate..." → Escalation notice
```

## ✅ How Learning Works

```
User approves response
    ↓
Stored in IndexedDB (on your computer)
    ↓
Next similar case detected
    ↓
Agent uses past approval as reference
    ↓
Generates better response
```

## 🔧 Settings

Click ⚙️ icon to see:
- Total approved responses stored
- Export learning data (JSON)
- Clear all data (if needed)

## 📋 IQS Compliance

Agent checks:
- ✔ Has greeting
- ✔ Has sign-off
- ✔ Includes case ID
- ✔ Mentions follow-up date
- ✔ No forbidden words
- ✔ Plain text format
- ✔ Proper length
- ✔ Clear action items

Shows **compliance score** after each generation.

## 💾 Your Data

- **Stored Locally:** All learning data on your computer
- **Never Sent:** No API calls, no cloud storage
- **You Control:** Export or delete anytime
- **Private:** Only you can see your responses

## 🎓 Tips

1. **Start Simple** - First response might be basic
2. **Approve Good Ones** - Only approve responses you like
3. **Be Specific** - More details = better responses
4. **Reuse Language** - Agent learns your style
5. **Check Score** - Aim for 80%+ IQS compliance

## ⚡ First Response Example

```
Case: 01234567
Subject: Node 5 marked BAD

Your prompt:
"Follow-up for this case - customer waiting on status"

Agent generates ✓ Compliance: 92%

You approve ✓ Stored for learning

Next similar case:
"Follow-up for this case - different node bad alert"

Agent remembers the last response ✓ Better draft this time!
```

## 🐛 Troubleshooting

**"Can't read case page"**
- Make sure you're on a Salesforce case detail page
- Refresh the page
- Try another case

**"No similar cases found"**
- You need to approve 2+ responses first
- Give it examples to learn from

**"Response doesn't look right"**
- Agent gets better with examples
- Approve good responses
- Each approval helps next time

## ❓ FAQ

**Q: Do I need an API key?**  
A: No! Everything runs offline on your computer.

**Q: How much data can I store?**  
A: Usually 100MB+, enough for 1000+ responses.

**Q: Can I export my responses?**  
A: Yes! Settings → Export. Download as JSON.

**Q: Will the agent improve over time?**  
A: Yes! Each approved response teaches it.

**Q: Can I delete my learning data?**  
A: Yes, anytime in Settings → Clear All Data.

**Q: Does it work in Firefox/Edge?**  
A: Yes, full support for Manifest v3 browsers.

## 🚀 Next Steps

1. ✅ Install extension
2. ✅ Go to Salesforce case
3. ✅ Click extension icon
4. ✅ Load case details
5. ✅ Generate first response
6. ✅ Approve to teach agent
7. ✅ Repeat for more cases (agent learns!)

---

**You're all set!** 🎉 Start drafting responses now.

For detailed docs, see `extension/README.md`
