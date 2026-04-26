const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Read .env from root
const envPath = 'c:/Users/User/Downloads/kim-long-smart-catering-system/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConfig() {
    console.log("Checking system_config...");
    const { data, error } = await supabase
        .from('system_config')
        .select('*')
        .eq('key', 'admin_app_auth');
    
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Config 'admin_app_auth':", JSON.stringify(data, null, 2));
    }
}

checkConfig();
