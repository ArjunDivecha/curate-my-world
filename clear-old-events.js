// Clear old cached events from database
import { createClient } from '@supabase/supabase-js';

const clearOldEvents = async () => {
  console.log('🧹 Clearing old cached events from database...\n');
  
  const supabaseUrl = 'https://llspbinxevyitinvagvx.supabase.co';
  const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzU2MjU2MSwiZXhwIjoyMDUzMTM4NTYxfQ.TRzwHJx9p4DjqmoBZ-fLJxTlJUbhWfllzQOjIl0RNWE';
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Delete all existing events
    const { data, error } = await supabase
      .from('events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (error) {
      console.error('❌ Error clearing events:', error);
      return;
    }
    
    console.log('✅ Successfully cleared all old cached events');
    console.log('📝 Database is now clean and ready for fresh Providence events');
    console.log('\n💡 Now go to your app and click "Fetch Real Events" to get Providence events!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

clearOldEvents();