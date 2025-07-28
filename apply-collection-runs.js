/**
 * Apply the collection_runs table migration
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = "https://llspbinxevyitinvagvx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function applyCollectionRunsMigration() {
  console.log('📊 Applying collection_runs table migration...');
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync('add-collection-runs.sql', 'utf8');
    
    // Split into individual statements and execute each
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        console.log(`Executing statement ${i + 1}...`);
        
        const { error } = await supabase.rpc('exec_sql', { 
          sql_query: statement 
        });
        
        if (error) {
          console.error(`❌ Error in statement ${i + 1}:`, error);
          return;
        }
      }
    }
    
    console.log('✅ Migration applied successfully!');
    
    // Verify the table was created
    const { data, error } = await supabase
      .from('collection_runs')
      .select('count')
      .limit(1);
      
    if (error) {
      console.error('❌ Error verifying table:', error);
    } else {
      console.log('✅ collection_runs table verified - ready to use!');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

applyCollectionRunsMigration();