# APEX ASSISTANT - PROJECT CONTEXT
*Last Updated: 2025-11-20*

## 🎯 PROJECT OVERVIEW

**Nova AI Project Manager** - WhatsApp AI assistant for Apex Sports Lab team
- **Architecture**: V3 Pure Conversational with dual-context system
- **AI Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Server**: DigitalOcean @ 157.245.206.68
- **Status**: ✅ OPERATIONAL

---

## 🔧 RECENT SESSION CHANGES (2025-11-20)

### 1. AI-Powered Reminder System
**New Feature**: Natural language reminder parsing and automated delivery

**Files Created**:
- `src/v3/reminderParser.js` - Claude AI parsing for natural language
- `src/v3/reminderManager.js` - Database CRUD operations
- `src/v3/reminderJob.js` - Hourly cron job for delivery
- `migrations/create_reminders_table.sql` - Database schema

**Files Modified**:
- `src/v3/messageHandler.js` - Added reminder detection (lines 11-12, 59-84, 314-342)
- `src/v3/index.js` - Integrated reminder job (lines 29-30, 51-54, 63-64, 76-78, 86-88)

**How It Works**:
- Users say: "@Nova remind me tomorrow about meeting"
- AI parses: who, when, what
- Hourly cron checks and sends via WhatsApp
- Cost: Rp 750 per reminder (~$0.05)

**Database**: New `reminders` table (id, assigned_to, reminder_date, reminder_time, message, status)

### 2. Midnight Recap in 9 AM Updates
**New Feature**: Daily compilation status reporting in morning updates

**Files Modified**:
- `src/v3/dailyUpdatesJob.js` - Added midnight recap fetch (lines 176-218, 283-304)
- `src/prompts/dailyUpdate.js` - Added compilation status section

**How It Works**:
- Every 9 AM update includes yesterday's compilation status
- Shows: "✅ Yesterday compiled (76 messages → KB #166486)"
- Alerts if failed: "⚠️ Midnight recap failed - X messages not compiled"
- Immediate visibility into compilation health

### 3. Bug Fixes
**Fixed**: Knowledge compiler date calculation (off-by-one day)
- **File**: `src/v3/knowledgeCompiler.js` - Line 120
- **Issue**: Was querying Nov 18 instead of Nov 19
- **Fix**: Changed `setUTCDate(-2)` to `setUTCDate(-1)`

---

## 🔧 PREVIOUS SESSION CHANGES (2025-11-06)

### 1. Model Upgrade: GPT-4o → Claude Sonnet 4.5
**Reason**: Claude 3.5 Sonnet 20240620 was deprecated by Anthropic (404 error)

**Files Modified**:
- `src/v3/responseGenerator.js` - Lines 18, 19, 87, 98
- `src/v3/dailyUpdatesJob.js` - Lines 22, 316

**Changes**:
```javascript
// Before (deprecated)
model: 'claude-3-5-sonnet-20240620'
maxTokens: 500

// After (current)
model: 'claude-sonnet-4-5-20250929'
maxTokens: 1000
```

### 2. Max Tokens Increase: 500 → 1000
**Reason**: User requested longer, more detailed responses
- Increased token limit by 100% for more comprehensive answers
- Cost per response: ~$0.08-0.09

### 3. Mention Detection Fix
**Problem**: Nova didn't respond when tagged with `@108835192717483` (numeric ID)

**Solution**: Added numeric ID patterns to mention detector
- **File**: `src/v3/mentionDetector.js` - Lines 21-22
- **Added Patterns**:
  ```javascript
  /@108835192717483/,  // Nova's numeric ID with @
  /108835192717483/    // Nova's numeric ID without @
  ```

---

## 📁 CRITICAL FILES & LOCATIONS

### Core V3 Files
```
/Users/stevenekahalim/apex-assistant/
├── src/
│   ├── index.js                        # Main entry point
│   ├── v3/
│   │   ├── responseGenerator.js        # Claude Sonnet 4.5 response generation
│   │   ├── dailyUpdatesJob.js          # 9 AM & 3:30 PM proactive updates
│   │   ├── knowledgeCompiler.js        # Midnight compilation (GPT-4)
│   │   ├── reminderParser.js           # AI reminder parsing
│   │   ├── reminderManager.js          # Reminder database operations
│   │   ├── reminderJob.js              # Hourly reminder check & send
│   │   ├── contextLoader.js            # Dual-context loader
│   │   ├── messageHandler.js           # Message processing + whitelist + reminders
│   │   ├── mentionDetector.js          # @mention detection
│   │   └── index.js                    # V3 module orchestrator
│   ├── prompts/
│   │   ├── response.js                 # Nova's personality prompt
│   │   ├── dailyUpdate.js              # Daily update prompt (with midnight recap)
│   │   └── compilation.js              # Knowledge compilation prompt
│   └── database/
│       └── supabase.js                 # Supabase client
├── migrations/
│   └── create_reminders_table.sql      # Reminders table schema
├── .env                                # Environment variables
└── package.json                        # Dependencies
```

