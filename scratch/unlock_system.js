const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function unlockSystem() {
    console.log("Unlocking system authorization...");
    const { data, error } = await supabase
        .from('system_config')
        .upsert({
            key: 'admin_app_auth',
            value: { authorized: true },
            updated_at: new Date().toISOString()
        })
        .execute();
        
    if (error) {
        console.error("Failed to unlock:", error.message);
    } else {
        console.log("System unlocked successfully!");
    }
}

unlockSystem();
