# Nova SOP - Week 1 MVP (Realistic & Implementable)

**Version:** 1.0 (Week 1 MVP)
**Last Updated:** Nov 4, 2025
**Based on:** Actual code capabilities in `src/`

---

## 🎯 CORE PRINCIPLES

1. **Supabase is Source of Truth** - All data starts here
2. **Notion is Read-Only Dashboard** - Gets overwritten by Supabase
3. **Simple > Complex** - If uncertain, ask user
4. **Always Confirm** - Every action gets a confirmation
5. **Fail Transparently** - Show errors, let user retry

---

## 📊 DATABASE ARCHITECTURE

```
User Message → WhatsApp
    ↓
Nova Classifies (GPT-3.5)
    ↓
Extract Data
    ↓
Save to Supabase (PRIMARY)
    ↓
Sync to Notion (SECONDARY)
    ↓
Confirm to User
```

**Direction:** One-way only (Supabase → Notion)
**Timing:** Immediate (no scheduled syncs)
**Conflicts:** Supabase always wins

---

## 1. PROJECT CREATION RULES

### When Nova Creates New Projects

**RULE:** Always ask user first. Never auto-create.

**Detection:**
```javascript
// In messageHandler.js:111-131
if (!project) {
  // Project doesn't exist
  // BEFORE: Would auto-create
  // NOW: Must ask user first
}
```

**Flow:**
```
User: "Bandung construction 50%"
Nova: Checks database... not found
Nova: "Project 'Bandung' tidak ada di database.
       Buat project baru? (yes/no)"
User: "yes"
Nova: Creates in Supabase + Notion
Nova: "✅ CREATED: Bandung
       - Supabase ID: abc-123
       - Status: Planning
       - Notion: [link to page]
       - Created at: 10:45 AM"
```

### Required Data for New Project

**Minimum (only name required):**
- `name` - from user message ✅ REQUIRED
- All others get defaults:
  - `status` = "Planning"
  - `pic` = Inferred from message author (Eka/Hendry/Win)
  - `created_by` = "Nova"
  - `created_at` = NOW()

**Optional (if mentioned):**
- `location` - extracted from message
- `monthly_cost` - parsed from "15jt", "20M", etc.
- `phase` - extracted from context

### Defaults (Auto-Set)

```javascript
const NEW_PROJECT_DEFAULTS = {
  status: 'Planning',
  pic: inferPIC(author),  // From message author name
  created_by: 'Nova',
  created_at: new Date(),
  archived: false
};
```

---

## 2. PROJECT MATCHING STRATEGY

### How Nova Finds Existing Projects

**Step 1: Exact Match (Case-Insensitive)**
```javascript
// src/database/supabase.js:48-60
async getProjectByName(name) {
  const { data } = await this.client
    .from('projects')
    .select('*')
    .ilike('name', name)  // Case-insensitive exact match
    .single();
}
```

**Examples:**
- Input: "jakarta" → Matches: "Jakarta"
- Input: "PALEMBANG" → Matches: "Palembang"
- Input: "bandung " (with space) → Matches: "Bandung" (trimmed)

### Step 2: Partial Match (If Exact Fails)

**NOT IMPLEMENTED YET** - Week 1 limitation

**Current behavior:**
- If exact match fails → Nova says "Project not found, create new?"
- User must type exact name

**Week 2 improvement:**
```javascript
// TODO: Add fuzzy search
const similar = projects.filter(p =>
  p.name.toLowerCase().includes(input.toLowerCase())
);

if (similar.length > 1) {
  // Show list, ask user to pick
  showOptions(similar);
}
```

### Multiple Matches (Future)

**Current:** Doesn't handle (will be added Week 2)

**Planned behavior:**
```
User: "update jakarta 70%"
Nova: "Which Jakarta project?
       1. Jakarta Selatan (60% complete)
       2. Jakarta Utara (30% complete)
       Reply with number or name"
User: "1"
Nova: "✅ Updated Jakarta Selatan: 70%"
```

---

## 3. UPDATE OPERATIONS

### What Gets Updated

**Nova ONLY updates fields that are mentioned:**

```javascript
// src/whatsapp/messageHandler.js:138-149
const updates = {
  name: project.name,  // Never changes
  status: inferStatus(classification) || project.status,  // Only if mentioned
  last_update: new Date()  // Always update
};

if (classification.costs) {
  updates.monthly_cost = classification.costs;  // Only if mentioned
}
```

**Examples:**

