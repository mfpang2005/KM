
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

async function checkOrdersColumns() {
    console.log("--- Checking Orders Table Columns ---");
    const { data, error } = await supabase.from('orders').select('*').limit(1);
    if (error) {
        console.error("Error fetching order:", error);
    } else if (data && data.length > 0) {
        console.log("Columns in 'orders' table:", Object.keys(data[0]));
    } else {
        console.log("No data in 'orders' table to check columns.");
    }
}

checkOrdersColumns();
