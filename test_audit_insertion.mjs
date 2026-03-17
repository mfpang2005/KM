
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

async function testInsert() {
    console.log("--- Testing Audit Log Insertion ---");
    const testData = {
        actor_id: '00000000-0000-0000-0000-000000000000',
        actor_role: 'system_test',
        action: 'test_insert',
        target: 'test_target',
        detail: { message: 'This is a test insertion' }
    };

    const { data, error } = await supabase
        .from('audit_logs')
        .insert(testData)
        .select();

    if (error) {
        console.error("Insertion failed:", error);
    } else {
        console.log("Insertion successful:", data);
    }
}

testInsert();