1. **Cost Update:**
```
User: "Palembang cost 20jt"
Updates: {monthly_cost: 20000000, last_update: NOW()}
Preserves: status, pic, location, everything else
```

2. **Status Update:**
```
User: "Jakarta construction phase"
Updates: {status: 'Construction', last_update: NOW()}
Preserves: monthly_cost, pic, location, everything else
```

3. **Multiple Fields:**
```
User: "Bandung 70% done, cost 15M, PIC Hendry"
Updates: {
  status: 'Construction',  // inferred from context
  monthly_cost: 15000000,
  pic: 'Hendry',
  last_update: NOW()
}
```

### Update Logging

**Every update creates a log:**

```javascript
// src/whatsapp/messageHandler.js:153-159
await this.supabase.logUpdate({
  project_id: project.id,
  author: author,  // WhatsApp name
  update_text: text,  // Original message
  message_type: 'progress',  // or 'blocker', 'decision'
  whatsapp_message_id: messageId  // For tracing
});
```

**Log table structure:**
```sql
updates_log (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  author TEXT,  -- "Steven Eka Halim"
  update_text TEXT,  -- "Palembang 70% done"
  message_type TEXT,  -- 'progress', 'blocker', 'decision'
  whatsapp_message_id TEXT,  -- For audit
  created_at TIMESTAMP
)
```

---

## 4. NOTION SYNC PROTOCOL

### Sync Direction: ONE-WAY ONLY

```
Supabase (PRIMARY) → Notion (SECONDARY)
```

**NEVER:**
```
Supabase ← Notion  ❌ NO
```

### When Sync Happens

**Immediate after Supabase update:**

```javascript
// src/whatsapp/messageHandler.js:162-163
await this.notion.syncProject(project);  // Happens immediately
```

**NOT scheduled** - no cron jobs, no background sync

### What If Sync Fails?

```javascript
// Current behavior: Just logs error, doesn't notify user
// TODO Week 2: Notify user if Notion sync fails

try {
  await this.notion.syncProject(project);
} catch (error) {
  logger.error('Notion sync failed:', error);
  // Currently: Silent failure
  // Should: Tell user "✅ Saved to Supabase. ⚠️ Notion sync pending"
}
```

### Conflict Resolution

**Rule: Supabase ALWAYS wins**

```
If user manually edits Notion:
  → Next sync from Supabase OVERWRITES Notion
  → Manual edits are LOST

⚠️ WARNING TO USERS:
"Don't manually edit Notion! Use WhatsApp or edit Supabase directly."
```

### Notion Page Structure

**Created for each new project:**

```javascript
// src/notion/sync.js:32-52
{
  parent: { data_source_id: dataSourceId },
  properties: {
    'Name': { title: [{ text: { content: project.name }}]},
    'Supabase ID': { rich_text: [{ text: { content: project.id }}]},
    'Location': { select: { name: project.location || 'TBD' }},
    'Status': { select: { name: project.status }},
    'PIC': { select: { name: project.pic || 'Unassigned' }},
    'Monthly Cost': { number: project.monthly_cost },
    'Last Update': { date: { start: new Date().toISOString() }}
  }
}
```

---

## 5. DATA PARSING RULES

### Cost Parsing (Lenient!)

**Accepts:**
- "15jt" → 15,000,000
- "15 juta" → 15,000,000
- "15M" → 15,000,000
- "Rp 15jt" → 15,000,000
- "15.5M" → 15,500,000
- "15,000,000" → 15,000,000

**Implementation:**
```javascript
// src/ai/classifier.js:24
// OpenAI handles parsing in classification
// Example: "convert '15jt' to 15000000"
```

**If parsing fails:**
- Nova shows: "Cost tidak jelas, coba lagi? (contoh: 15jt atau 15000000)"

### Percentage Parsing

**Accepts:**
- "70%" → 70
- "70 persen" → 70
- "~70%" → 70
- "sekitar 70" → 70

**Range:** 0-100 only

### Status Inference

**Keywords → Status mapping:**

```javascript
// src/whatsapp/messageHandler.js:274-291
const statusKeywords = {
  'rental': 'Rental',
  'design': 'Design',
  'construction': 'Construction',
  'complete': 'Complete',
  'done': 'Complete',
  'selesai': 'Complete',
  'planning': 'Planning'
};
```

**Examples:**
- "rental done" → Status: Rental
- "construction phase" → Status: Construction
- "design selesai" → Status: Complete

### Date Parsing

**NOT IMPLEMENTED YET** - Week 1 limitation

**Current:** Only captures dates in `key_info`, doesn't parse to date field