### Server Files
```
root@157.245.206.68:/root/apex-assistant/
├── Same structure as local
├── Managed by: PM2 (process manager)
└── Service name: apex-assistant
```

---

## 🔑 ENVIRONMENT VARIABLES

### Required Keys (in .env)
```bash
# Anthropic (for Nova responses + daily updates)
ANTHROPIC_API_KEY=[your-anthropic-api-key]

# OpenAI (for midnight compilation only)
OPENAI_API_KEY=[your-openai-api-key]

# Supabase
SUPABASE_URL=https://rexuplchcdqfelcukryh.supabase.co
SUPABASE_SERVICE_KEY=[your-supabase-service-key]

# Server
PORT=3000
```

---

## ⚙️ SYSTEM CONFIGURATION

### Model Configuration
```javascript
// responseGenerator.js
{
  model: 'claude-sonnet-4-5-20250929',
  maxTokens: 1000,
  temperature: 0.3,
  pricing: {
    input: $0.003 per 1K tokens,
    output: $0.015 per 1K tokens
  }
}
```

### Scheduled Jobs (WIB = UTC+7)
| Job | Time (WIB) | Time (UTC) | Model | Purpose |
|-----|-----------|-----------|-------|---------|
| Knowledge Compilation | 00:00 (midnight) | 17:00 | GPT-4 | Compile day's messages |
| Morning Update | 09:00 | 02:00 | Claude Sonnet 4.5 | Proactive update + midnight recap |
| Afternoon Update | 15:30 | 08:30 | Claude Sonnet 4.5 | Proactive update |
| Reminder Check | Every hour (:00) | - | Claude Sonnet 4.5 | Check & send pending reminders |

### Whitelist (Approved Chats)
```javascript
APPROVED_CHATS = [
  '120363420201458845@g.us',  // Apex Sports Lab group
  '62811393989@c.us'           // Steven Eka Halim (owner)
]
```

### Nova's WhatsApp ID
```javascript
NOVA_ID = '108835192717483@c.us'
```

---

## 💾 DATABASE (Supabase)

### Tables
1. **messages_v3** - All raw WhatsApp messages
   - chat_id, sender_name, message_text, timestamp
   - mentioned_nova (boolean)
   - has_media, media_type

2. **knowledge_base** - Compiled daily summaries
   - id, date, topic, content, tags
   - Created by midnight compilation job (GPT-4)
   - Currently: 467+ entries covering 3,861+ original messages

3. **reminders** - AI-parsed reminder requests
   - id, assigned_to, reminder_date, reminder_time, message
   - created_by, chat_id, status (pending/sent/cancelled)
   - created_at, sent_at

4. **kb_processing_status** - Compilation tracking
   - last_run_at, last_processed_timestamp
   - Used for midnight recap status checks

---

## 🚀 COMMON COMMANDS

### Local Development
```bash
# Start locally
npm start

# Check logs
pm2 logs apex-assistant

# Install dependencies
npm install
```

### Server Deployment
```bash
# SSH to server
ssh root@157.245.206.68

# Check service status
ssh root@157.245.206.68 "cd /root/apex-assistant && pm2 status"

# View logs
ssh root@157.245.206.68 "cd /root/apex-assistant && pm2 logs apex-assistant --lines 50"

# Deploy single file
scp /Users/stevenekahalim/apex-assistant/src/v3/responseGenerator.js root@157.245.206.68:/root/apex-assistant/src/v3/

# Deploy all files
scp -r /Users/stevenekahalim/apex-assistant/src root@157.245.206.68:/root/apex-assistant/

# Restart service
ssh root@157.245.206.68 "cd /root/apex-assistant && pm2 restart apex-assistant"

# Full deployment + restart
scp -r /Users/stevenekahalim/apex-assistant/src root@157.245.206.68:/root/apex-assistant/ && ssh root@157.245.206.68 "cd /root/apex-assistant && pm2 restart apex-assistant"
```

### Quick Status Check
```bash
# One-liner health check
ssh root@157.245.206.68 "cd /root/apex-assistant && pm2 status && pm2 logs apex-assistant --lines 5 --nostream"
```

---

## 📊 COST ESTIMATES

