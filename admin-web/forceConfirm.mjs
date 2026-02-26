import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envStr = fs.readFileSync('../backend/.env', 'utf-8');
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

async function confirmUser() {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) {
        console.error('Failed to list users', error);
        return;
    }
    const adminUser = users.find(u => u.email === 'acc.kimlonggroup@gmail.com');
    if (adminUser) {
        const { data, error: updateError } = await supabase.auth.admin.updateUserById(
            adminUser.id,
            { email_confirm: true }
        );
        if (updateError) {
            console.error('Failed to confirm', updateError);
        } else {
            console.log('Successfully confirmed user:', data.user.email);
        }
    } else {
        console.log('Admin user not found in auth.users');
    }
}

confirmUser();
