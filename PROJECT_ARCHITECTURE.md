# 🚨 PROJECT ARCHITECTURE - V3 ONLY

**IMPORTANT: This project uses V3 architecture EXCLUSIVELY. V1 and V2 have been permanently removed.**

## Architecture: V3 (Pure Conversational)

V3 is a **pure conversational architecture** - it stores ALL messages in full and lets AI infer context naturally, rather than attempting structured extraction.

### ✅ ALLOWED (V3 Architecture)

**Modules:**
- `src/v3/` - V3 architecture (ONLY valid code)
- `src/whatsapp/client.js` - Shared WhatsApp client
- `src/ai/openai.js` - Shared OpenAI wrapper
- `src/database/supabase.js` - Shared Supabase client
- `src/utils/` - Shared utilities
- `src/prompts/response.js` - Nova's personality (V3 only)

**Database Tables (Supabase):**
- `messages_v3` - Full message storage (all WhatsApp messages)
- `hourly_notes` - Hourly conversation summaries
- `daily_digests_v3` - Daily digest summaries

### ❌ FORBIDDEN (V1/V2 - DELETED)

**DO NOT:**
- Create or use any V1/V2 modules
- Reference V1/V2 database tables
- Implement structured extraction (that's V2 philosophy)
- Use conversation_messages, conversation_sessions, projects, project_facts tables

**Deleted modules (DO NOT recreate):**
- `src/memory/` - V2 memory system (DELETED)
- `src/jobs/sessionSummarizer.js` - V2 summarizer (DELETED)
- `src/scheduler.js` - V2 scheduler (DELETED)
- `src/whatsapp/messageHandler.js` - V2 handler (DELETED)
- `src/whatsapp/conversationalCore.js` - V2 conversational (DELETED)
- `src/ai/classifier.js` - V2 classifier (DELETED)

## V3 Philosophy

### Core Principles
1. **Store everything** - All messages stored verbatim in messages_v3
2. **AI infers naturally** - No forced structure, let AI interpret context
3. **Conversational memory** - Messages + hourly notes + daily digests
4. **Minimal personality** - Simple, dynamic prompt in `src/prompts/response.js`

### How It Works

1. **Message Flow:**
   - User sends WhatsApp message
   - V3 handler saves to `messages_v3`
   - Checks if Nova should respond (@ mention or DM)
   - Loads context (recent messages + hourly notes + daily digests)
   - Generates response using OpenAI with full context
   - Sends response

2. **Background Jobs:**
   - **Hourly Notes:** Every hour, summarize last hour's messages
   - **Daily Digests:** Every midnight, create daily summary

3. **Context Loading:**
   - Loads ALL messages from chat (no time limit by default)
   - Loads recent hourly notes (last 24 hours)
   - Loads daily digests (last 30 days)
   - Smart GPT model selection based on context size

## File Structure

```
src/
├── v3/                          # V3 ARCHITECTURE (ONLY VALID CODE)
│   ├── index.js                 # V3 entry point
│   ├── messageHandler.js        # V3 message handler
│   ├── contextLoader.js         # Load conversational context
│   ├── responseGenerator.js     # Generate AI responses
│   ├── mentionDetector.js       # Detect @Nova mentions
│   ├── hourlyNotesJob.js        # Hourly summary job
│   └── dailyDigestJob.js        # Daily digest job
│
├── whatsapp/
│   └── client.js                # Shared WhatsApp client
│
├── ai/
│   └── openai.js                # Shared OpenAI wrapper
│
├── database/
│   └── supabase.js              # Shared Supabase client
│
├── prompts/
│   └── response.js              # Nova's personality (V3 only)
│
├── utils/
│   └── logger.js                # Shared logger
│
└── index.js                     # Main entry point (V3 ONLY)
```

## For Future AI Assistants (Claude Code, etc.)

**IF YOU SEE:**
- Any code trying to use V1/V2 modules
- References to V1/V2 database tables
- Imports from deleted folders (memory/, jobs/, scheduler/)
- USE_V3 environment variable checks

**THEN:**
- ⛔ **STOP IMMEDIATELY**
- 🚨 Alert the user that V1/V2 code is being used
- ✅ Refactor to use V3 architecture only
- 📖 Read this document and src/v3/ code to understand V3

## Environment Variables

Required:
- `OPENAI_API_KEY` - OpenAI API key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key (not anon key)
- `PORT` - Health server port (optional, default 3000)

**NO LONGER USED:**
- ~~`USE_V3`~~ - Removed, always V3 now

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your keys

# Run locally
npm start

# Deploy with PM2 (production)
pm2 start src/index.js --name apex-assistant
pm2 save
```

## Need Help?

1. Read V3 code in `src/v3/`
2. Check Nova's personality in `src/prompts/response.js`
3. Look at V3 tables in Supabase
4. This is a **pure conversational** architecture - let AI infer, don't force structure

---

**Remember: V3 ONLY. V1/V2 are gone forever. If you see any V1/V2 references, they are mistakes that must be fixed.**
