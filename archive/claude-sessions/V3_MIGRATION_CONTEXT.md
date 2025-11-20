# NOVA V3 MIGRATION - SESSION CONTEXT
**Date:** 2024-11-05
**Session:** Interrupted for MCP server restart
**Status:** Ready to execute database migration via Supabase MCP

---

## CURRENT SITUATION

We are migrating Nova WhatsApp AI Assistant from V2 to V3 architecture.

**Why V3?**
- V2 has architectural issues with fact conflicts
- Structured fact extraction doesn't work for dynamic projects
- User reported: "aku udh bilang arsitek udah deal sama garis lombok, tp di update manado pending: hire arsitek"
- Both facts (Ilalang architect & Garis Lombok architect) were active=true, causing confusion

**V3 Philosophy:**
- Pure conversational approach (like ChatGPT)
- Save raw messages, let AI infer from context
- No structured fact extraction
- Hourly meeting notes (not per-message - less intrusive)
- Daily digests at midnight
- Nova only responds when @tagged in group chat

---

## WHAT WE'VE COMPLETED

### ✅ 1. MCP Setup
- **Package installed:** `@supabase/mcp-server-supabase` v0.5.9
- **Config added** to `.claude.json` for project `/Users/stevenekahalim/apex-assistant`
- **Credentials configured:**
  - SUPABASE_URL: `https://rexuplchcdqfelcukryh.supabase.co`
  - SUPABASE_SERVICE_ROLE_KEY: (configured in .claude.json)
- **Status:** MCP will be active after Claude Code restart

### ✅ 2. V3 Database Schema Created
- **File:** `database/v3_fresh_start.sql`
- **What it does:**
  - Drops all V2 tables (conversation_messages, project_facts, projects, etc.)
  - Creates 3 new V3 tables:
    - `messages_v3` - raw messages with minimal extraction
    - `hourly_notes` - AI-generated hourly summaries
    - `daily_digests_v3` - midnight comprehensive digests
  - Includes helper function `get_recent_context()`
  - Has verification queries

### ✅ 3. V3 Blueprint Documented
- Reduced complexity by 40% vs V2
- 3 tables instead of 5
- Simpler codebase structure

---

## WHAT WE NEED TO DO NEXT

### IMMEDIATE NEXT STEP (After MCP loads)
**Execute database migration using Supabase MCP:**

1. Verify MCP connection works:
   ```bash
   claude mcp list
   # Should show: supabase - ✓ Connected
   ```

2. Use MCP to execute `database/v3_fresh_start.sql`
   - This will DROP all V2 tables (user approved - "lets start from 0")
   - Create fresh V3 schema
   - Verify with built-in checks

### THEN: Build V3 Code

Create these files in `src/v3/`:

**1. contextLoader.js** (~150 lines)
```javascript
class ContextLoader {
  async loadFullContext(chatId) {
    // Load last 100 raw messages (last 7 days)
    // Load last 30 days of daily digests
    // Load last 24 hours of hourly notes
    return { messages, dailyDigests, hourlyNotes };
  }
}
```

**2. responseGenerator.js** (~100 lines)
```javascript
class ResponseGenerator {
  async generate(message, context) {
    // Build prompt with full context
    // Call OpenAI GPT-3.5-turbo
    // Return response (max 5 lines, Nova personality)
  }
}
```

**3. mentionDetector.js** (~50 lines)
```javascript
class MentionDetector {
  detectMention(messageText) {
    // Check for @Nova or @nova
    // Return boolean
  }
}
```

**4. messageHandler.js** (~200 lines)
```javascript
class MessageHandler {
  async handleMessage(message, chatContext) {
    // Save to messages_v3
    // If @mentioned or DM: load context + generate response
    // Otherwise: just save, stay silent
  }
}
```

**5. hourlyNotesJob.js** (~100 lines)
```javascript
// Cron job: every hour
// Load messages from last hour
// Generate AI summary with key decisions/actions
// Save to hourly_notes table
```

**6. dailyDigestJob.js** (~150 lines)
```javascript
// Cron job: midnight (00:00 WIB)
// Load all messages from today
// Generate comprehensive summary
// Extract projects, decisions, blockers, financials
// Save to daily_digests_v3 table
```

**7. index.js** (~50 lines)
```javascript
// V3 entry point
// Export all V3 modules
```

### THEN: Add V3 Toggle

