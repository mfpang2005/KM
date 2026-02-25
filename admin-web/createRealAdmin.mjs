import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let envStr;
try {
    envStr = fs.readFileSync('.env.local', 'utf-8');
} catch (e) {
    envStr = fs.readFileSync('../.env.local', 'utf-8');
}

const envVars = {};
envStr.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) {
        envVars[key.trim()] = vals.join('=').trim().replace(/['"]/g, '');
    }
});

const url = envVars.VITE_SUPABASE_URL || envVars.SUPABASE_URL;
const key = envVars.VITE_SUPABASE_ANON_KEY || envVars.SUPABASE_KEY;

if (!url || !key) {
    console.error("Missing environment variables.");
    process.exit(1);
}

const supabase = createClient(url, key);

async function signUpAdmin() {
    const email = 'acc.kimlonggroup@gmail.com';
    const password = 'password123';

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                role: 'super_admin'
            }
        }
    });

    if (error) {
        if (error.message.includes('already registered')) {
            console.log(`SUCCESS: Account already registered! Please log in using ${email} / ${password}`);
        } else {
            console.error("Sign up failed:", error.message);
        }
    } else {
        console.log("SUCCESS: Successfully signed up!");
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log("\n⚠️ IMPORTANT: You must check your email inbox (acc.kimlonggroup@gmail.com) and click the verification link before you can log in!");
    }
}

signUpAdmin();
