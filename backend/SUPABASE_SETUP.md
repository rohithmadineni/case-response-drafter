# Phase 2: Supabase Setup Guide

## Overview

This guide sets up a Supabase backend for storing approved drafts and enabling semantic search.

**What you'll get:**
- PostgreSQL database with pgvector extension
- REST API for storing/retrieving drafts
- Semantic search capability
- Sync between browser extension and cloud

---

## Step 1: Create Supabase Project

### 1.1 Sign Up
1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub or email
4. Verify email

### 1.2 Create Project
1. Click "New Project"
2. **Name:** `case-response-drafter`
3. **Database Password:** Generate strong password (save it!)
4. **Region:** Choose closest to you (us-east-1 recommended)
5. Click "Create new project"
6. Wait 2-3 minutes for provisioning

### 1.3 Get Connection Details
Once created, go to **Settings → Database → Connection info**:
- Note: `Project URL` (something like `https://xxxxx.supabase.co`)
- Note: `Anon Public Key` (starts with `eyJ...`)
- Note: `Service Role Key` (keep secret!)

---

## Step 2: Enable pgvector Extension

### 2.1 In Supabase Dashboard
1. Go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Paste this SQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

4. Click **"Run"**
5. Confirm: `Success. No rows returned.`

---

## Step 3: Create Tables

### 3.1 Approved Drafts Table

In SQL Editor, run:

```sql
CREATE TABLE approved_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL UNIQUE,
  draft_text TEXT NOT NULL,
  response_type TEXT NOT NULL,
  
  -- Case metadata
  subject TEXT,
  account_name TEXT,
  description TEXT,
  status TEXT,
  
  -- Summary data
  alert_type TEXT,
  node_id TEXT,
  customer_comments INT,
  rubrik_comments INT,
  
  -- Vector embedding (for semantic search)
  embedding vector(1536),
  
  -- Tracking
  approved_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for semantic search
CREATE INDEX ON approved_drafts USING ivfflat (embedding vector_cosine_ops);

-- Index for lookups
CREATE INDEX ON approved_drafts(case_number);
CREATE INDEX ON approved_drafts(alert_type);
CREATE INDEX ON approved_drafts(response_type);
```

### 3.2 User Edits Table (Track what users change)

```sql
CREATE TABLE draft_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES approved_drafts(id),
  
  -- What was changed
  original_text TEXT,
  edited_text TEXT,
  section_changed TEXT, -- e.g., "greeting", "closing", "findings"
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON draft_edits(draft_id);
```

### 3.3 IQS Scores Table (Track validation results)

```sql
CREATE TABLE iqs_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES approved_drafts(id),
  
  -- IQS check results
  checks_passed INT,
  checks_total INT,
  failed_checks TEXT[], -- array of check names that failed
  
  -- Metadata
  response_type TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON iqs_scores(draft_id);
```

### 3.4 Analytics Table (Track effectiveness)

```sql
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was tracked
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  
  -- Context
  response_type TEXT,
  alert_type TEXT,
  customer_name TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON analytics(metric_name);
CREATE INDEX ON analytics(response_type);
```

---

## Step 4: Set Up Row Level Security (RLS)

RLS controls who can access what data. For MVP, we'll allow public read/write (tighten later):

```sql
-- Approved drafts: public can read, authenticated can write
ALTER TABLE approved_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read approved drafts" ON approved_drafts
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert drafts" ON approved_drafts
  FOR INSERT WITH CHECK (true);

-- Similar for other tables
ALTER TABLE draft_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE iqs_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read" ON draft_edits FOR SELECT USING (true);
CREATE POLICY "Public can read" ON iqs_scores FOR SELECT USING (true);
CREATE POLICY "Public can insert" ON iqs_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can read" ON analytics FOR SELECT USING (true);
CREATE POLICY "Public can insert" ON analytics FOR INSERT WITH CHECK (true);
```

---

## Step 5: Create API Functions

These are stored procedures that the extension will call.

### 5.1 Function to Store Approved Draft + Embedding