**8. Modify `src/index.js`:**
```javascript
const USE_V3 = process.env.USE_V3 === 'true';

if (USE_V3) {
  const v3 = require('./v3');
  // Use V3 handlers
} else {
  // Use V2 handlers (current)
}
```

### THEN: Deploy & Test

**9. Deploy to production:**
```bash
ssh root@157.245.206.68
cd /root/apex-assistant
git pull
npm install
# Test with V2 first (USE_V3=false)
pm2 restart apex-assistant
# Watch logs
pm2 logs apex-assistant
```

**10. Switch to V3:**
```bash
# Add USE_V3=true to .env
pm2 restart apex-assistant
# Monitor for 24 hours
```

---

## KEY TECHNICAL DETAILS

### V2 vs V3 Architecture

**V2 (Current - Being Removed):**
- 5 tables with complex relationships
- AI extracts structured facts from every message
- Classification system (PROJECT_UPDATE, QUESTION, etc.)
- Facts can conflict (no superseding logic implemented)
- Responds to every message (intrusive)

**V3 (New - Implementing):**
- 3 simple tables
- Raw message storage, AI infers from full context
- No classification needed
- No fact conflicts (just raw conversation)
- Only responds when @tagged

### Database Schema V3

**messages_v3:**
- id, message_text, sender_name, sender_number
- chat_id, chat_name, timestamp
- mentioned_nova (boolean)
- Indexed by: chat_id + timestamp

**hourly_notes:**
- id, chat_id, hour_timestamp
- summary_text, key_decisions[], action_items[]
- message_count, participants[]

**daily_digests_v3:**
- id, chat_id, digest_date
- summary_text
- projects_discussed[], key_decisions[], blockers_identified[]
- financial_mentions (JSONB)
- message_count, participants[]

### Critical Files Created

1. **database/v3_fresh_start.sql** - Ready to execute
2. **src/whatsapp/conversationalCore.js** - Context loading logic (V2, will inform V3)
3. **src/prompts/response.js** - Nova personality prompt

### Environment Variables

```bash
# Supabase
SUPABASE_URL=https://rexuplchcdqfelcukryh.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI
OPENAI_API_KEY=sk-proj-F9fnPggzHK3GVLs1OjrrrmajYGu7qxrE...

# V3 Toggle
USE_V3=true  # Will add after V3 is built
```

---

## USER DECISIONS & APPROVALS

1. ✅ **User approved wiping database:** "Its ok, dont worry about old data in personal assistant project. Lets start from 0, erase everything in supabase for the Nova project."

2. ✅ **User wants MCP for direct database access:** "No i want to proceed with MCP, i want you to have full access and can edit. I trust you."

3. ✅ **User prioritizes no errors over data preservation:** "we prioritze %success rate / no errors. Its ok if we start everything or erase everything from scractch"

4. ✅ **User confirmed V3 approach:** Approved the pure conversational design with hourly notes + daily digests + @tag-only responses

---

## PRODUCTION SERVER INFO

- **IP:** 157.245.206.68
- **User:** root
- **Project Path:** /root/apex-assistant
- **Process Manager:** PM2
- **App Name:** apex-assistant
- **Logs:** `pm2 logs apex-assistant`

---

## CONTINUATION PROMPT

When you restart Claude Code, load this file with:
```bash
@.claude/V3_MIGRATION_CONTEXT.md
```

Then say:
**"Continue with Nova V3 migration. Use Supabase MCP to execute database/v3_fresh_start.sql, then build all V3 code files."**

---

## SESSION NOTES

- Previous session summary shows long history of testing conversational fix, discovering fact conflicts, deciding on V3
- User is CEO of Apex Sports Lab (padel court projects)
- Nova tracks 5-item checklist across 5 projects (Manado, Jakarta Kuningan, BSD, Palembang, Bali)
- User speaks Indonesian/English mix (Jaksel style)
- User values directness, speed, and zero errors

---

## IMPORTANT: MCP IS NOW CONFIGURED

After restarting Claude Code:
- Supabase MCP will be loaded automatically
- Available tools will include database operations
- Can execute SQL directly via MCP
- Can query tables, insert data, drop tables, etc.

**First command after restart:**
```bash
claude mcp list
```

Should show:
```
supabase: npx -y @supabase/mcp-server-supabase - ✓ Connected
```

Then we proceed with database migration!
