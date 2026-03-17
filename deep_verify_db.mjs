
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

async function deepVerify() {
    console.log("--- Deep Verification of Tables ---");
    const tables = ['audit_logs', 'customers', 'order_items'];
    
    for (const table of tables) {
        console.log(`Verifying table: ${table}`);
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`[FAILED] ${table}: ${error.message} (${error.code})`);
        } else {
            console.log(`[SUCCESS] ${table}: Data = `, data);
        }
    }
}

deepVerify();