**Week 2:** Will parse relative dates:
- "tomorrow" → 2025-11-05
- "next week" → 2025-11-11
- "Nov 15" → 2025-11-15

---

## 6. MESSAGE CLASSIFICATION

### How Nova Decides Message Type

**Uses GPT-3.5-turbo with this prompt:**

```javascript
// src/ai/classifier.js:10-44
Message types:
- PROJECT_UPDATE: progress, costs, status updates
- QUESTION: asking about project status
- BLOCKER: problems, delays, stuck
- DECISION: important decisions made
- CASUAL: greetings, acknowledgments (IGNORED)
```

### Processing Threshold

```javascript
// src/ai/classifier.js:80-83
shouldProcess(classification) {
  return classification.type !== 'CASUAL'
      && classification.confidence > 0.5;
}
```

**If confidence < 0.5:** Nova ignores (assumes casual)
**If type = CASUAL:** Nova ignores

### Classification Examples

**PROJECT_UPDATE (will process):**
- "Palembang 70% done"
- "Jakarta cost naik jadi 20jt"
- "Bandung construction start tomorrow"

**CASUAL (will ignore):**
- "ok"
- "thanks"
- "gimana nih"
- "udah makan?"

**QUESTION (will process):**
- "Jakarta gimana progressnya?"
- "Berapa cost Palembang?"

**BLOCKER (will process):**
- "Jakarta stuck, permit belum keluar"
- "Delay 2 minggu, contractor sakit"

**DECISION (will process):**
- "Confirmed, kita ambil spot Bandung"
- "Decided PIC Bandung = Hendry"

---

## 7. CONFIRMATIONS & RESPONSES

### After Creating Project

```javascript
// Group chat (short):
"✅ Created: Bandung
 📍 Status: Planning
 👤 PIC: Eka"

// Private chat (detailed):
"✅ CREATED: Bandung
 📍 Status: Planning
 👤 PIC: Eka
 🆔 ID: abc-123-xyz
 📊 Notion: [link]
 ⏰ Created at: 10:45 AM

 _Type 'status Bandung' for full details_"
```

### After Updating Project

```javascript
// src/whatsapp/messageHandler.js:234-252
// Group chat:
"✅ Updated: Jakarta Selatan
 💰 Cost: Rp 15,000,000
 📊 Progress: 60%
 📍 Status: Construction

 _Last update: 4/11/2025, 10:45:32_"

// Private chat (adds more):
"✅ Updated: Jakarta Selatan
 💰 Cost: Rp 15,000,000
 📊 Progress: 60%
 📍 Status: Construction
 👤 PIC: Eka

 _Last update: 4/11/2025, 10:45:32_
 _Type 'status Jakarta Selatan' for full project details_"
```

### On Error

```javascript
// Group:
"⚠️ Maaf, ada error processing message.
 Silakan coba lagi atau tag @Eka"

// Private (more detail):
"⚠️ Maaf, ada error processing message.

 Detail: Database connection timeout

 Silakan coba lagi atau hubungi admin."
```

---

## 8. ERROR HANDLING

### Database Errors

**Current behavior:**
```javascript
// src/whatsapp/messageHandler.js:105-114
try {
  // ... save to database
} catch (error) {
  logger.error('Error processing message:', error);
  await chat.sendMessage('⚠️ Error...');
  // User must retry manually
}
```

**No retry queue, no automatic recovery**

**User must:** Resend the message

### Notion Sync Errors

**Current behavior:**
```javascript
// Just logs, doesn't tell user
try {
  await this.notion.syncProject(project);
} catch (error) {
  logger.error('Notion sync failed:', error);
  // User doesn't know it failed
}
```

**TODO Week 2:**
- Notify user: "✅ Saved to Supabase. ⚠️ Notion sync pending"
- Retry sync in background

### OpenAI API Errors

**Has retry with exponential backoff:**

```javascript
// src/ai/openai.js:66-85
async chatWithRetry(messages, model, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.chat(messages, model);
    } catch (error) {
      // Waits: 1s, 2s, 4s before retrying
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await sleep(delay);
    }
  }
  throw lastError;
}
```

---

## 9. LIMITATIONS (Week 1 MVP)

### What Nova CANNOT Do Yet

❌ **Fuzzy project name matching**
- Must type exact name
- Week 2: Will suggest similar names

❌ **Multiple project handling in one message**
- "Jakarta 70%, Palembang 80%" → Only processes first
- Week 2: Will detect and process both

