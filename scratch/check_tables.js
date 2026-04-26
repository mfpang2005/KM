const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // service_role key

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    console.log("Checking tables...");
    
    const { data: users, error: usersError } = await supabase.from('users').select('count').limit(1);
    console.log("Table 'users':", usersError ? `Error: ${usersError.message}` : `Success, count: ${JSON.stringify(users)}`);
    
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('count').limit(1);
    console.log("Table 'profiles':", profilesError ? `Error: ${profilesError.message}` : `Success, count: ${JSON.stringify(profiles)}`);
}

checkTables();