### Per-Response Costs
- **Nova Response**: ~$0.08-0.09 per message (Claude Sonnet 4.5)
- **Daily Updates**: ~$0.02-0.04 each (2x per day)
- **Midnight Compilation**: ~$0.10-0.15 (GPT-4)
- **Reminder Parsing**: ~Rp 750 (~$0.05) per reminder created
- **Reminder Delivery**: Free (hourly cron job + WhatsApp)

### Monthly Estimate
- **Total**: ~$202/month
- Breakdown:
  - Everyday responses: ~$120/month (50 messages/day)
  - Daily updates: ~$36/month (60 updates/month)
  - Compilations: ~$45/month (30 compilations/month)
  - Reminders: ~$1/month (20 reminders/month)

---

## 🎭 NOVA'S BEHAVIOR

### Response Triggers
Nova responds when:
1. Tagged with `@Nova` (case insensitive)
2. Tagged with `@108835192717483` (numeric ID)
3. Message contains word "nova" as standalone
4. Direct message (private chat)

Nova stays silent when:
- Not mentioned in group chat
- Chat not in whitelist

### Context System (Dual-Context)
1. **Knowledge Base**: 459 compiled entries (historical context)
2. **Today's Raw**: All messages from today (current context)
3. Priority: Today's messages override KB when containing newer info

---

## 🔍 DEBUGGING TIPS

### Check if Nova is running
```bash
ssh root@157.245.206.68 "pm2 status"
```

### Check recent logs for errors
```bash
ssh root@157.245.206.68 "pm2 logs apex-assistant --err --lines 50"
```

### Check if message was processed
```bash
ssh root@157.245.206.68 "pm2 logs apex-assistant --lines 100" | grep "Handling message"
```

### Check mention detection
```bash
ssh root@157.245.206.68 "pm2 logs apex-assistant --lines 100" | grep "mentioned"
```

### Common Issues
1. **404 Model Error**: Model ID doesn't exist → Check Anthropic docs
2. **Not mentioned, staying silent**: Mention detector didn't recognize tag
3. **Missing qrcode module**: Run `npm install qrcode`
4. **Service keeps restarting**: Check logs for crash reason

---

## 📝 QUICK START AFTER RESTART

### 1. Restore Context
```bash
cd /Users/stevenekahalim/apex-assistant
cat PROJECT_CONTEXT.md
```

### 2. Check Service Health
```bash
ssh root@157.245.206.68 "cd /root/apex-assistant && pm2 status && pm2 logs apex-assistant --lines 10 --nostream"
```

### 3. If You Need to Make Changes
```bash
# Edit files locally
# Deploy to server
scp /Users/stevenekahalim/apex-assistant/src/v3/[FILE] root@157.245.206.68:/root/apex-assistant/src/v3/

# Restart
ssh root@157.245.206.68 "cd /root/apex-assistant && pm2 restart apex-assistant"
```

---

## 🎯 PROJECT PHILOSOPHY

**V3 Pure Conversational Architecture**
- No complex state machines
- No structured extraction pipelines
- Let Claude Sonnet 4.5 infer from raw context
- Dual-context for temporal awareness (KB + Today)
- Minimal intervention, maximum intelligence

**Key Principle**: "Only send if there's something worth saying"
- Nova doesn't spam
- Responds when tagged
- Proactive updates only when significant activity exists

---

## 📞 SUPPORT

**Owner**: Steven Eka Halim
**WhatsApp**: +62 811-393-989
**Server**: root@157.245.206.68
**Group**: Apex Sports Lab (120363420201458845@g.us)

---

---

## 🆕 FEATURE STATUS (as of 2025-11-20)

### Active Features
✅ **V3 Pure Conversational** - Core architecture
✅ **Midnight Compilation** - Daily KB updates (00:00 WIB)
✅ **Daily Updates** - Morning (09:00) + Afternoon (15:30)
✅ **AI Reminder System** - Natural language parsing + hourly delivery
✅ **Midnight Recap** - Compilation status in 9 AM updates
✅ **PDF Extraction** - Automatic document content parsing
✅ **Mention Detection** - @Nova, @numeric ID, "nova" keyword

### Scheduled Jobs Running
- 🕐 00:00 WIB - Knowledge Compilation
- 🌅 09:00 WIB - Morning Update (includes midnight recap)
- 📊 15:30 WIB - Afternoon Update
- ⏰ Every hour (:00) - Reminder Check

### Recent Improvements
- Fixed date calculation bug in knowledgeCompiler (Nov 20)
- Added AI-powered reminder system (Nov 20)
- Added midnight recap visibility in 9 AM updates (Nov 20)
- Model upgrade to Claude Sonnet 4.5 (Nov 6)

---

**STATUS**: ✅ All systems operational as of 2025-11-20 10:31 WIB
