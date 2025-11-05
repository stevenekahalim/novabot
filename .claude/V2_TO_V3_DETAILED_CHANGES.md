# NOVA V2 → V3 MIGRATION: DETAILED CHANGE SPECIFICATION

**Date:** 2024-11-05
**Status:** Pre-execution (database not yet migrated)

---

## PART 1: DATABASE CHANGES

### V2 Database (BEFORE - TO BE DELETED)

**5 Tables:**

1. **conversation_messages** (25+ columns with AI extraction)
   - message_text, sender, timestamp
   - context_type, project_context, mentioned_entities
   - sentiment, urgency, intent, entities
   - decision_made, action_items, financial_mentions
   - blockers, questions, delegations

2. **conversation_sessions** (AI-compiled summaries)
   - session_start, session_end
   - summary_text, key_topics, participants

3. **conversation_daily_digests** (3 AM rollups)
   - digest_date, summary_text
   - message_count

4. **project_facts** (Atomic facts with superseding)
   - fact_text, fact_type, fact_category
   - confidence, fact_data
   - superseded_by, superseded_at, active

5. **projects** (Current project state)
   - name, context_type, location, status
   - pic, data (JSONB), next_action
   - deadline, tags

6. **updates_log** (Audit trail)
   - update_type, project_id, old_value, new_value

**TOTAL COMPLEXITY:** ~150+ columns across 6 tables

---

### V3 Database (AFTER - TO BE CREATED)

**3 Tables:**

1. **messages_v3** (Raw storage, minimal extraction)
   ```sql
   - id UUID
   - message_text TEXT
   - sender_name TEXT
   - sender_number TEXT
   - chat_id TEXT
   - chat_name TEXT
   - timestamp TIMESTAMPTZ
   - mentioned_nova BOOLEAN
   - is_reply BOOLEAN
   - replied_to_msg_id TEXT
   - has_media BOOLEAN
   - media_type TEXT
   ```

2. **hourly_notes** (Hourly AI summaries)
   ```sql
   - id UUID
   - chat_id TEXT
   - hour_timestamp TIMESTAMPTZ
   - summary_text TEXT
   - key_decisions TEXT[]
   - action_items TEXT[]
   - message_count INTEGER
   - participants TEXT[]
   ```

3. **daily_digests_v3** (Midnight comprehensive summaries)
   ```sql
   - id UUID
   - chat_id TEXT
   - digest_date DATE
   - summary_text TEXT
   - projects_discussed TEXT[]
   - key_decisions TEXT[]
   - blockers_identified TEXT[]
   - financial_mentions JSONB
   - message_count INTEGER
   - participants TEXT[]
   ```

**TOTAL COMPLEXITY:** ~35 columns across 3 tables (77% reduction)

---

### Migration SQL Actions

**File:** `database/v3_fresh_start.sql`

**Actions:**
```sql
-- DROP (Delete V2)
DROP TABLE IF EXISTS conversation_messages CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
DROP TABLE IF EXISTS conversation_daily_digests CASCADE;
DROP TABLE IF EXISTS project_facts CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS updates_log CASCADE;

-- CREATE (Build V3)
CREATE TABLE messages_v3 (...);
CREATE TABLE hourly_notes (...);
CREATE TABLE daily_digests_v3 (...);

-- CREATE INDEXES
CREATE INDEX idx_messages_v3_chat_timestamp ON messages_v3(chat_id, timestamp DESC);
CREATE INDEX idx_hourly_notes_chat_time ON hourly_notes(chat_id, hour_timestamp DESC);
CREATE INDEX idx_daily_digests_v3_chat_date ON daily_digests_v3(chat_id, digest_date DESC);

-- CREATE HELPER FUNCTION
CREATE FUNCTION get_recent_context(chat_id, message_limit, days_back);
```

**⚠️ WARNING:** This will DELETE ALL existing data. User approved: "lets start from 0"

---

## PART 2: CODE STRUCTURE CHANGES

### V2 File Structure (BEFORE - CURRENT)

