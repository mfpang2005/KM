
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envStr = fs.readFileSync('backend/.env', 'utf-8');
const envVars = {};
envStr.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) {
        envVars[key.trim()] = vals.join('=').trim().replace(/['"]/g, '');
    }
});

const url = envVars.SUPABASE_URL;
const serviceKey = envVars.SUPABASE_KEY;

const supabase = createClient(url, serviceKey);

async function listAll() {
    console.log("--- Listing All Users and Roles ---");

    // 1. List Auth Users
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
        console.error("Auth Error:", authError);
        return;
    }

    // 2. List DB Users
    const { data: dbUsers, error: dbError } = await supabase.from('users').select('*');
    if (dbError) {
        console.error("DB Error:", dbError);
        return;
    }

    console.log("Found", users.length, "auth users and", dbUsers?.length, "DB users.");

    users.forEach(u => {
        const dbU = dbUsers.find(du => du.id === u.id);
        console.log(`- ${u.email} (Auth ID: ${u.id})`);
        console.log(`  Auth metadata role: ${u.user_metadata?.role || 'none'}`);
        console.log(`  DB role: ${dbU?.role || 'MISSING'}`);
        console.log(`  Confirmed: ${!!u.email_confirmed_at}`);
    });
}

listAll();
