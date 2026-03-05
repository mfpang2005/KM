
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

async function checkUser() {
    console.log("--- Checking Admin User Status ---");
    const email = 'acc.kimlonggroup@gmail.com';

    // 1. Check Auth.users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
        console.error('Failed to list users:', listError);
        return;
    }

    const adminAuthUser = users.find(u => u.email === email);
    if (!adminAuthUser) {
        console.log(`[AUTH] User ${email} NOT found.`);
    } else {
        console.log(`[AUTH] User found: ID=${adminAuthUser.id}, Confirmed=${adminAuthUser.email_confirmed_at}`);
    }

    // 2. Check public.users table
    if (adminAuthUser) {
        const { data: dbUser, error: dbError } = await supabase
            .from('users')
            .select('*')
            .eq('id', adminAuthUser.id)
            .single();

        if (dbError) {
            console.error(`[DB] Error fetching user from public.users:`, dbError.message);
        } else if (!dbUser) {
            console.log(`[DB] User NOT found in public.users table.`);
        } else {
            console.log(`[DB] User found in public.users:`, dbUser);
        }
    }
}

checkUser();
