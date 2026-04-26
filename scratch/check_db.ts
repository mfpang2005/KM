
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConfig() {
  const { data, error } = await supabase
    .from('system_config')
    .select('*');
  
  if (error) {
    console.error("Error fetching system_config:", error);
  } else {
    console.log("system_config data:", data);
  }
}

checkConfig();