❌ **Task creation/management**
- No tasks table yet
- Week 2: Will add tasks feature

❌ **Date parsing**
- Doesn't parse "tomorrow", "next week"
- Week 2: Will parse relative dates

❌ **Scheduled syncs**
- No background jobs
- Only syncs when message arrives
- Week 2: Add hourly full sync

❌ **Notion conflict detection**
- Manual Notion edits get overwritten
- No warning system yet
- Week 2: Detect and warn

❌ **Automatic reminders**
- No "project not updated in 7 days" alerts
- Week 2: Add proactive reminders

❌ **Budget tracking**
- Doesn't sum costs across projects
- Doesn't track against budget
- Week 2: Add financial summaries

❌ **Voice note transcription**
- Whisper API integrated but not activated
- Week 2: Enable voice notes

---

## 10. TESTING CHECKLIST

### Test Scenarios

**1. Create New Project:**
```
✅ Send: "Yogyakarta construction start, 10jt per month"
✅ Nova asks: "Create new project Yogyakarta?"
✅ Reply: "yes"
✅ Check: Supabase has record
✅ Check: Notion has page
✅ Verify: Confirmation message shows ID
```

**2. Update Existing Project:**
```
✅ Send: "Jakarta Selatan 80% done"
✅ Check: Supabase updated
✅ Check: Notion synced
✅ Verify: Confirmation shows old vs new
```

**3. Blocker:**
```
✅ Send: "BLOCKER - Palembang permit stuck"
✅ Check: Logged in updates_log with type='blocker'
✅ Verify: @Eka tagged in group
```

**4. Question:**
```
✅ Send: "Status Jakarta?"
✅ Check: Nova queries Supabase
✅ Verify: Response shows current data
```

**5. Error Handling:**
```
✅ Disconnect internet
✅ Send: "Update test"
✅ Verify: Error message shown
✅ Reconnect
✅ Retry: Message processes successfully
```

**6. Classification:**
```
✅ Send: "thanks bro" → Should ignore (CASUAL)
✅ Send: "ok" → Should ignore (CASUAL)
✅ Send: "Jakarta 50%" → Should process (PROJECT_UPDATE)
```

---

## 11. WEEK 2 IMPROVEMENTS ROADMAP

### Planned Enhancements

**1. Smart Project Matching**
- Fuzzy search
- Show similar names
- Handle abbreviations (JKT → Jakarta)

**2. Better Error Recovery**
- Retry queue for failed syncs
- Notify user of Notion sync failures
- Automatic recovery attempts

**3. Tasks Feature**
- Create tasks: "create task: call contractor for Jakarta"
- Track deadlines
- Assign to people

**4. Proactive Reminders**
- "Jakarta hasn't been updated in 7 days"
- "Design phase deadline tomorrow"
- Weekly summary reports

**5. Voice Notes**
- Enable Whisper transcription
- Process voice updates like text

**6. Financial Tracking**
- Sum costs across projects
- Budget vs actual
- Monthly burn rate

**7. Scheduled Syncs**
- Hourly full Notion sync
- Daily backup to CSV
- Weekly summary report

---

## APPENDIX: Configuration File

```javascript
// nova-config.js (to be created)
module.exports = {
  version: '1.0-mvp',

  database: {
    primary: 'supabase',
    secondary: 'notion',
    sync_direction: 'one_way',  // supabase → notion only
    sync_timing: 'immediate',   // no scheduled syncs yet
  },

  project_creation: {
    ask_before_create: true,    // Always confirm
    auto_create: false,
    defaults: {
      status: 'Planning',
      pic: 'infer_from_author',
      created_by: 'Nova'
    }
  },

  matching: {
    strategy: 'exact_match',    // No fuzzy yet
    case_sensitive: false,
    trim_whitespace: true,
  },

  classification: {
    model: 'gpt-3.5-turbo',
    confidence_threshold: 0.5,
    ignore_casual: true,
  },

  error_handling: {
    retry_attempts: 3,
    retry_strategy: 'exponential_backoff',
    show_errors_to_user: true,
    auto_recovery: false,       // Week 2 feature
  },

  confirmations: {
    always_confirm: true,
    include_ids: true,          // For debugging
    include_links: true,        // Notion links
  },

  limitations: {
    fuzzy_matching: false,
    task_management: false,
    date_parsing: false,
    scheduled_syncs: false,
    voice_notes: false,
  }
};
```

---

**END OF REALISTIC SOP v1.0**

_This SOP matches actual code implementation as of Nov 4, 2025_