```
src/
├── index.js (main entry point)
├── config/
│   ├── openai.js
│   └── supabase.js
├── whatsapp/
│   ├── client.js (WhatsApp connection)
│   ├── messageHandler.js (COMPLEX - 600+ lines)
│   ├── conversationalCore.js (Context loading - KEEP LOGIC)
│   └── shouldProcess.js (Message filtering)
├── memory/
│   ├── messageExtractor.js (AI extraction - REMOVE)
│   ├── factManager.js (Fact CRUD - REMOVE)
│   ├── sessionTracker.js (Session detection - REMOVE)
│   └── dailyDigestJob.js (3AM job - REPLACE)
├── classification/
│   ├── classifier.js (Message classification - REMOVE)
│   └── typeDetector.js (Type detection - REMOVE)
├── prompts/
│   ├── classification.js (Classification prompt - REMOVE)
│   ├── extraction.js (Extraction prompt - REMOVE)
│   └── response.js (Response prompt - KEEP)
├── utils/
│   ├── logger.js (KEEP)
│   └── helpers.js (KEEP)
└── notion/
    └── notionUpdater.js (DISABLED, KEEP AS-IS)
```

**V2 Message Flow:**
```
1. WhatsApp message received
2. shouldProcess() - filter casual messages
3. classifier.classify() - determine type (PROJECT_UPDATE, QUESTION, etc.)
4. messageExtractor.extract() - AI extracts 15+ fields
5. Save to conversation_messages with all extracted data
6. factManager.extractFacts() - create structured facts
7. Save to project_facts table
8. sessionTracker.updateSession() - update session
9. messageHandler.handleMessage() - route by type
10. Generate response (template-based in V2, conversational after fix)
11. Send response to WhatsApp
```

**Files to DELETE/REMOVE:**
- ❌ `src/memory/messageExtractor.js`
- ❌ `src/memory/factManager.js`
- ❌ `src/memory/sessionTracker.js`
- ❌ `src/classification/classifier.js`
- ❌ `src/classification/typeDetector.js`
- ❌ `src/prompts/classification.js`
- ❌ `src/prompts/extraction.js`

**Files to KEEP (unchanged):**
- ✅ `src/config/openai.js`
- ✅ `src/config/supabase.js`
- ✅ `src/whatsapp/client.js`
- ✅ `src/whatsapp/shouldProcess.js` (but behavior changes - see below)
- ✅ `src/prompts/response.js`
- ✅ `src/utils/logger.js`
- ✅ `src/utils/helpers.js`
- ✅ `src/notion/notionUpdater.js`

**Files to MODIFY:**
- 🔧 `src/index.js` - Add USE_V3 toggle
- 🔧 `src/whatsapp/messageHandler.js` - Simplify drastically OR replace with V3 version

**Files to CREATE (V3):**
- 🆕 `src/v3/index.js` - V3 entry point
- 🆕 `src/v3/contextLoader.js` - Load full conversation context
- 🆕 `src/v3/responseGenerator.js` - Generate responses with context
- 🆕 `src/v3/mentionDetector.js` - Detect @Nova mentions
- 🆕 `src/v3/messageHandler.js` - Simplified message handling
- 🆕 `src/v3/hourlyNotesJob.js` - Hourly summary job
- 🆕 `src/v3/dailyDigestJob.js` - Midnight digest job

---

### V3 File Structure (AFTER - NEW)

