# Enhanced Context Memory Architecture

## Overview

Nova now features a **comprehensive 5-layer memory system** that provides:
- ✅ **Zero data loss** - All messages permanently archived
- ✅ **Full audit trail** - Complete provenance for every fact
- ✅ **Rich extraction** - Deep AI analysis on every message
- ✅ **Multi-layer context** - From raw messages to compiled digests
- ✅ **Automated jobs** - Daily digest compilation at 3 AM
- ✅ **Fast queries** - Tiered context retrieval optimized for performance

**Philosophy**: Data quality first. Cost optimization later.

---

## Architecture Layers

### Layer 1: Raw Messages (Permanent Archive)
**Table**: `conversation_messages`

All WhatsApp messages stored forever with comprehensive extraction:
- **Core data**: message text, sender, timestamp, chat info
- **Rich extraction**: projects, people, numbers, dates, decisions, questions, action items
- **Context**: sentiment, intent, conversation phase
- **Metadata**: WhatsApp message ID, session linkage

**Never expires. Never deleted.**

```sql
SELECT * FROM conversation_messages
WHERE project_context = 'Manado'
AND timestamp >= NOW() - INTERVAL '2 hours'
ORDER BY timestamp DESC
LIMIT 50;
```

### Layer 2: Conversation Sessions (Natural Boundaries)
**Table**: `conversation_sessions`

Compiled after 10 minutes of idle time:
- **Session summary**: AI-generated 2-3 sentence summary
- **Structured extraction**: decisions, updates, questions, action items, blockers
- **Numbers discussed**: Financial figures with context
- **People involved**: Participants in conversation
- **Links**: References to source messages

```sql
SELECT * FROM conversation_sessions
WHERE primary_project = 'Manado'
AND session_start >= NOW() - INTERVAL '7 days'
ORDER BY session_end DESC;
```

### Layer 3: Daily Digests (Rollup Summaries)
**Table**: `conversation_daily_digests`

Compiled at 3 AM every day:
- **Per-project summaries**: Key updates, decisions, blockers for each project
- **Global insights**: Cross-project patterns and priorities
- **Productivity metrics**: Productivity score (1-10), issues detected
- **Action items**: Pending todos across all projects

```sql
SELECT * FROM conversation_daily_digests
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date DESC;
```

### Layer 4: Project Facts (Structured Knowledge)
**Table**: `project_facts`

Atomic facts extracted from messages/sessions:
- **Fact types**: decision, cost, date, person, status, technical, legal
- **Full provenance**: Links to source message AND session
- **Confidence scores**: AI confidence + human validation
- **Fact lifecycle**: Active/superseded tracking

```sql
SELECT * FROM project_facts
WHERE project_name = 'Manado'
AND active = true
AND superseded_by IS NULL
ORDER BY created_at DESC;
```

### Layer 5: Project State (Current Truth)
**Table**: `projects`

Single source of truth for each project's current state.
(Uses existing MVP schema from `04-mvp-reset.sql`)

---

## Data Flow

```
WhatsApp Message
    ↓
[1] Comprehensive Extraction (AI + Pattern Matching)
    ├─ Projects, People, Numbers, Dates
    ├─ Decisions, Questions, Action Items
    ├─ Sentiment, Intent, Context
    └─ Facts for knowledge base
    ↓
[2] Save to conversation_messages (Layer 1)
    ├─ All extracted data stored
    └─ Facts saved to project_facts (Layer 4)
    ↓
[3] After 10 min idle → Compile Session (Layer 2)
    ├─ AI generates session summary
    ├─ Extract structured data
    ├─ Link messages to session
    └─ Extract session-level facts
    ↓
[4] At 3 AM → Compile Daily Digest (Layer 3)
    ├─ Roll up all sessions from yesterday
    ├─ Generate per-project summaries
    ├─ Extract global insights
    └─ Calculate productivity metrics
    ↓
[5] Update Project State (Layer 5)
    └─ Current truth derived from facts
```

---

## Key Components

### 1. Comprehensive Extractor
**File**: `src/memory/comprehensiveExtractor.js`

Hybrid extraction system:
- **Pattern-based** (fast, free, deterministic): Keyword matching for common entities
- **AI-based** (deep, comprehensive): GPT-4 analysis for complex extraction
- **Merged results**: Best of both approaches

```javascript
const extractor = new ComprehensiveExtractor(openaiClient);
const extracted = await extractor.extract(whatsappMessage);

// Returns:
{
  projects_mentioned: ['Manado', 'Palembang'],
  people_mentioned: ['Eka', 'Ilalang Design'],
  numbers_extracted: [{type: 'amount', value: 21000000, context: 'DP', currency: 'IDR'}],
  dates_extracted: [{type: 'target', value: '2026-03-31', context: 'opening'}],
  decisions_detected: ['Go with Ilalang Design as architect'],
  questions_asked: ['When is the meeting?'],
  action_items_detected: ['Call architect tomorrow'],
  sentiment: 'positive',
  intent: 'update',
  context_type: 'pre_opening',
  project_context: 'Manado',
  confidence: 0.9,
  facts: [{fact_text: 'Architect fee is 30 million', fact_type: 'cost', confidence: 0.9}]
}
```

