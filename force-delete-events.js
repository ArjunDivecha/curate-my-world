// Force delete all events to clean up database
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://llspbinxevyitinvagvx.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzY3OTc1NSwiZXhwIjoyMDY5MjU1NzU1fQ.YvIqhJhk2R2J9UUPqKxhIdRTUnJdWuUm_rqMcX2VZAE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function forceDeleteAllEvents() {
  console.log('🗑️ Force deleting all events...');
  
  try {
    // First, let's see what events exist
    const { data: existingEvents, error: fetchError } = await supabase
      .from('events')
      .select('id, title, source, created_at');
    
    if (fetchError) {
      console.error('Error fetching events:', fetchError);
      return;
    }
    
    console.log(`Found ${existingEvents?.length || 0} events to delete:`);
    existingEvents?.forEach((event, index) => {
      console.log(`${index + 1}. ${event.title} (${event.source}) - ${event.created_at}`);
    });
    
    // Delete all events using service role key (bypasses RLS)
    const { data, error } = await supabase
      .from('events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all events (dummy condition)
    
    if (error) {
      console.error('❌ Error deleting events:', error);
    } else {
      console.log('✅ Successfully deleted all events\!');
      console.log('Deleted events:', data);
    }
    
    // Verify deletion
    const { data: remainingEvents, error: verifyError } = await supabase
      .from('events')
      .select('id, title');
    
    if (verifyError) {
      console.error('Error verifying deletion:', verifyError);
    } else {
      console.log(`${remainingEvents?.length || 0} events remaining after deletion.`);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

forceDeleteAllEvents();
EOF < /dev/null