```sql
CREATE OR REPLACE FUNCTION store_approved_draft(
  p_case_number TEXT,
  p_draft_text TEXT,
  p_response_type TEXT,
  p_subject TEXT,
  p_account_name TEXT,
  p_description TEXT,
  p_status TEXT,
  p_alert_type TEXT,
  p_node_id TEXT,
  p_customer_comments INT,
  p_rubrik_comments INT,
  p_embedding vector
)
RETURNS TABLE(id UUID, case_number TEXT) AS $$
BEGIN
  INSERT INTO approved_drafts (
    case_number, draft_text, response_type, subject, account_name,
    description, status, alert_type, node_id, customer_comments,
    rubrik_comments, embedding
  ) VALUES (
    p_case_number, p_draft_text, p_response_type, p_subject, p_account_name,
    p_description, p_status, p_alert_type, p_node_id, p_customer_comments,
    p_rubrik_comments, p_embedding
  )
  ON CONFLICT (case_number) DO UPDATE SET
    draft_text = p_draft_text,
    response_type = p_response_type,
    updated_at = NOW(),
    embedding = p_embedding
  RETURNING approved_drafts.id, approved_drafts.case_number;
END;
$$ LANGUAGE plpgsql;
```

### 5.2 Function to Find Similar Cases

```sql
CREATE OR REPLACE FUNCTION find_similar_drafts(
  p_embedding vector,
  p_limit INT DEFAULT 3,
  p_response_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  case_number TEXT,
  response_type TEXT,
  similarity FLOAT,
  draft_text TEXT,
  alert_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ad.case_number,
    ad.response_type,
    (ad.embedding <=> p_embedding)::FLOAT as similarity,
    ad.draft_text,
    ad.alert_type
  FROM approved_drafts ad
  WHERE p_response_type IS NULL OR ad.response_type = p_response_type
  ORDER BY ad.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

### 5.3 Function to Get Stats

```sql
CREATE OR REPLACE FUNCTION get_stats()
RETURNS TABLE(
  total_drafts INT,
  alert_types_count INT,
  avg_response_types INT,
  total_edits INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT as total_drafts,
    COUNT(DISTINCT alert_type)::INT as alert_types_count,
    COUNT(DISTINCT response_type)::INT as avg_response_types,
    (SELECT COUNT(*)::INT FROM draft_edits) as total_edits;
END;
$$ LANGUAGE plpgsql;
```

---

## Step 6: Create API Keys

### 6.1 Get Keys
1. Go to **Settings → API**
2. You'll see:
   - **Project URL** (the API endpoint)
   - **Anon Public Key** (for client-side calls)
   - **Service Role Key** (for server-side, keep secret)

### 6.2 Create Environment File

Create `.env.local` in the extension folder:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

(Never commit this file!)

---

## Step 7: Test Connection

### 7.1 In Supabase Dashboard
Go to **SQL Editor** and run:

```sql
SELECT * FROM approved_drafts LIMIT 1;
```

Should return empty result (no data yet).

### 7.2 Via REST API (curl)

```bash
curl -X GET \
  'https://xxxxx.supabase.co/rest/v1/approved_drafts?limit=1' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

Should return empty array `[]`.

---

## Step 8: Summary

You now have:
- ✅ PostgreSQL database with pgvector
- ✅ Tables for drafts, edits, IQS scores, analytics
- ✅ Functions for storing and searching
- ✅ REST API ready for extension to call
- ✅ Row-level security configured

**Next:** Extension will call these endpoints to:
1. Store approved drafts
2. Find similar cases
3. Use similar cases in Claude prompts

---

## Costs

| Tier | Storage | Cost |
|------|---------|------|
| Free | 500MB | $0 |
| Pro | 8GB | $25/month |

**For 100 drafts (~1MB):** Free tier is plenty.

---

## Troubleshooting

**"pgvector not found"**
- Make sure you ran the `CREATE EXTENSION` SQL in Step 2

**"RLS policy violation"**
- Check the policies are created correctly
- For MVP, you can temporarily disable RLS: `ALTER TABLE approved_drafts DISABLE ROW LEVEL SECURITY;`

**"Connection refused"**
- Verify Project URL is correct
- Check Anon Key is correct
- Make sure IP is not blocked (Supabase allows all by default)

---

## Next

Once Supabase is set up, we'll build:
1. Extension sync layer (upload approved drafts)
2. Semantic search (find similar cases)
3. Claude API integration (use similar cases in prompts)