### 2. Enhanced Memory Manager
**File**: `src/memory/enhancedMemory.js`

Main memory interface:
- **saveMessage()**: Save with comprehensive extraction
- **getRecentMessages()**: Layer 1 queries
- **getRecentSessions()**: Layer 2 queries
- **getProjectFacts()**: Layer 4 queries
- **getContextForQuery()**: Tiered context retrieval
- **compileSession()**: Session compilation after idle

```javascript
const memory = new EnhancedMemory(supabaseClient, openaiClient);

// Save message
const result = await memory.saveMessage(whatsappMessage, chatName);

// Get context for query
const context = await memory.getContextForQuery(
  'Status Manado',
  'Manado',  // projectName
  chatId
);

// Returns:
{
  recentMessages: [...],    // Last 2 hours
  recentSessions: [...],    // Last 7 days
  projectFacts: [...],      // All active facts
  contextNeeds: {...}       // Query analysis
}
```

### 3. Daily Digest Compiler
**File**: `src/memory/dailyDigestCompiler.js`

3 AM compilation job:
- **compileDaily()**: Main compilation method
- **compileProjectSummary()**: Per-project AI analysis
- **compileGlobalInsights()**: Cross-project patterns
- **calculateMetrics()**: Productivity scoring

```javascript
const compiler = new DailyDigestCompiler(supabaseClient, openaiClient);

// Runs at 3 AM
const digest = await compiler.compileDaily();

// Manual compilation
const digest = await compiler.compileDaily();

// Get specific date
const digest = await compiler.getDigest('2025-11-05');
```

### 4. Scheduler
**File**: `src/scheduler.js`

Automated background jobs:
- **3:00 AM**: Daily digest compilation
- **Every hour**: Check and compile idle sessions
- **Optional**: Morning digest WhatsApp message (9 AM)

```javascript
const scheduler = new Scheduler(supabaseClient, openaiClient, whatsappClient);

scheduler.start();  // Start all jobs

scheduler.getStatus();  // Check job status
// Returns: {running: true, jobs: [{name: 'daily_digest', running: true}, ...]}

scheduler.stop();  // Stop all jobs
```

---

## Deployment

### 1. Run Database Migration

**IMPORTANT**: This will drop and recreate conversation tables. Backup if needed.

```bash
# SSH to production server
ssh root@157.245.206.68

# Navigate to project
cd apex-assistant

# Run migration
psql -h <SUPABASE_HOST> -U postgres -d postgres < database/05-enhanced-context-memory.sql

# Verify tables created
psql -h <SUPABASE_HOST> -U postgres -d postgres -c "\dt"
```

Expected tables:
- `conversation_messages` ✅
- `conversation_sessions` ✅
- `conversation_daily_digests` ✅
- `project_facts` ✅
- `projects` ✅ (existing)

### 2. Deploy Code

```bash
# SSH to production
ssh root@157.245.206.68

# Pull latest code
cd apex-assistant
git pull origin main

# Install dependencies (node-cron already in package.json)
npm install

# Restart with PM2
pm2 restart apex-assistant

# Check logs
pm2 logs apex-assistant --lines 100
```

Expected log output:
```
✅ APEX Assistant is running!
📱 WhatsApp: Connected
🤖 OpenAI: Ready
🧠 Enhanced Memory: Ready
📊 Session Summarizer: Running
🕐 Scheduler: Running (3 AM digest, hourly session check)
```

### 3. Verify Scheduler

```bash
# Check scheduler status via PM2 logs
pm2 logs apex-assistant | grep "Scheduler"

# Expected:
# 🕐 Starting scheduler...
# ✅ Scheduler started with 2 jobs: daily_digest, session_check
```

---

## Query Examples

### Get Recent Context for Status Query

```javascript
// User asks: "Status Manado"
const context = await memory.getContextForQuery('Status Manado', 'Manado', chatId);

// Context includes:
// - recentMessages: Last 2 hours of messages
// - recentSessions: Last 7 days of sessions
// - projectFacts: All active facts about Manado
```

### Find Who Said What (Audit Trail)

```sql
-- Find who mentioned 21jt DP
SELECT
  m.sender,
  m.message_text,
  m.timestamp,
  m.numbers_extracted
FROM conversation_messages m
WHERE m.project_context = 'Manado'
AND m.numbers_extracted @> '[{"value": 21000000}]'::jsonb
ORDER BY m.timestamp DESC;
```

### Track Decision History

```sql
-- All decisions about Manado
SELECT
  f.fact_text,
  f.stated_by,
  f.stated_at,
  m.message_text AS source_message
FROM project_facts f
LEFT JOIN conversation_messages m ON f.source_message_id = m.id
WHERE f.project_name = 'Manado'
AND f.fact_type = 'decision'
AND f.active = true
ORDER BY f.stated_at DESC;
```

### Get Daily Productivity Report

