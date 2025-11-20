require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function createHendryReminder() {
  console.log('📅 Creating Hendry\'s Monday RKAB Reminder...');
  console.log('');

  // Calculate next Monday
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;

  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);

  const reminderDate = nextMonday.toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`Next Monday: ${reminderDate}`);
  console.log('');

  try {
    const { data, error } = await supabase
      .from('reminders')
      .insert({
        assigned_to: 'Hendry',
        reminder_date: reminderDate,
        reminder_time: '09:00:00',
        message: 'Follow up on RKAB contractor discussion from yesterday',
        created_by: 'Nova Setup',
        chat_id: '120363420201458845@g.us', // Apex Sports Lab group
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating reminder:', error);
      process.exit(1);
    }

    console.log('✅ Reminder created successfully!');
    console.log('');
    console.log('📋 Details:');
    console.log(`   ID: ${data.id}`);
    console.log(`   For: ${data.assigned_to}`);
    console.log(`   Date: ${data.reminder_date}`);
    console.log(`   Time: ${data.reminder_time} WIB`);
    console.log(`   Message: ${data.message}`);
    console.log(`   Status: ${data.status}`);
    console.log('');

    // Format for display
    const date = new Date(data.reminder_date + 'T' + data.reminder_time + '+07:00');
    const formattedDate = date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Jakarta'
    });

    console.log('📅 Reminder will be sent:');
    console.log(`   ${formattedDate} at 09:00 WIB`);
    console.log('');
    console.log('🎉 Done! Hendry will be reminded on Monday morning about RKAB.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createHendryReminder();
