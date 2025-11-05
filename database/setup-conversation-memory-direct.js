require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🗄️  CONVERSATION MEMORY TABLE SETUP\n');
console.log('📋 To create the conversation_history table:\n');
console.log('1. Open Supabase Dashboard:');
console.log('   https://supabase.com/dashboard/project/rexuplchcdqfelcukryh/editor\n');
console.log('2. Click "SQL Editor" → "New Query"\n');
console.log('3. Copy the SQL below:\n');
console.log('═'.repeat(80));

// Read and display the SQL
const sqlPath = path.join(__dirname, 'create-conversation-memory.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
console.log(sql);

console.log('═'.repeat(80));
console.log('\n4. Paste it in the SQL Editor');
console.log('5. Click "Run" or press Cmd/Ctrl + Enter');
console.log('\n✅ Table will be created with indexes and TTL support!');
console.log('\n📊 Features:');
console.log('  • 30-minute conversation memory');
console.log('  • Automatic context extraction');
console.log('  • Optimized queries for fast retrieval');
console.log('  • Built-in cleanup function\n');
