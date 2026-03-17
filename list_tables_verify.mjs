
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

async function listTables() {
    console.log("--- Listing All Public Tables ---");
    // Attempting to query information_schema directly via RPC if it doesn't work via table()
    // However, usually we can't query information_schema via PostgREST.
    // Let's try to query a table we KNOW exists and see if it works.
    
    const testTables = ['users', 'orders', 'audit_logs', 'customers', 'order_items', 'products', 'system_config'];
    for (const table of testTables) {
        try {
            const { data, error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
            if (error) {
                console.log(`[ERROR] ${table}: ${error.message} (${error.code})`);
            } else {
                console.log(`[OK] ${table}: Found.`);
            }
        } catch (e) {
            console.log(`[CATCH] ${table}: ${e.message}`);
        }
    }
}

listTables();
