
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

async function checkMessages() {
    console.log("--- Checking Recent Messages ---");
    const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching messages:", error.message);
        return;
    }

    if (!messages || messages.length === 0) {
        console.log("No messages found in the 'messages' table.");
        return;
    }

    console.log(`Found ${messages.length} recent messages:`);
    messages.forEach(m => {
        console.log(`[${m.created_at}] From: ${m.sender_label} (${m.sender_role}) | To: ${m.receiver_id} | Type: ${m.type} | Content Snippet: ${m.content?.slice(0, 30)}...`);
    });
}

checkMessages();