```
src/
├── index.js (MODIFIED - with USE_V3 toggle)
├── config/
│   ├── openai.js (UNCHANGED)
│   └── supabase.js (UNCHANGED)
├── whatsapp/
│   ├── client.js (UNCHANGED)
│   ├── messageHandler.js (V2 - kept for fallback)
│   ├── conversationalCore.js (V2 - reference for V3)
│   └── shouldProcess.js (V2 - different behavior in V3)
├── v3/ (NEW DIRECTORY)
│   ├── index.js (NEW - exports all V3 modules)
│   ├── contextLoader.js (NEW - loads messages + digests + notes)
│   ├── responseGenerator.js (NEW - GPT with full context)
│   ├── mentionDetector.js (NEW - @Nova detection)
│   ├── messageHandler.js (NEW - simplified flow)
│   ├── hourlyNotesJob.js (NEW - hourly summaries)
│   └── dailyDigestJob.js (NEW - midnight digests)
├── memory/ (V2 - DEPRECATED, keep for reference)
│   └── (all files kept but unused in V3)
├── classification/ (V2 - DEPRECATED, keep for reference)
│   └── (all files kept but unused in V3)
├── prompts/
│   ├── classification.js (V2 - unused in V3)
│   ├── extraction.js (V2 - unused in V3)
│   └── response.js (SHARED - used by V2 and V3)
├── utils/
│   ├── logger.js (SHARED)
│   └── helpers.js (SHARED)
└── notion/
    └── notionUpdater.js (UNCHANGED)
```

**V3 Message Flow:**
```
1. WhatsApp message received
2. mentionDetector.detectMention() - check for @Nova
3. Save raw message to messages_v3 table (NO AI extraction)
4. IF @mentioned OR is DM:
   a. contextLoader.loadFullContext() - get last 100 messages + digests + hourly notes
   b. responseGenerator.generate() - send full context to GPT
   c. Send response to WhatsApp
5. ELSE:
   a. Stay silent (no response)
6. Hourly job (separate process):
   - Load last hour's messages
   - Generate AI summary
   - Save to hourly_notes
7. Daily job (midnight):
   - Load all today's messages
   - Generate comprehensive digest
   - Save to daily_digests_v3
```

---

## PART 3: BEHAVIORAL CHANGES

### Response Triggering

**V2 (BEFORE):**
- Responds to almost every message (filtered by shouldProcess)
- Ignores only casual messages like "ok", "noted"
- Still responds to updates, questions, general chat
- **RESULT:** Too intrusive, responds too often

**V3 (AFTER):**
- Responds ONLY when:
  - Message contains @Nova or @nova
  - Message is a Direct Message (DM)
- Otherwise: Saves message, stays silent
- **RESULT:** Less intrusive, on-demand responses

---

### Message Processing

**V2 (BEFORE):**
```javascript
1. Classify message type (PROJECT_UPDATE, QUESTION, CASUAL, etc.)
2. Extract 15+ structured fields via AI
3. Save to conversation_messages with all fields
4. Extract atomic facts, save to project_facts
5. Update project state in projects table
6. Check for conflicts (e.g., multiple active facts about same thing)
7. Generate response (template or conversational)
```

**V3 (AFTER):**
```javascript
1. Detect @mention (simple string check)
2. Save raw message to messages_v3 (just text + metadata)
3. IF mentioned:
   - Load context (messages + digests + notes)
   - Send everything to GPT
   - Get response
4. ELSE: Done (no response)
```

**COMPLEXITY REDUCTION:** ~80% fewer operations per message

---

### Memory System

**V2 (BEFORE - 5-Layer Memory):**

1. **Immediate Memory:** conversation_messages (every message with AI extraction)
2. **Session Memory:** conversation_sessions (AI detects session boundaries)
3. **Daily Memory:** conversation_daily_digests (3 AM rollup)
4. **Fact Memory:** project_facts (structured atomic facts)
5. **Project State:** projects (current state derived from facts)