```sql
-- Yesterday's productivity
SELECT
  date,
  total_sessions,
  total_messages,
  productivity_score,
  daily_summary,
  active_projects
FROM conversation_daily_digests
WHERE date = CURRENT_DATE - 1;
```

---

## Cost Analysis

### Current Implementation (MVP)

```
Classification: 100 msg × $0.01 = $1/day
Keyword parsing: FREE
AI fallback: 5 msg × $0.07 = $0.35/day
Session compilation: $0.30/day

Total: ~$1.65/day = $50/month
```

### Enhanced Implementation (Data Quality First)

```
Classification: 100 msg × $0.01 = $1/day
Comprehensive extraction: 100 msg × $0.02 = $2/day (hybrid approach)
Session compilation: 10 sessions × $0.05 = $0.50/day
Daily digest: 1 × $0.50 = $0.50/day

Total: ~$4/day = $120/month
```

**Increase: $70/month for complete data quality and zero data loss.**

---

## Performance Considerations

### Query Performance

All queries use indexed lookups:
- Timestamp range queries: `idx_messages_timestamp`
- Project queries: `idx_messages_project`, `idx_facts_project`
- Chat queries: `idx_messages_chat`
- Session queries: `idx_sessions_project`, `idx_sessions_end`

**Expected query times**:
- Recent messages (2h): <50ms
- Recent sessions (7d): <100ms
- Project facts (all): <200ms
- Daily digest (1 day): <50ms

### Storage Growth

```
Daily storage (100 messages):
- conversation_messages: ~20 KB
- conversation_sessions: ~5 KB
- conversation_daily_digests: ~2 KB
- project_facts: ~5 KB

Total: ~32 KB/day = ~12 MB/year
```

**Storage is NOT a concern.** Even after 10 years: 120 MB.

---

## Troubleshooting

### Scheduler Not Running

```bash
# Check logs
pm2 logs apex-assistant | grep "Scheduler"

# Should see:
# ✅ Scheduler started with 2 jobs

# If not, restart
pm2 restart apex-assistant
```

### Daily Digest Not Compiling

```bash
# Check cron job ran
pm2 logs apex-assistant | grep "3 AM"

# Manually trigger compilation
psql -h <SUPABASE_HOST> -U postgres -d postgres
# Then in SQL:
SELECT * FROM conversation_sessions WHERE session_start >= CURRENT_DATE - 1;
```

### Extraction Failing

```bash
# Check OpenAI API key
echo $OPENAI_API_KEY

# Check logs for extraction errors
pm2 logs apex-assistant | grep "extraction"

# Common issues:
# - Rate limit: Wait 1 minute, retry
# - Invalid JSON: Check AI response format
# - Timeout: Increase timeout in openaiClient
```

### Session Not Compiling

```bash
# Check for unprocessed messages
psql> SELECT chat_id, COUNT(*)
      FROM conversation_messages
      WHERE processed = false
      GROUP BY chat_id;

# Manually trigger compilation
# (Will auto-compile after 10 min idle)
```

---

## Migration Checklist

- [ ] **Backup existing data** (if any old conversation_history exists)
- [ ] **Run database migration** (`05-enhanced-context-memory.sql`)
- [ ] **Verify tables created** (`\dt` in psql)
- [ ] **Deploy new code** (`git pull && npm install`)
- [ ] **Restart PM2** (`pm2 restart apex-assistant`)
- [ ] **Verify scheduler started** (check logs for "Scheduler started")
- [ ] **Send test message** via WhatsApp
- [ ] **Verify extraction** (check `conversation_messages` table)
- [ ] **Wait 10 minutes** (let session compile)
- [ ] **Verify session compiled** (check `conversation_sessions` table)
- [ ] **Wait until next day 3 AM** (or manually trigger digest)
- [ ] **Verify daily digest** (check `conversation_daily_digests` table)

---

## Future Enhancements

### Phase 2: Query Optimization
- Smart context caching
- Incremental fact updates
- Parallel query execution

### Phase 3: Advanced Features
- Weekly/monthly digest rollups
- Trend analysis and forecasting
- Anomaly detection
- Smart reminders based on facts

### Phase 4: UI Dashboard
- Web interface for facts browsing
- Visual timeline of project history
- Interactive digest viewer
- Fact validation interface

---

## Architecture Benefits

### ✅ Zero Data Loss
Every message permanently archived with full context.

### ✅ Complete Audit Trail
"Who said what when" - full provenance for every fact.

### ✅ Natural Conversation Flow
10-minute idle session detection vs arbitrary cutoffs.

### ✅ Progressive Detail
Recent = detailed, old = summarized. Optimal context size.

### ✅ Failure Resilient
If compilation fails, raw data still exists. No catastrophic loss.

### ✅ Cost Effective
Hybrid extraction (pattern + AI) minimizes unnecessary API calls.

### ✅ Performance Optimized
Tiered queries with proper indexing. Fast even with millions of messages.

---

**Last Updated**: 2025-11-05
**Version**: 1.0.0
**Author**: APEX Team + Claude Code
