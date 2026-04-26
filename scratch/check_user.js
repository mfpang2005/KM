const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // service_role key

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser(email) {
    console.log(`Checking user: ${email}`);
    const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("User Data:", JSON.stringify(data, null, 2));
    }
}

// Get email from first argument
const email = process.argv[2];
if (!email) {
    console.log("Usage: node scratch/check_user.js <email>");
} else {
    checkUser(email);
}