**Issues:**
- Fact conflicts (multiple active facts, no superseding)
- Over-structured (doesn't fit dynamic projects)
- Complex to maintain
- AI extraction on every message = expensive + slow

---

**V3 (AFTER - 3-Layer Memory):**

1. **Raw Memory:** messages_v3 (every message, no AI extraction)
2. **Hourly Memory:** hourly_notes (AI summary every hour)
3. **Daily Memory:** daily_digests_v3 (AI summary at midnight)

**Benefits:**
- No fact conflicts (just raw conversation)
- Flexible (AI infers from context, not structured data)
- Simple to maintain
- AI only runs hourly/daily for summaries + when @mentioned

---

### Context Loading

**V2 (BEFORE):**
```javascript
// In conversationalCore.js (after fix)
loadConversationContext(chatId, currentMessage) {
  // Load last 15 messages
  const messages = await supabase
    .from('conversation_messages')
    .select('message_text, sender, timestamp, context_type, project_context')
    .eq('chat_id', chatId)
    .order('timestamp', { ascending: false })
    .limit(15);

  // Detect project from message
  const project = detectProject(currentMessage);

  // Load facts for this project
  const facts = await supabase
    .from('project_facts')
    .select('*')
    .eq('project_name', project)
    .eq('active', true)
    .limit(20);

  // Load project state
  const projectState = await supabase
    .from('projects')
    .select('*')
    .ilike('name', project);

  return { messages, facts, projectState };
}
```

**V3 (AFTER):**
```javascript
// In v3/contextLoader.js
async loadFullContext(chatId) {
  // Load last 100 raw messages (7 days)
  const messages = await supabase
    .from('messages_v3')
    .select('sender_name, message_text, timestamp, mentioned_nova')
    .eq('chat_id', chatId)
    .gt('timestamp', nowMinus7Days)
    .order('timestamp', 'desc')
    .limit(100);

  // Load last 24 hours of hourly notes
  const hourlyNotes = await supabase
    .from('hourly_notes')
    .select('hour_timestamp, summary_text, key_decisions, action_items')
    .eq('chat_id', chatId)
    .gt('hour_timestamp', nowMinus24Hours)
    .order('hour_timestamp', 'desc');

  // Load last 30 days of daily digests
  const dailyDigests = await supabase
    .from('daily_digests_v3')
    .select('digest_date, summary_text, projects_discussed, key_decisions, blockers_identified')
    .eq('chat_id', chatId)
    .gt('digest_date', nowMinus30Days)
    .order('digest_date', 'desc');

  return { messages, hourlyNotes, dailyDigests };
}
```

**KEY DIFFERENCES:**
- V2: Loads 15 messages + structured facts + project state
- V3: Loads 100 messages + hourly summaries + daily summaries
- V2: 3 queries, returns ~50 total items
- V3: 3 queries, returns ~130 items (more context!)
- V2: Structured data (facts, classifications)
- V3: Raw text + AI summaries (let GPT infer)

---

## PART 4: FILE-BY-FILE IMPLEMENTATION SPECS

### NEW FILE: `src/v3/contextLoader.js`

**Purpose:** Load full conversation context for response generation

**Size:** ~150 lines

**Dependencies:**
- config/supabase.js
- utils/logger.js

**Key Methods:**
```javascript
class ContextLoader {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async loadFullContext(chatId, daysBack = 7) {
    // Load messages from last N days
    const messages = await this.loadRecentMessages(chatId, 100, daysBack);

    // Load hourly notes from last 24 hours
    const hourlyNotes = await this.loadHourlyNotes(chatId, 24);

    // Load daily digests from last 30 days
    const dailyDigests = await this.loadDailyDigests(chatId, 30);

    return { messages, hourlyNotes, dailyDigests };
  }

  async loadRecentMessages(chatId, limit = 100, daysBack = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const { data, error } = await this.supabase
      .from('messages_v3')
      .select('sender_name, message_text, timestamp, mentioned_nova')
      .eq('chat_id', chatId)
      .gte('timestamp', cutoff.toISOString())
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).reverse(); // Chronological order
  }

  async loadHourlyNotes(chatId, hoursBack = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursBack);

    const { data, error } = await this.supabase
      .from('hourly_notes')
      .select('hour_timestamp, summary_text, key_decisions, action_items, participants')
      .eq('chat_id', chatId)
      .gte('hour_timestamp', cutoff.toISOString())
      .order('hour_timestamp', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async loadDailyDigests(chatId, daysBack = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const { data, error } = await this.supabase
      .from('daily_digests_v3')
      .select('digest_date, summary_text, projects_discussed, key_decisions, blockers_identified, financial_mentions')
      .eq('chat_id', chatId)
      .gte('digest_date', cutoff.toISOString().split('T')[0])
      .order('digest_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

module.exports = ContextLoader;
```

---

### NEW FILE: `src/v3/responseGenerator.js`

**Purpose:** Generate Nova's response with full context

**Size:** ~100 lines

**Dependencies:**
- config/openai.js
- prompts/response.js
- utils/logger.js

**Key Methods:**
```javascript
const RESPONSE_PROMPT = require('../prompts/response');

class ResponseGenerator {
  constructor(openai) {
    this.openai = openai;
  }

  async generate(message, context, sender) {
    // Build comprehensive prompt with all context
    const systemPrompt = this.buildSystemPrompt(context);
    const userPrompt = `${sender}: ${message}`;

    // Call OpenAI
    const response = await this.openai.client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    return response.choices[0].message.content.trim();
  }

  buildSystemPrompt(context) {
    // Convert messages to text
    const recentConversation = context.messages
      .slice(-20) // Last 20 messages
      .map(m => `${m.sender_name}: ${m.message_text}`)
      .join('\n');

    // Convert hourly notes to text
    const hourlyContext = context.hourlyNotes.length > 0
      ? context.hourlyNotes
          .map(h => `[${h.hour_timestamp}] ${h.summary_text}`)
          .join('\n')
      : 'No recent hourly notes';

    // Convert daily digests to text
    const dailyContext = context.dailyDigests.length > 0
      ? context.dailyDigests
          .map(d => `[${d.digest_date}] ${d.summary_text}\nProjects: ${d.projects_discussed?.join(', ')}`)
          .join('\n\n')
      : 'No recent daily digests';

    return `${RESPONSE_PROMPT}

## FULL CONVERSATION CONTEXT

### Recent Conversation (Last 20 Messages):
${recentConversation}

### Hourly Summaries (Last 24 Hours):
${hourlyContext}

### Daily Context (Last 30 Days):
${dailyContext}

---

Now respond to the new message using ALL the context above. Be specific, reference names/dates/amounts from the context.`;
  }
}

module.exports = ResponseGenerator;
```

---

### NEW FILE: `src/v3/mentionDetector.js`

**Purpose:** Detect @Nova mentions in messages

**Size:** ~50 lines

**Dependencies:** None

**Key Methods:**
```javascript
class MentionDetector {
  detectMention(messageText, isDirectMessage = false) {
    // DMs always count as mentions
    if (isDirectMessage) {
      return true;
    }

    // Check for @Nova or @nova
    const lowerText = messageText.toLowerCase();
    return lowerText.includes('@nova');
  }

  isDirectMessage(chat) {
    // WhatsApp group chats have isGroup = true
    // DMs have isGroup = false or undefined
    return !chat.isGroup;
  }
}

module.exports = MentionDetector;
```

---

### NEW FILE: `src/v3/messageHandler.js`

**Purpose:** Main V3 message handling logic

**Size:** ~200 lines

**Dependencies:**
- config/supabase.js
- config/openai.js
- v3/contextLoader.js
- v3/responseGenerator.js
- v3/mentionDetector.js
- utils/logger.js

**Key Methods:**
```javascript
const ContextLoader = require('./contextLoader');
const ResponseGenerator = require('./responseGenerator');
const MentionDetector = require('./mentionDetector');

class MessageHandlerV3 {
  constructor(supabase, openai) {
    this.supabase = supabase;
    this.contextLoader = new ContextLoader(supabase);
    this.responseGenerator = new ResponseGenerator(openai);
    this.mentionDetector = new MentionDetector();
  }

  async handleMessage(message, chatContext) {
    const { chat, sender, body } = message;
    const chatId = chat.id._serialized;
    const senderName = sender.pushname || sender.name || 'Unknown';

    // 1. Save raw message
    await this.saveMessage(chatId, chat.name, senderName, body, message);

    // 2. Check if we should respond
    const isDirectMessage = this.mentionDetector.isDirectMessage(chat);
    const mentioned = this.mentionDetector.detectMention(body, isDirectMessage);

    if (!mentioned) {
      // Just save, don't respond
      logger.info(`Message saved (no mention), staying silent`);
      return;
    }

    // 3. Load full context
    logger.info('Nova mentioned! Loading context...');
    const context = await this.contextLoader.loadFullContext(chatId);

    // 4. Generate response
    logger.info('Generating response with full context...');
    const response = await this.responseGenerator.generate(body, context, senderName);

    // 5. Send response
    await chat.sendMessage(response);
    logger.info('Response sent!');

    // 6. Save Nova's response as a message too
    await this.saveMessage(chatId, chat.name, 'Nova', response, null);
  }

  async saveMessage(chatId, chatName, senderName, messageText, messageObj) {
    const mentioned = messageText.toLowerCase().includes('@nova');

    const { error } = await this.supabase.getClient()
      .from('messages_v3')
      .insert({
        chat_id: chatId,
        chat_name: chatName,
        sender_name: senderName,
        message_text: messageText,
        timestamp: new Date().toISOString(),
        mentioned_nova: mentioned,
        is_reply: messageObj?.hasQuotedMsg || false,
        has_media: messageObj?.hasMedia || false
      });

    if (error) {
      logger.error('Error saving message:', error);
      throw error;
    }
  }
}

module.exports = MessageHandlerV3;
```

---

### NEW FILE: `src/v3/hourlyNotesJob.js`

**Purpose:** Generate hourly meeting notes

**Size:** ~100 lines

**Dependencies:**
- config/supabase.js
- config/openai.js
- node-cron
- utils/logger.js

**Schedule:** Every hour at :00

**Key Logic:**
```javascript
const cron = require('node-cron');

class HourlyNotesJob {
  constructor(supabase, openai) {
    this.supabase = supabase;
    this.openai = openai;
  }

  start(chatId) {
    // Run every hour at minute 0
    cron.schedule('0 * * * *', async () => {
      logger.info('Running hourly notes job...');
      await this.generateHourlyNotes(chatId);
    });
  }

  async generateHourlyNotes(chatId) {
    // 1. Get messages from last hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { data: messages, error } = await this.supabase.getClient()
      .from('messages_v3')
      .select('sender_name, message_text, timestamp')
      .eq('chat_id', chatId)
      .gte('timestamp', oneHourAgo.toISOString())
      .order('timestamp', { ascending: true });

    if (error || !messages || messages.length === 0) {
      logger.info('No messages in last hour, skipping');
      return;
    }

    // 2. Generate AI summary
    const summary = await this.generateSummary(messages);

    // 3. Save to hourly_notes
    await this.saveHourlyNote(chatId, oneHourAgo, summary, messages);
  }

  async generateSummary(messages) {
    const conversation = messages
      .map(m => `${m.sender_name}: ${m.message_text}`)
      .join('\n');

    const prompt = `Summarize this hour's conversation as meeting notes.

Conversation:
${conversation}

Generate:
1. Brief summary (2-3 sentences)
2. Key decisions made (if any)
3. Action items (if any)

Format as JSON:
{
  "summary": "...",
  "key_decisions": ["...", "..."],
  "action_items": ["...", "..."]
}`;

    const response = await this.openai.client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 500
    });

    return JSON.parse(response.choices[0].message.content);
  }

  async saveHourlyNote(chatId, hourTimestamp, summary, messages) {
    const participants = [...new Set(messages.map(m => m.sender_name))];

    await this.supabase.getClient()
      .from('hourly_notes')
      .insert({
        chat_id: chatId,
        hour_timestamp: hourTimestamp.toISOString(),
        summary_text: summary.summary,
        key_decisions: summary.key_decisions || [],
        action_items: summary.action_items || [],
        message_count: messages.length,
        participants: participants
      });

    logger.info(`Hourly note saved: ${summary.summary}`);
  }
}

module.exports = HourlyNotesJob;
```

---

### NEW FILE: `src/v3/dailyDigestJob.js`

**Purpose:** Generate comprehensive daily digest at midnight

**Size:** ~150 lines

**Dependencies:**
- config/supabase.js
- config/openai.js
- node-cron
- utils/logger.js

**Schedule:** Daily at 00:00 WIB (Asia/Jakarta timezone)

**Key Logic:**
```javascript
const cron = require('node-cron');

class DailyDigestJob {
  constructor(supabase, openai) {
    this.supabase = supabase;
    this.openai = openai;
  }

  start(chatId) {
    // Run at midnight WIB (UTC+7)
    // Cron uses system time, so if server is UTC+7, use '0 0 * * *'
    cron.schedule('0 0 * * *', async () => {
      logger.info('Running daily digest job...');
      await this.generateDailyDigest(chatId);
    }, {
      timezone: 'Asia/Jakarta'
    });
  }

  async generateDailyDigest(chatId) {
    // 1. Get all messages from yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    const { data: messages, error } = await this.supabase.getClient()
      .from('messages_v3')
      .select('sender_name, message_text, timestamp')
      .eq('chat_id', chatId)
      .gte('timestamp', yesterday.toISOString())
      .lt('timestamp', today.toISOString())
      .order('timestamp', { ascending: true });

    if (error || !messages || messages.length === 0) {
      logger.info('No messages yesterday, skipping digest');
      return;
    }

    // 2. Generate comprehensive AI digest
    const digest = await this.generateDigest(messages);

    // 3. Save to daily_digests_v3
    await this.saveDailyDigest(chatId, yesterday, digest, messages);
  }

  async generateDigest(messages) {
    const conversation = messages
      .map(m => `${m.sender_name}: ${m.message_text}`)
      .join('\n');

    const prompt = `Generate a comprehensive daily digest for this conversation.

Conversation:
${conversation}

Analyze and extract:
1. Overall summary (3-5 sentences)
2. Projects discussed (list of project names)
3. Key decisions made
4. Blockers or issues identified
5. Financial mentions (amounts, budgets, payments)

Format as JSON:
{
  "summary": "...",
  "projects_discussed": ["Project A", "Project B"],
  "key_decisions": ["...", "..."],
  "blockers_identified": ["...", "..."],
  "financial_mentions": {
    "payments": ["21M architect DP"],
    "budgets": ["150M deposit"]
  }
}`;

    const response = await this.openai.client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 1000
    });

    return JSON.parse(response.choices[0].message.content);
  }

  async saveDailyDigest(chatId, date, digest, messages) {
    const participants = [...new Set(messages.map(m => m.sender_name))];
    const mostActive = this.findMostActiveParticipant(messages);

    await this.supabase.getClient()
      .from('daily_digests_v3')
      .insert({
        chat_id: chatId,
        digest_date: date.toISOString().split('T')[0],
        summary_text: digest.summary,
        projects_discussed: digest.projects_discussed || [],
        key_decisions: digest.key_decisions || [],
        blockers_identified: digest.blockers_identified || [],
        financial_mentions: digest.financial_mentions || {},
        message_count: messages.length,
        participants: participants,
        most_active_participant: mostActive
      });

    logger.info(`Daily digest saved for ${date.toDateString()}`);
  }

  findMostActiveParticipant(messages) {
    const counts = {};
    messages.forEach(m => {
      counts[m.sender_name] = (counts[m.sender_name] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
}

module.exports = DailyDigestJob;
```

---

### NEW FILE: `src/v3/index.js`

**Purpose:** V3 entry point, exports all modules

**Size:** ~50 lines

**Key Code:**
```javascript
const ContextLoader = require('./contextLoader');
const ResponseGenerator = require('./responseGenerator');
const MentionDetector = require('./mentionDetector');
const MessageHandlerV3 = require('./messageHandler');
const HourlyNotesJob = require('./hourlyNotesJob');
const DailyDigestJob = require('./dailyDigestJob');

module.exports = {
  ContextLoader,
  ResponseGenerator,
  MentionDetector,
  MessageHandlerV3,
  HourlyNotesJob,
  DailyDigestJob
};
```

---

### MODIFIED FILE: `src/index.js`

**Purpose:** Add V3 toggle

**Changes:**
```javascript
// BEFORE (V2):
const messageHandler = require('./whatsapp/messageHandler');

client.on('message', async (message) => {
  await messageHandler.handleMessage(message, chatContext);
});

// AFTER (with V3 toggle):
const USE_V3 = process.env.USE_V3 === 'true';

let messageHandler;

if (USE_V3) {
  const v3 = require('./v3');
  messageHandler = new v3.MessageHandlerV3(supabase, openai);

  // Start background jobs
  const hourlyJob = new v3.HourlyNotesJob(supabase, openai);
  const dailyJob = new v3.DailyDigestJob(supabase, openai);
  hourlyJob.start(TARGET_CHAT_ID);
  dailyJob.start(TARGET_CHAT_ID);

  logger.info('✅ Running NOVA V3');
} else {
  messageHandler = require('./whatsapp/messageHandler');
  logger.info('✅ Running NOVA V2');
}

client.on('message', async (message) => {
  if (USE_V3) {
    await messageHandler.handleMessage(message, chatContext);
  } else {
    await messageHandler.handleMessage(message, chatContext);
  }
});
```

---

## PART 5: DEPLOYMENT STEPS

### Step 1: Execute Database Migration via MCP

```javascript
// After Claude Code restart with MCP loaded:
// Use Supabase MCP to execute database/v3_fresh_start.sql
// This drops all V2 tables and creates V3 tables
```

### Step 2: Create V3 Directory and Files

```bash
mkdir -p src/v3
# Then create all 7 files listed above
```

### Step 3: Modify Main Entry Point

```bash
# Edit src/index.js to add USE_V3 toggle
```

### Step 4: Test Locally (Optional)

```bash
# Set USE_V3=false to test V2 still works
USE_V3=false npm start

# Set USE_V3=true to test V3
USE_V3=true npm start
```

### Step 5: Deploy to Production

```bash
ssh root@157.245.206.68
cd /root/apex-assistant
git pull
npm install
# Add to .env: USE_V3=false (start with V2 for safety)
pm2 restart apex-assistant
pm2 logs apex-assistant --lines 50
```

### Step 6: Switch to V3

```bash
# After verifying V2 still works:
# Edit .env: USE_V3=true
pm2 restart apex-assistant
pm2 logs apex-assistant
# Watch for "✅ Running NOVA V3"
```

### Step 7: Monitor

```bash
# Watch logs for 24 hours
pm2 logs apex-assistant

# Check database
# - messages_v3 should be filling up
# - hourly_notes should have entries every hour
# - daily_digests_v3 should have entry at midnight
```

---

## PART 6: ROLLBACK PLAN

If V3 has issues:

```bash
# 1. Switch back to V2
ssh root@157.245.206.68
cd /root/apex-assistant
# Edit .env: USE_V3=false
pm2 restart apex-assistant

# 2. If needed, restore V2 database
# Run database/seed_nova_memory_v2.sql in Supabase dashboard
```

⚠️ **NOTE:** V2 data was wiped, so rolling back means starting fresh with seed data

---

## SUMMARY OF CHANGES

### Database
- ❌ DELETE: 6 V2 tables (conversation_messages, project_facts, projects, etc.)
- ✅ CREATE: 3 V3 tables (messages_v3, hourly_notes, daily_digests_v3)
- 📉 77% reduction in schema complexity

### Code
- ❌ DEPRECATED: 7 V2 files (extraction, classification, fact management)
- ✅ CREATE: 7 V3 files (contextLoader, responseGenerator, etc.)
- 🔧 MODIFY: 1 file (src/index.js for USE_V3 toggle)
- 📦 NEW: src/v3/ directory

### Behavior
- 🔇 Silent by default (only responds when @mentioned)
- 📝 Raw storage (no AI extraction per message)
- ⏰ Hourly summaries (background job)
- 📅 Daily digests (midnight job)
- 🧠 More context (100 messages vs 15)
- 💬 More conversational (full context to GPT)

### Performance
- ⚡ 80% fewer operations per message
- 💰 Lower AI costs (no extraction, only hourly/daily summaries)
- 📊 Simpler queries (no complex joins)

---

## READY FOR EXECUTION

All specifications complete. Ready to:
1. Restart Claude Code (load MCP)
2. Execute database migration
3. Build V3 code
4. Deploy and test
