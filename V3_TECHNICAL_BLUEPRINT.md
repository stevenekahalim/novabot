# APEX Assistant V3 - Complete Technical Blueprint

**Version:** 1.0.0 (V3 - Pure Conversational Architecture)
**Last Updated:** 2025-11-05
**Purpose:** Definitive technical reference for all future development and AI assistance

---

## Table of Contents

1. [Architecture Philosophy](#architecture-philosophy)
2. [Tech Stack](#tech-stack)
3. [System Components](#system-components)
4. [Data Flow](#data-flow)
5. [Supabase Schema](#supabase-schema)
6. [AI Integration](#ai-integration)
7. [Context Loading Strategy](#context-loading-strategy)
8. [Background Jobs](#background-jobs)
9. [File Structure](#file-structure)
10. [Message Processing Lifecycle](#message-processing-lifecycle)
11. [Rules & Constraints](#rules--constraints)
12. [Configuration](#configuration)
13. [Monitoring & Logging](#monitoring--logging)
14. [Error Handling](#error-handling)
15. [Performance Optimization](#performance-optimization)
16. [Future Extensions](#future-extensions)

---

## Architecture Philosophy

### Core Principle: Pure Conversational Memory

V3 is built on the philosophy of **storing everything verbatim** and letting AI infer context naturally, rather than attempting structured extraction.

**Key Tenets:**

1. **Store Raw, Infer Smart**
   - Save all messages exactly as received
   - No forced structure or extraction
   - Let AI interpret context from raw conversation

2. **Layered Memory**
   - **Immediate:** Recent messages (short-term memory)
   - **Hourly:** Hourly summaries (medium-term memory)
   - **Daily:** Daily digests (long-term memory)

3. **Adaptive AI**
   - Minimal personality constraints
   - Let AI adapt to conversation naturally
   - Trust AI training rather than rigid rules

4. **Zero Legacy Coupling**
   - No dependencies on V1/V2 code
   - No V1/V2 database tables
   - Fresh start architecture

---

## Tech Stack

### Core Technologies

```
Node.js v18+
├── whatsapp-web.js         # WhatsApp client
├── @supabase/supabase-js   # Database client
├── openai                  # AI integration
├── express                 # Health check server
├── node-cron              # Background job scheduler
└── winston                # Logging
```

### Infrastructure

```
Deployment:
├── DigitalOcean Droplet (Ubuntu)
├── PM2 (Process Manager)
└── Node.js v18+

Database:
└── Supabase (PostgreSQL)

AI:
└── OpenAI (GPT-4o-mini, GPT-4o, GPT-4-turbo)

Messaging:
└── WhatsApp via whatsapp-web.js
```

### Environment

```bash
Node.js: v18+
OS: Ubuntu (DigitalOcean)
Process Manager: PM2
Database: Supabase (Postgres 15)
AI: OpenAI API
```

---

## System Components

### 1. Main Entry Point (`src/index.js`)

**Purpose:** Bootstrap and orchestrate all V3 components

**Responsibilities:**
- Initialize WhatsApp client
- Initialize OpenAI client
- Initialize Supabase client
- Initialize V3 message handler
- Start V3 background jobs
- Setup health check server
- Handle graceful shutdown

**Key Code Flow:**
```javascript
1. Load environment variables
2. Validate required env vars
3. Start health server (Express on port 3000)
4. Initialize OpenAI client
5. Initialize WhatsApp client
6. Initialize Supabase client
7. Initialize V3 system (initializeV3)
8. Setup WhatsApp message listener
9. Start V3 background jobs
10. Setup graceful shutdown handlers
```

**Health Endpoints:**
- `GET /` - Status dashboard
- `GET /health` - JSON health check
- `GET /qr` - QR code for WhatsApp auth

---

### 2. V3 Module (`src/v3/`)

#### 2.1 Entry Point (`src/v3/index.js`)

**Purpose:** V3 system initialization and orchestration

**Exports:**
```javascript
{
  handleMessage,   // Process incoming WhatsApp messages
  startJobs,       // Start hourly/daily jobs
  stopJobs         // Stop background jobs
}
```

**Initialization Flow:**
```javascript
1. Receive SupabaseClient instance
2. Initialize ContextLoader (loads conversation context)
3. Initialize ResponseGenerator (generates AI responses)
4. Initialize MessageHandler (processes messages)
5. Initialize HourlyNotesJob (hourly summaries)
6. Initialize DailyDigestJob (daily summaries)
7. Return interface object
```

#### 2.2 Message Handler (`src/v3/messageHandler.js`)

**Purpose:** Process incoming WhatsApp messages

**Flow:**
```
Incoming Message
    ↓
1. Extract metadata (sender, chat, text, timestamp)
    ↓
2. Save to messages_v3 table
    ↓
3. Check if Nova should respond
   - Is this a DM? (private chat)
   - Is Nova @mentioned? (group chat)
    ↓
4. If yes, load full context
   - Recent messages (all, no limit)
   - Hourly notes (last 24h)
   - Daily digests (last 30 days)
    ↓
5. Generate AI response using full context
    ↓
6. Return {shouldReply: bool, response: string}
```

**Key Methods:**
```javascript
async handleMessage(whatsappMessage, chatContext)
  ↓ Orchestrates full message processing flow

async _saveMessage(messageData)
  ↓ Saves to messages_v3 table

async _shouldRespond(messageText, chatContext, senderInfo)
  ↓ Determines if Nova should reply

async _generateResponse(messageText, context, senderInfo)
  ↓ Generates AI response using context
```

#### 2.3 Context Loader (`src/v3/contextLoader.js`)

**Purpose:** Load conversational context from database

**Architecture:**
```
Three-Layer Memory System:

Layer 1: Recent Messages (Short-term)
├── Table: messages_v3
├── Scope: ALL messages in chat (no time/count limit by default)
├── Order: Chronological (oldest → newest)
└── Use: Immediate conversation context

Layer 2: Hourly Notes (Medium-term)
├── Table: hourly_notes
├── Scope: Last 24 hours
├── Order: Reverse chronological (newest → oldest)
└── Use: Recent activity summaries

Layer 3: Daily Digests (Long-term)
├── Table: daily_digests_v3
├── Scope: Last 30 days
├── Order: Reverse chronological (newest → oldest)
└── Use: Historical context
```

**Key Methods:**
```javascript
async loadFullContext(chatId, options)
  ↓ Loads all three layers in parallel

  Returns:
  {
    chatId: string,
    loadedAt: ISO timestamp,
    messages: {
      data: Message[],
      count: number,
      daysBack: number | null
    },
    hourlyNotes: {
      data: HourlyNote[],
      count: number,
      hoursBack: number
    },
    dailyDigests: {
      data: DailyDigest[],
      count: number,
      daysBack: number
    }
  }
```

**Context Loading Options:**
```javascript
{
  messageDaysBack: null,    // null = ALL messages
  messageLimit: null,        // null = no limit
  digestDaysBack: 30,       // 30 days of digests
  hourlyNotesHoursBack: 24  // 24 hours of notes
}
```

#### 2.4 Response Generator (`src/v3/responseGenerator.js`)

**Purpose:** Generate AI responses using OpenAI

**Smart Model Selection:**
```javascript
Context Size → Model Selection:
  < 50 messages    → gpt-4o-mini    (fastest, cheapest)
  50-200 messages  → gpt-4o         (balanced)
  > 200 messages   → gpt-4-turbo    (most capable)
```

**OpenAI Request Structure:**
```javascript
[
  {
    role: 'system',
    content: NOVA_PROMPT  // Personality from src/prompts/response.js
  },
  {
    role: 'system',
    content: '# HISTORICAL CONTEXT (Last 30 days)\n\n' + dailyDigests
  },
  {
    role: 'system',
    content: '# RECENT HOURLY SUMMARIES (Last 24 hours)\n\n' + hourlyNotes
  },
  {
    role: 'system',
    content: '# CURRENT CONVERSATION\n\n' + recentMessages
  },
  {
    role: 'user',
    content: 'Steven: [actual user message]'
  }
]
```

**Token Monitoring:**
```javascript
For every request, log:
- Model selected
- Context size (message count)
- Input tokens used
- Output tokens used
- Total tokens
- Duration (ms)
- Estimated cost ($)
```

**Model Pricing (per 1K tokens):**
```javascript
gpt-4o-mini:  input $0.00015, output $0.0006
gpt-4o:       input $0.0025,  output $0.01
gpt-4-turbo:  input $0.01,    output $0.03
```

#### 2.5 Mention Detector (`src/v3/mentionDetector.js`)

**Purpose:** Detect @Nova mentions in messages

**Detection Logic:**
```javascript
Check if message contains:
1. '@Nova' (case-insensitive)
2. '@nova' (case-insensitive)
3. 'nova' at start of message (case-insensitive)

Examples that trigger:
- "@Nova, update Manado"
- "nova recap last 7 days"
- "Hey @nova what's up"

Examples that don't:
- "renovation project"
- "supernova event"
```

#### 2.6 Hourly Notes Job (`src/v3/hourlyNotesJob.js`)

**Purpose:** Generate hourly conversation summaries

**Schedule:** Every hour at :00 (cron: `0 * * * *`)

**Process Flow:**
```
1. Trigger at XX:00
    ↓
2. Get all active chats from messages_v3
    ↓
3. For each chat:
    ↓
4. Load messages from last hour
    ↓
5. If messages exist:
    ↓
6. Send to OpenAI for summarization
   Prompt: "Summarize this hour's conversation"
    ↓
7. Save to hourly_notes table:
   - hour_timestamp
   - summary_text
   - key_decisions (array)
   - action_items (array)
   - message_count
   - participants (array)
    ↓
8. Log result
```

**OpenAI Summarization:**
```javascript
Model: gpt-4o-mini (cheap, fast)
Max tokens: 500
Temperature: 0.3 (focused)

Prompt Structure:
"Summarize the following hour of conversation.
Identify:
1. Main topics discussed
2. Key decisions made
3. Action items
4. Participants

Conversation:
[messages from last hour]
"
```

#### 2.7 Daily Digest Job (`src/v3/dailyDigestJob.js`)

**Purpose:** Generate daily conversation summaries

**Schedule:** Every day at 00:00 Jakarta time (cron: `0 0 * * *`)

**Process Flow:**
```
1. Trigger at 00:00 Asia/Jakarta
    ↓
2. Get all active chats from messages_v3
    ↓
3. For each chat:
    ↓
4. Load messages from last 24 hours
    ↓
5. If messages exist:
    ↓
6. Send to OpenAI for daily summarization
   Prompt: "Create daily digest"
    ↓
7. Save to daily_digests_v3 table:
   - digest_date
   - summary_text
   - projects_discussed (array)
   - key_decisions (array)
   - blockers_identified (array)
   - financial_mentions (array)
   - message_count
   - participants (array)
    ↓
8. Log result
```

**OpenAI Digest Generation:**
```javascript
Model: gpt-4o (balanced quality/cost)
Max tokens: 1000
Temperature: 0.3

Prompt Structure:
"Create a daily digest of this conversation.
Extract:
1. Projects discussed
2. Key decisions made
3. Blockers or issues
4. Financial mentions
5. Overall summary

Conversation from last 24 hours:
[all messages from yesterday]
"
```

---

## Data Flow

### Complete Message Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER SENDS WHATSAPP MESSAGE                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. WhatsApp Client (whatsapp-web.js)                        │
│    - Receives message via 'message_create' event            │
│    - Extracts: text, sender, chat, timestamp                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. V3 Message Handler                                        │
│    src/v3/messageHandler.js:handleMessage()                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. SAVE TO DATABASE                                          │
│    INSERT INTO messages_v3                                   │
│    - id (UUID)                                               │
│    - chat_id (WhatsApp chat ID)                             │
│    - message_text (verbatim)                                │
│    - sender_name, sender_number                             │
│    - timestamp                                               │
│    - mentioned_nova (boolean)                               │
│    - is_reply, has_media                                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. CHECK IF NOVA SHOULD RESPOND                             │
│    - Is DM (private chat)?        → YES, respond            │
│    - Is @Nova mentioned?          → YES, respond            │
│    - Is group without mention?    → NO, skip                │
└─────────────────────────────────────────────────────────────┘
                           ↓ (if should respond)
┌─────────────────────────────────────────────────────────────┐
│ 6. LOAD FULL CONTEXT                                         │
│    src/v3/contextLoader.js:loadFullContext()                │
│                                                              │
│    Parallel loads:                                           │
│    ┌─────────────────────────────────────────────┐         │
│    │ A. Recent Messages (messages_v3)            │         │
│    │    - ALL messages in chat (no limit)        │         │
│    │    - Ordered chronologically                │         │
│    └─────────────────────────────────────────────┘         │
│    ┌─────────────────────────────────────────────┐         │
│    │ B. Hourly Notes (hourly_notes)              │         │
│    │    - Last 24 hours                          │         │
│    │    - Summaries of recent activity           │         │
│    └─────────────────────────────────────────────┘         │
│    ┌─────────────────────────────────────────────┐         │
│    │ C. Daily Digests (daily_digests_v3)         │         │
│    │    - Last 30 days                           │         │
│    │    - Long-term memory                       │         │
│    └─────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. BUILD AI PROMPT                                           │
│    src/v3/responseGenerator.js:_buildChatMessages()         │
│                                                              │
│    OpenAI Messages Array:                                    │
│    [                                                         │
│      {role: 'system', content: NOVA_PROMPT},                │
│      {role: 'system', content: DAILY_DIGESTS},              │
│      {role: 'system', content: HOURLY_NOTES},               │
│      {role: 'system', content: RECENT_MESSAGES},            │
│      {role: 'user', content: "Steven: [message]"}           │
│    ]                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. SELECT GPT MODEL                                          │
│    Based on context size:                                    │
│    < 50 msgs   → gpt-4o-mini                                │
│    50-200 msgs → gpt-4o                                     │
│    > 200 msgs  → gpt-4-turbo                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. CALL OPENAI API                                           │
│    POST https://api.openai.com/v1/chat/completions         │
│    {                                                         │
│      model: "gpt-4o-mini",                                  │
│      messages: [...],                                        │
│      max_tokens: 300,                                        │
│      temperature: 0.7                                        │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. RECEIVE AI RESPONSE                                      │
│     Extract:                                                 │
│     - response text                                          │
│     - token usage (input, output, total)                    │
│     - Calculate cost                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. LOG TOKEN USAGE                                          │
│     [Token Monitor] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
│     Model: gpt-4o-mini                                      │
│     Context: 5 messages                                      │
│     Input tokens: 320                                        │
│     Output tokens: 45                                        │
│     Total tokens: 365                                        │
│     Duration: 1850ms                                         │
│     Estimated cost: $0.000075                               │
│     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 12. SEND WHATSAPP REPLY                                      │
│     message.reply(response)                                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 13. USER RECEIVES NOVA'S REPLY                              │
└─────────────────────────────────────────────────────────────┘
```

### Background Job Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ HOURLY JOB (Every hour at :00)                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
         1. Query messages_v3 (last hour)
                           ↓
         2. Group by chat_id
                           ↓
         3. For each chat with messages:
                           ↓
            ┌──────────────────────────┐
            │ Send to OpenAI           │
            │ "Summarize last hour"    │
            └──────────────────────────┘
                           ↓
            ┌──────────────────────────┐
            │ INSERT hourly_notes      │
            │ - summary_text           │
            │ - key_decisions          │
            │ - action_items           │
            │ - participants           │
            └──────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ DAILY JOB (Every day at 00:00 Jakarta time)                │
└─────────────────────────────────────────────────────────────┘
                           ↓
         1. Query messages_v3 (last 24 hours)
                           ↓
         2. Group by chat_id
                           ↓
         3. For each chat with messages:
                           ↓
            ┌──────────────────────────────┐
            │ Send to OpenAI               │
            │ "Create daily digest"        │
            └──────────────────────────────┘
                           ↓
            ┌──────────────────────────────┐
            │ INSERT daily_digests_v3      │
            │ - summary_text               │
            │ - projects_discussed         │
            │ - key_decisions              │
            │ - blockers_identified        │
            │ - financial_mentions         │
            │ - participants               │
            └──────────────────────────────┘
```

---

## Supabase Schema

### V3 Tables (ONLY these tables are used)

#### 1. `messages_v3` (Raw Message Storage)

**Purpose:** Store ALL WhatsApp messages verbatim

```sql
CREATE TABLE messages_v3 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,           -- WhatsApp chat ID
  message_text TEXT NOT NULL,       -- Verbatim message content
  sender_name TEXT NOT NULL,        -- Display name
  sender_number TEXT NOT NULL,      -- Phone number
  timestamp TIMESTAMPTZ NOT NULL,   -- When message was sent
  mentioned_nova BOOLEAN DEFAULT FALSE,  -- Was @Nova mentioned?
  is_reply BOOLEAN DEFAULT FALSE,   -- Is this a reply to another message?
  has_media BOOLEAN DEFAULT FALSE,  -- Does message have attachments?
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_v3_chat_timestamp
  ON messages_v3(chat_id, timestamp DESC);

CREATE INDEX idx_messages_v3_timestamp
  ON messages_v3(timestamp DESC);

CREATE INDEX idx_messages_v3_mentioned
  ON messages_v3(chat_id, mentioned_nova)
  WHERE mentioned_nova = TRUE;
```

**Row Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "chat_id": "62811393989@c.us",
  "message_text": "@Nova, update progress Manado - sudah selesai pondasi",
  "sender_name": "Steven Eka Halim",
  "sender_number": "62811393989",
  "timestamp": "2025-11-05T14:30:00Z",
  "mentioned_nova": true,
  "is_reply": false,
  "has_media": false,
  "created_at": "2025-11-05T14:30:01Z"
}
```

#### 2. `hourly_notes` (Hourly Summaries)

**Purpose:** Store hourly conversation summaries

```sql
CREATE TABLE hourly_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  hour_timestamp TIMESTAMPTZ NOT NULL,  -- Hour being summarized (XX:00:00)
  summary_text TEXT NOT NULL,           -- Natural language summary
  key_decisions TEXT[] DEFAULT '{}',    -- Array of decisions
  action_items TEXT[] DEFAULT '{}',     -- Array of actions
  message_count INT NOT NULL,           -- How many messages summarized
  participants TEXT[] DEFAULT '{}',     -- Who participated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_hourly_notes_chat_hour
  ON hourly_notes(chat_id, hour_timestamp DESC);

CREATE UNIQUE INDEX idx_hourly_notes_unique
  ON hourly_notes(chat_id, hour_timestamp);
```

**Row Example:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "chat_id": "62811393989@c.us",
  "hour_timestamp": "2025-11-05T14:00:00Z",
  "summary_text": "Discussion about Manado project progress. Foundation work completed. Payment discussion - 21jt/70jt already paid. Next steps: check permits.",
  "key_decisions": [
    "Continue with current contractor",
    "Schedule site visit next week"
  ],
  "action_items": [
    "Steven to check permit status",
    "Hendry to visit site on Friday"
  ],
  "message_count": 12,
  "participants": ["Steven Eka Halim", "Hendry", "Win"],
  "created_at": "2025-11-05T15:00:01Z"
}
```

#### 3. `daily_digests_v3` (Daily Summaries)

**Purpose:** Store daily conversation digests

```sql
CREATE TABLE daily_digests_v3 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  digest_date DATE NOT NULL,             -- Date being summarized
  summary_text TEXT NOT NULL,            -- Overall daily summary
  projects_discussed TEXT[] DEFAULT '{}', -- Projects mentioned
  key_decisions TEXT[] DEFAULT '{}',     -- Important decisions
  blockers_identified TEXT[] DEFAULT '{}', -- Problems/blockers
  financial_mentions TEXT[] DEFAULT '{}', -- Money/budget mentions
  message_count INT NOT NULL,            -- Total messages
  participants TEXT[] DEFAULT '{}',      -- All participants
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_daily_digests_v3_chat_date
  ON daily_digests_v3(chat_id, digest_date DESC);

CREATE UNIQUE INDEX idx_daily_digests_v3_unique
  ON daily_digests_v3(chat_id, digest_date);
```

**Row Example:**
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "chat_id": "62811393989@c.us",
  "digest_date": "2025-11-04",
  "summary_text": "Productive day discussing multiple projects. Main focus on Manado construction progress and Jakarta Kuningan design phase. Financial discussions around budget allocation. Win coordinating permits for BSD location.",
  "projects_discussed": ["Manado", "Jakarta Kuningan", "BSD"],
  "key_decisions": [
    "Approved additional 10jt for Manado materials",
    "Decided on glass type for Kuningan",
    "BSD permit application to start next week"
  ],
  "blockers_identified": [
    "Manado permit still pending",
    "BSD land survey incomplete"
  ],
  "financial_mentions": [
    "21jt paid for Manado (30% down payment)",
    "70jt total Manado budget",
    "Kuningan materials estimate 45jt"
  ],
  "message_count": 87,
  "participants": ["Steven Eka Halim", "Hendry", "Win", "Nova"],
  "created_at": "2025-11-05T00:00:15Z"
}
```

### Table Relationships

```
┌─────────────────┐
│  messages_v3    │  ← Raw messages (NEVER deleted)
│  (∞ messages)   │
└────────┬────────┘
         │ grouped by hour
         ↓
┌─────────────────┐
│  hourly_notes   │  ← Hourly summaries
│  (1 per hour)   │
└────────┬────────┘
         │ grouped by day
         ↓
┌─────────────────┐
│ daily_digests_v3│  ← Daily summaries
│  (1 per day)    │
└─────────────────┘

All tables linked by: chat_id (WhatsApp chat identifier)
```

### Query Patterns

**Load Full Context:**
```sql
-- Recent messages (ALL, no limit)
SELECT * FROM messages_v3
WHERE chat_id = $1
ORDER BY timestamp ASC;

-- Hourly notes (last 24 hours)
SELECT * FROM hourly_notes
WHERE chat_id = $1
  AND hour_timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY hour_timestamp DESC;

-- Daily digests (last 30 days)
SELECT * FROM daily_digests_v3
WHERE chat_id = $1
  AND digest_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY digest_date DESC;
```

**Get Active Chats:**
```sql
SELECT DISTINCT chat_id
FROM messages_v3
WHERE timestamp >= NOW() - INTERVAL '24 hours';
```

**Messages for Hourly Summary:**
```sql
SELECT *
FROM messages_v3
WHERE chat_id = $1
  AND timestamp >= $2  -- hour start
  AND timestamp < $3   -- hour end
ORDER BY timestamp ASC;
```

---

## AI Integration

### OpenAI Configuration

**Models Used:**
```javascript
gpt-4o-mini:   Fast, cheap (< 50 messages context)
gpt-4o:        Balanced (50-200 messages)
gpt-4-turbo:   Most capable (> 200 messages)
```

**API Configuration:**
```javascript
OpenAI Client:
├── API Key: process.env.OPENAI_API_KEY
├── Organization: Not set
└── Timeout: Default (no custom timeout)

Request Parameters:
├── model: Dynamic (gpt-4o-mini/gpt-4o/gpt-4-turbo)
├── messages: Array of {role, content}
├── max_tokens: 300 (responses), 500 (hourly), 1000 (daily)
├── temperature: 0.7 (responses), 0.3 (summaries)
├── presence_penalty: 0.3
└── frequency_penalty: 0.3
```

### Nova's Personality Prompt

**Location:** `src/prompts/response.js`

**Current Prompt (850 characters):**
```javascript
You are Nova, an AI assistant for APEX Sports Lab - a padel court construction company in Indonesia.

## Your Job
Monitor WhatsApp messages, extract project info, store in database, and respond when helpful.

## The Team
- Hendry (construction lead)
- Win (project coordinator)
- Steven (design/technical)

## Current Projects
Manado, Jakarta Kuningan, BSD - check database for latest.

## Communication Style
- Mix Indonesian/English naturally like the team talks
- Casual but professional
- Keep responses 2-5 lines usually
- Minimal emojis: ✅ ⚠️ 🚨 📊

## When to Respond
- When @mentioned or DM'd
- When there's a clear question
- When confirmation is needed
- Skip casual chitchat

## Approach
Be helpful in whatever way makes sense. Don't force structure. Trust your training. Adapt to the conversation.
```

**Philosophy:**
- Minimal constraints
- Let AI adapt naturally
- Trust AI training
- No rigid rules or checklists

### Context Formatting for AI

**Daily Digests Format:**
```markdown
## 2025-11-04
[summary_text]

Projects: Manado, Jakarta Kuningan, BSD

Key Decisions:
  - Approved additional 10jt for Manado materials
  - Decided on glass type for Kuningan

Blockers:
  - Manado permit still pending
```

**Hourly Notes Format:**
```markdown
### 14:00, 5 Nov
[summary_text]

Decisions: Continue with current contractor; Schedule site visit
Actions: Steven to check permits; Hendry site visit Friday
```

**Recent Messages Format:**
```markdown
[14:30, 5 Nov] Steven Eka Halim @Nova: Update progress Manado
[14:31, 5 Nov] Nova: Sudah dicatat, Steven. Progress Manado...
[14:32, 5 Nov] Hendry: Pondasi sudah selesai 90%
```

### AI Response Generation Flow

```
1. Load Nova personality prompt
    ↓
2. Format daily digests as markdown
    ↓
3. Format hourly notes as markdown
    ↓
4. Format recent messages with timestamps
    ↓
5. Build OpenAI messages array:
   [
     {system: personality},
     {system: daily digests},
     {system: hourly notes},
     {system: recent messages},
     {user: current message}
   ]
    ↓
6. Select appropriate model based on context size
    ↓
7. Call OpenAI API
    ↓
8. Extract response text
    ↓
9. Log token usage and cost
    ↓
10. Return response
```

---

## Context Loading Strategy

### Philosophy: Load Everything, Let AI Filter

Unlike traditional systems that try to load "relevant" context, V3 loads **all available context** and trusts AI to filter what's important.

### Context Layers

```
┌─────────────────────────────────────────────────┐
│ LAYER 3: Long-term Memory (30 days)            │
│ ┌─────────────────────────────────────────┐    │
│ │ Daily Digests                            │    │
│ │ - High-level summaries                   │    │
│ │ - Projects, decisions, blockers          │    │
│ │ - 1 digest per day                       │    │
│ └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ LAYER 2: Medium-term Memory (24 hours)         │
│ ┌─────────────────────────────────────────┐    │
│ │ Hourly Notes                             │    │
│ │ - Activity summaries                     │    │
│ │ - Decisions, actions                     │    │
│ │ - 1 note per hour                        │    │
│ └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ LAYER 1: Short-term Memory (ALL messages)      │
│ ┌─────────────────────────────────────────┐    │
│ │ Recent Messages                          │    │
│ │ - Full conversation verbatim             │    │
│ │ - No time limit (loads ALL)              │    │
│ │ - Chronological order                    │    │
│ └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Default Loading Parameters

```javascript
{
  // Layer 1: Recent Messages
  messageDaysBack: null,     // Load ALL messages (no time limit)
  messageLimit: null,        // No count limit

  // Layer 2: Hourly Notes
  hourlyNotesHoursBack: 24,  // Last 24 hours

  // Layer 3: Daily Digests
  digestDaysBack: 30         // Last 30 days
}
```

### Why Load All Messages?

**Pros:**
- Complete conversation context
- AI can see full conversation evolution
- No risk of missing important earlier context
- Simpler logic (no complex filtering)

**Cons:**
- Higher token usage for long conversations
- Slower for very active chats

**Mitigation:**
- Smart model selection (use cheaper models for small contexts)
- Token monitoring to track costs
- Can add limits if costs become issue

### Context Loading Performance

**Parallel Loading:**
All three layers load simultaneously using `Promise.all()`:
```javascript
const [messages, hourlyNotes, dailyDigests] = await Promise.all([
  loadRecentMessages(chatId),
  loadHourlyNotes(chatId),
  loadDailyDigests(chatId)
]);
```

**Expected Load Times:**
- Messages: 50-200ms (depends on count)
- Hourly notes: 20-50ms (24 records max)
- Daily digests: 20-50ms (30 records max)
- **Total:** ~100-300ms parallel

---

## Background Jobs

### Job Scheduling

**Technology:** `node-cron`

**Jobs:**
```javascript
// Hourly Notes Job
Schedule: '0 * * * *'  // Every hour at :00
Example: 13:00, 14:00, 15:00

// Daily Digest Job
Schedule: '0 0 * * *'  // Every day at midnight
Timezone: Asia/Jakarta
Example: 00:00 Jakarta time
```

### Hourly Notes Job

**Purpose:** Summarize each hour's conversation

**Trigger Logic:**
```javascript
1. Runs at XX:00
2. Summarizes messages from (XX-1):00 to XX:00
3. Saves to hourly_notes table
```

**Process:**
```javascript
async function runHourlyNotes() {
  // 1. Get active chats
  const activeChats = await getActiveChats();

  for (const chatId of activeChats) {
    // 2. Get messages from last hour
    const hourStart = new Date();
    hourStart.setHours(hourStart.getHours() - 1, 0, 0, 0);

    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const messages = await loadMessagesInTimeRange(
      chatId,
      hourStart,
      hourEnd
    );

    if (messages.length === 0) continue;

    // 3. Format messages for AI
    const conversationText = formatMessages(messages);

    // 4. Call OpenAI for summary
    const summary = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Summarize this hour of conversation. Identify main topics, decisions, and actions.'
        },
        {
          role: 'user',
          content: conversationText
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    // 5. Parse response
    const result = parseHourlySummary(summary);

    // 6. Save to database
    await supabase.from('hourly_notes').insert({
      chat_id: chatId,
      hour_timestamp: hourStart.toISOString(),
      summary_text: result.summary,
      key_decisions: result.decisions,
      action_items: result.actions,
      message_count: messages.length,
      participants: extractParticipants(messages)
    });
  }
}
```

**AI Prompt:**
```
System: You are summarizing an hour of WhatsApp conversation for a construction company.

Task: Create a concise summary (2-3 sentences) of this hour's conversation.

Then extract:
1. Key Decisions: Important decisions made (array of strings)
2. Action Items: Tasks or actions mentioned (array of strings)

Format your response as JSON:
{
  "summary": "...",
  "key_decisions": ["...", "..."],
  "action_items": ["...", "..."]
}

Conversation:
[messages from last hour]
```

### Daily Digest Job

**Purpose:** Create comprehensive daily summary

**Trigger Logic:**
```javascript
1. Runs at 00:00 Jakarta time
2. Summarizes messages from 00:00-23:59 previous day
3. Saves to daily_digests_v3 table
```

**Process:**
```javascript
async function runDailyDigest() {
  // 1. Get active chats
  const activeChats = await getActiveChats();

  for (const chatId of activeChats) {
    // 2. Get yesterday's messages
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    const messages = await loadMessagesInTimeRange(
      chatId,
      yesterday,
      today
    );

    if (messages.length === 0) continue;

    // 3. Format for AI
    const conversationText = formatMessages(messages);

    // 4. Call OpenAI for digest
    const digest = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Create daily digest of construction company conversation.'
        },
        {
          role: 'user',
          content: conversationText
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    // 5. Parse response
    const result = parseDailyDigest(digest);

    // 6. Save to database
    await supabase.from('daily_digests_v3').insert({
      chat_id: chatId,
      digest_date: yesterday.toISOString().split('T')[0],
      summary_text: result.summary,
      projects_discussed: result.projects,
      key_decisions: result.decisions,
      blockers_identified: result.blockers,
      financial_mentions: result.financial,
      message_count: messages.length,
      participants: extractParticipants(messages)
    });
  }
}
```

**AI Prompt:**
```
System: You are creating a daily digest for APEX Sports Lab, a padel court construction company in Indonesia.

Task: Analyze this day's WhatsApp conversation and create:

1. Summary: 3-4 sentence overview of the day
2. Projects Discussed: Array of project names mentioned
3. Key Decisions: Important decisions made
4. Blockers Identified: Problems or obstacles mentioned
5. Financial Mentions: Any money/budget discussions

Format as JSON:
{
  "summary": "...",
  "projects_discussed": ["Manado", "Jakarta Kuningan"],
  "key_decisions": ["...", "..."],
  "blockers_identified": ["...", "..."],
  "financial_mentions": ["...", "..."]
}

Conversation from yesterday:
[all messages from yesterday]
```

### Job Error Handling

**Retry Logic:**
```javascript
// Jobs don't retry automatically
// If job fails, it will try again at next scheduled time
// Errors are logged but don't crash the system
```

**Failure Scenarios:**
1. **OpenAI API fails:** Log error, skip this iteration
2. **Database insert fails:** Log error, skip this chat
3. **No messages:** Skip silently (expected)

**Monitoring:**
```javascript
Logger output:
[V3] Starting Hourly Notes Job...
[V3] Processing chat: 62811393989@c.us
[V3] Hourly note created: uuid-here (12 messages)
[V3] Hourly Notes Job complete (2 chats processed)
```

---

## File Structure

```
apex-assistant/
│
├── src/
│   ├── index.js                     # Main entry point (V3-only)
│   │
│   ├── v3/                          # V3 ARCHITECTURE (CORE)
│   │   ├── index.js                 # V3 system initialization
│   │   ├── messageHandler.js        # Process incoming messages
│   │   ├── contextLoader.js         # Load conversation context
│   │   ├── responseGenerator.js     # Generate AI responses
│   │   ├── mentionDetector.js       # Detect @Nova mentions
│   │   ├── hourlyNotesJob.js        # Hourly summary job
│   │   └── dailyDigestJob.js        # Daily digest job
│   │
│   ├── whatsapp/
│   │   └── client.js                # WhatsApp client (shared)
│   │
│   ├── ai/
│   │   └── openai.js                # OpenAI client (shared)
│   │
│   ├── database/
│   │   └── supabase.js              # Supabase client (V3-only)
│   │
│   ├── prompts/
│   │   ├── response.js              # Nova's personality (V3)
│   │   ├── classification.js        # Unused (V2 legacy)
│   │   └── keywords.js              # Unused (V2 legacy)
│   │
│   ├── utils/
│   │   └── logger.js                # Winston logger
│   │
│   └── config/                      # Empty (reserved)
│
├── database/
│   ├── v3_fresh_start.sql           # V3 schema creation
│   ├── seed_nova_memory_v2.sql      # Sample data
│   └── run_seed.js                  # Seed script
│
├── docs/
│   └── NOVA_CONTEXT.md              # Nova context reference
│
├── .env                             # Environment variables
├── .env.example                     # Environment template
├── package.json                     # Node dependencies
├── ecosystem.config.js              # PM2 config
│
├── PROJECT_ARCHITECTURE.md          # V3 architecture guide
├── V3_TECHNICAL_BLUEPRINT.md        # This document
├── AUDIT_REPORT.md                  # Migration audit
└── README.md                        # Setup instructions
```

---

## Message Processing Lifecycle

### Detailed Step-by-Step

**1. WhatsApp Message Received**
```javascript
// In src/index.js
whatsapp.client.on('message_create', async (message) => {
  // Skip own messages
  if (message.fromMe) return;

  // Get chat context
  const chat = await message.getChat();
  const chatContext = {
    name: chat.name || message.from,
    isGroup: chat.isGroup
  };

  // Hand off to V3
  const result = await v3.handleMessage(message, chatContext);

  // Send reply if needed
  if (result.shouldReply && result.response) {
    await message.reply(result.response);
  }
});
```

**2. V3 Message Handler Takes Over**
```javascript
// In src/v3/messageHandler.js
async handleMessage(whatsappMessage, chatContext) {
  // 2.1: Extract message data
  const messageData = {
    chat_id: whatsappMessage.from,
    message_text: whatsappMessage.body,
    sender_name: (await whatsappMessage.getContact()).pushname,
    sender_number: whatsappMessage.from.split('@')[0],
    timestamp: new Date(whatsappMessage.timestamp * 1000),
    mentioned_nova: mentionDetector.detectMention(whatsappMessage.body),
    is_reply: whatsappMessage.hasQuotedMsg,
    has_media: whatsappMessage.hasMedia
  };

  // 2.2: Save to database
  const savedMessage = await this._saveMessage(messageData);

  // 2.3: Check if should respond
  const shouldRespond = await this._shouldRespond(
    messageData.message_text,
    chatContext,
    messageData
  );

  if (!shouldRespond) {
    return {shouldReply: false};
  }

  // 2.4: Generate response
  const response = await this._generateResponse(
    messageData.message_text,
    messageData.chat_id,
    messageData
  );

  return {
    shouldReply: true,
    response: response
  };
}
```

**3. Context Loading**
```javascript
// In src/v3/contextLoader.js
async loadFullContext(chatId, options) {
  // Load all three layers in parallel
  const [messages, hourlyNotes, dailyDigests] = await Promise.all([
    this._loadRecentMessages(chatId, null, null),
    this._loadHourlyNotes(chatId, 24),
    this._loadDailyDigests(chatId, 30)
  ]);

  return {
    chatId,
    loadedAt: new Date().toISOString(),
    messages: {
      data: messages,
      count: messages.length,
      daysBack: null
    },
    hourlyNotes: {
      data: hourlyNotes,
      count: hourlyNotes.length,
      hoursBack: 24
    },
    dailyDigests: {
      data: dailyDigests,
      count: dailyDigests.length,
      daysBack: 30
    }
  };
}
```

**4. Response Generation**
```javascript
// In src/v3/responseGenerator.js
async generate(messageText, context, senderInfo) {
  // 4.1: Build chat messages for OpenAI
  const messages = this._buildChatMessages(messageText, context, senderInfo);

  // 4.2: Select model based on context size
  const model = this._selectModel(context.messages.count);

  // 4.3: Call OpenAI
  const completion = await this.openai.chat.completions.create({
    model: model,
    messages: messages,
    max_tokens: 300,
    temperature: 0.7,
    presence_penalty: 0.3,
    frequency_penalty: 0.3
  });

  // 4.4: Extract response
  const response = completion.choices[0].message.content.trim();

  // 4.5: Log token usage
  this._logTokenUsage(completion, model, duration, context.messages.count);

  return response;
}
```

**5. Response Sent Back to WhatsApp**
```javascript
// Back in src/index.js
if (result.shouldReply && result.response) {
  await message.reply(result.response);
}
```

---

## Rules & Constraints

### Hard Rules (NEVER violate)

1. **V3 ONLY**
   - NEVER use V1/V2 code
   - NEVER reference V1/V2 tables
   - V3 tables only: messages_v3, hourly_notes, daily_digests_v3

2. **Store Everything Verbatim**
   - Save ALL messages to messages_v3 exactly as received
   - NEVER modify message text
   - NEVER skip messages

3. **No Forced Structure**
   - Don't extract structured data from messages
   - Let AI infer from raw text
   - Store summaries only (hourly/daily)

4. **Personality Constraints**
   - 2-5 lines usually
   - Mix Indonesian/English naturally
   - Minimal emojis: ✅ ⚠️ 🚨 📊
   - Professional but casual

5. **Response Conditions**
   - Respond only when:
     - Message is DM (private chat), OR
     - Nova is @mentioned in group
   - Skip casual chitchat

### Soft Guidelines (prefer but flexible)

1. **Token Efficiency**
   - Use gpt-4o-mini when possible
   - Monitor token usage
   - Log costs

2. **Context Loading**
   - Load all messages by default
   - Can add limits if needed
   - Parallel loading for speed

3. **Job Scheduling**
   - Hourly summaries at top of hour
   - Daily digests at midnight Jakarta
   - Don't retry on failure (wait for next schedule)

4. **Error Handling**
   - Log errors but don't crash
   - Graceful degradation
   - User-friendly fallback responses

### V2 Forbidden List

**NEVER create, import, or reference:**
- `src/memory/` folder
- `src/jobs/sessionSummarizer.js`
- `src/scheduler.js`
- `src/whatsapp/messageHandler.js` (V2 version)
- `src/ai/classifier.js`
- Tables: conversation_messages, conversation_sessions, projects, project_facts, conversation_daily_digests

---

## Configuration

### Environment Variables

**Required:**
```bash
# OpenAI
OPENAI_API_KEY=sk-proj-...

# Supabase (MUST use service_role key)
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...

# Server
PORT=3000              # Health server port

# Timezone
TIMEZONE=Asia/Jakarta  # For daily digest scheduling
```

**Optional:**
```bash
# WhatsApp
WHATSAPP_SESSION_PATH=./whatsapp-session

# OpenAI Model Override (auto-selects if not set)
OPENAI_MODEL_RESPONSE=gpt-4-turbo

# OpenAI Spending Limit
OPENAI_SPENDING_LIMIT=100

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

**Removed (V2-only):**
```bash
USE_V3              # Always V3 now
NOTION_TOKEN        # Not used in V3
SUPABASE_KEY        # Use SUPABASE_SERVICE_KEY instead
DAILY_DIGEST_TIME   # V3 uses midnight Jakarta
FOLLOWUP_DAYS       # V2 feature
```

### PM2 Configuration

**File:** `ecosystem.config.js`

```javascript
module.exports = {
  apps: [{
    name: 'apex-assistant',
    script: 'src/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    time: true
  }]
};
```

**PM2 Commands:**
```bash
# Start
pm2 start ecosystem.config.js

# Status
pm2 status

# Logs
pm2 logs apex-assistant

# Restart
pm2 restart apex-assistant

# Stop
pm2 stop apex-assistant

# Save config
pm2 save

# Startup script
pm2 startup
```

---

## Monitoring & Logging

### Log Levels

```javascript
Winston Levels:
├── error: Errors that need attention
├── warn:  Warnings (degraded but working)
├── info:  Normal operations
└── debug: Detailed debugging info
```

### Key Log Messages

**Startup:**
```
info: 🚀 Starting APEX Assistant...
info: ✅ Environment variables validated
info: ✅ Health server running on port 3000
info: Initializing OpenAI client...
info: Initializing WhatsApp client...
info: Initializing Supabase...
info: 🔷 Using V3 Architecture (Pure Conversational)
info: Initializing V3 modules...
info: Starting V3 jobs (hourly notes, daily digests)...
info: ✅ APEX Assistant is running (V3)!
```

**Message Processing:**
```
info: [V3] Handling message from +62 811-393-989: "Update progress..."
info: [V3] Message saved: uuid-123
info: [V3] Mentioned or DM, generating response...
info: Loading V3 context for chat: 62811393989@c.us
info: Context loaded: 45 messages, 0 hourly notes, 0 daily digests
info: Generating V3 response for message: "Update progress..."
info: [Token Monitor] Context size: 45 messages | Model: gpt-4o-mini
info: [V3] Generated response: "Sudah dicatat..."
```

**Token Monitoring:**
```
info: [Token Monitor] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info: [Token Monitor] Model: gpt-4o-mini
info: [Token Monitor] Context: 45 messages
info: [Token Monitor] Input tokens: 1250
info: [Token Monitor] Output tokens: 78
info: [Token Monitor] Total tokens: 1328
info: [Token Monitor] Duration: 2150ms
info: [Token Monitor] Estimated cost: $0.000235
info: [Token Monitor] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Background Jobs:**
```
info: [V3] Starting Hourly Notes Job...
info: [V3] Processing chat: 62811393989@c.us
info: [V3] Hourly note created: uuid-456 (23 messages)
info: [V3] Hourly Notes Job complete (1 chat processed)

info: [V3] Starting Daily Digest Job...
info: [V3] Processing chat: 62811393989@c.us
info: [V3] Daily digest created: uuid-789 (156 messages)
info: [V3] Daily Digest Job complete (1 chat processed)
```

**Errors:**
```
error: [V3] Error handling message: [error details]
error: Error generating V3 response: [error details]
error: ❌ Supabase connection failed: [error details]
```

### Health Check Response

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "uptime": "2h 45m",
  "uptimeSeconds": 9900,
  "timestamp": "2025-11-05T14:30:00Z",
  "architecture": "V3 (Pure Conversational)",
  "services": {
    "whatsapp": true,
    "openai": true,
    "supabase": true
  },
  "openai_stats": {
    "total_requests": 1234,
    "total_tokens": 456789,
    "last_request": "2025-11-05T14:29:55Z"
  }
}
```

---

## Error Handling

### Error Categories

**1. WhatsApp Errors**
```javascript
// Connection lost
error: WhatsApp disconnected
→ Automatic reconnection attempted
→ If fails, restart PM2 manually

// Authentication failed
error: WhatsApp QR code expired
→ Scan new QR code at /qr endpoint
```

**2. OpenAI Errors**
```javascript
// Rate limit
error: OpenAI rate limit exceeded
→ Automatic retry with exponential backoff
→ Fallback: Return error message to user

// Invalid API key
error: OpenAI authentication failed
→ Check OPENAI_API_KEY in .env
→ System won't start

// Timeout
error: OpenAI request timeout
→ Return fallback response
→ Log error, continue operation
```

**3. Supabase Errors**
```javascript
// Connection failed
error: Supabase connection failed
→ System continues but can't save/load
→ Responses still work (no historical context)

// Insert failed
error: Error saving message
→ Log error, continue
→ Message lost but system continues

// Query failed
error: Error loading context
→ Return empty context
→ AI generates response without history
```

**4. Message Processing Errors**
```javascript
// Any error in message handler
error: Error handling message: [details]
→ Log error
→ Don't crash system
→ Skip this message, wait for next
```

### Fallback Responses

```javascript
// OpenAI fails
"⚠️ Error generating response. Try again."

// Context loading fails
→ Generate response with no context
→ AI works from personality alone

// Message save fails
→ Log error but continue
→ Response still generated
```

### Graceful Degradation

**Order of operations:**
```
1. WhatsApp working?
   NO → System useless, must fix
   YES → Continue

2. Supabase working?
   NO → Can't save/load, but AI still works
   YES → Continue

3. OpenAI working?
   NO → Return error message
   YES → Continue

4. Context loading?
   NO → Generate response without context
   YES → Continue
```

---

## Performance Optimization

### Current Optimizations

**1. Parallel Context Loading**
```javascript
// Load all three layers simultaneously
const [messages, hourlyNotes, dailyDigests] = await Promise.all([...]);
// Instead of sequential (3x faster)
```

**2. Smart Model Selection**
```javascript
// Use cheapest model when possible
< 50 messages → gpt-4o-mini (90% cost savings vs turbo)
```

**3. Database Indexes**
```sql
-- Optimized queries for common patterns
CREATE INDEX idx_messages_v3_chat_timestamp ON messages_v3(chat_id, timestamp DESC);
CREATE INDEX idx_hourly_notes_chat_hour ON hourly_notes(chat_id, hour_timestamp DESC);
CREATE INDEX idx_daily_digests_v3_chat_date ON daily_digests_v3(chat_id, digest_date DESC);
```

**4. Connection Pooling**
```javascript
// Supabase client reuses connections
// OpenAI client reuses HTTP connections
```

### Performance Metrics

**Expected Response Times:**
```
Message Processing:
├── Save to DB: 50-100ms
├── Context loading: 100-300ms (parallel)
├── OpenAI API: 1000-3000ms
└── Total: ~1.5-3.5 seconds

Background Jobs:
├── Hourly: 1-5 seconds per chat
└── Daily: 2-10 seconds per chat
```

**Token Usage:**
```
Average Response:
├── Context: 1000-2000 tokens input
├── Response: 50-100 tokens output
└── Cost: $0.0002-0.0005 per response (gpt-4o-mini)

Hourly Summary:
├── Messages: 500-1500 tokens input
├── Summary: 100-200 tokens output
└── Cost: $0.0001-0.0003 per summary

Daily Digest:
├── Messages: 2000-5000 tokens input
├── Digest: 300-500 tokens output
└── Cost: $0.0008-0.0015 per digest
```

### Scaling Considerations

**Current Capacity:**
```
Single Instance:
├── Messages: ~100-200 per day easily
├── Chats: 5-10 active chats
├── Cost: ~$5-10/month OpenAI
└── Memory: <500MB

If Scaling Needed:
├── Add message/context limits
├── Implement caching layer
├── Use Redis for session storage
└── Consider cheaper models for summaries
```

---

## Future Extensions

### Potential Enhancements

**1. Multi-Language Support**
```javascript
// Detect language, respond in same language
// Currently: Mix Indonesian/English
```

**2. Image Analysis**
```javascript
// Use GPT-4 Vision for image messages
// Extract info from construction photos
```

**3. Voice Message Transcription**
```javascript
// Whisper API for voice messages
// Include transcripts in context
```

**4. Proactive Notifications**
```javascript
// Daily digest sent to team via WhatsApp
// Project deadline reminders
// Stale project alerts
```

**5. Web Dashboard**
```javascript
// View conversation history
// Search messages
// Analytics dashboard
```

**6. API Endpoints**
```javascript
// External integrations
// Webhook for message events
// REST API for queries
```

### Not Planned (Anti-features)

**DON'T add:**
- Structured project management (that's V2)
- Complex state machines
- Rigid workflows
- Heavy extraction/classification
- V2 features reinvented

**Philosophy:** Keep V3 simple, conversational, and AI-native.

---

## Appendix A: Quick Reference

### Key Files
```
src/index.js              # Main entry
src/v3/messageHandler.js  # Core logic
src/prompts/response.js   # Nova personality
.env                      # Configuration
```

### Key Tables
```
messages_v3       # All messages
hourly_notes      # Hourly summaries
daily_digests_v3  # Daily summaries
```

### Key Commands
```bash
# Start
pm2 start ecosystem.config.js

# Logs
pm2 logs apex-assistant

# Health
curl http://157.245.206.68:3000/health
```

### Key Ports
```
3000  # Health check server
8080  # (unused)
5432  # Supabase (remote)
```

### Key Environment Variables
```
OPENAI_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
PORT
TIMEZONE
```

---

## Appendix B: Troubleshooting

### WhatsApp QR Code Appearing

**Problem:** QR code shows at /qr endpoint

**Cause:** WhatsApp session not authenticated

**Solution:** Scan QR code with phone (Settings → Linked Devices)

---

### No Messages Being Processed

**Check:**
1. `pm2 logs apex-assistant` - any errors?
2. Is WhatsApp authenticated? (no QR code?)
3. Is message a DM or @mention?
4. Check Supabase connection

---

### High OpenAI Costs

**Check:**
1. Token monitor logs
2. Context size (how many messages?)
3. Model being used

**Solutions:**
- Add message limits
- Use smaller contexts
- Force gpt-4o-mini

---

### Messages Not Saving

**Check:**
1. Supabase connection (health endpoint)
2. SUPABASE_SERVICE_KEY correct?
3. Table exists?

**Fix:**
```sql
-- Recreate table
\i database/v3_fresh_start.sql
```

---

### Jobs Not Running

**Check:**
1. `pm2 logs` - job startup messages?
2. Timezone correct?
3. System time correct?

**Verify:**
```javascript
// Check next job run time
console.log(hourlyNotesJob.nextInvocation());
```

---

## Appendix C: Migration from V2

**If you have V2 data to migrate:**

1. **DON'T migrate structured data** (projects, facts, etc.)
2. **DO migrate raw messages** if needed:
   ```sql
   INSERT INTO messages_v3 (chat_id, message_text, sender_name, sender_number, timestamp)
   SELECT chat_id, message_body, sender_name, sender_phone, sent_at
   FROM conversation_messages;
   ```
3. **Create fresh summaries** using background jobs
4. **Delete V2 tables** once satisfied

---

## Document Changelog

- **2025-11-05:** Initial V3 blueprint created
- **Version:** 1.0.0

---

**END OF TECHNICAL BLUEPRINT**

This document is THE definitive technical reference for APEX Assistant V3. Share this with any future Claude Code session for complete system understanding.
