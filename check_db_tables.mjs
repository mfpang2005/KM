
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

async function checkInfrastructure() {
    console.log("--- Checking Database Infrastructure ---");

    // 1. Check schemas/tables using RPC if possible, or just raw query
    // Since we don't know the RPC names, let's try querying information_schema
    const { data: tables, error: tableError } = await supabase.rpc('get_tables_info'); // Might not exist
    
    if (tableError) {
        console.log("RPC get_tables_info failed, trying direct select on information_schema (might fail due to RLS/Permissions)...");
        // Usually anonymous/service_role can't see information_schema via PostgREST unless exposed
    }

    const testTables = ['users', 'orders', 'audit_logs', 'customers', 'order_items', 'products'];
    for (const table of testTables) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`[FAILED] Table '${table}': ${error.message} (${error.code})`);
        } else {
            console.log(`[OK] Table '${table}': Count = ${count}`);
        }
    }
}

checkInfrastructure();
