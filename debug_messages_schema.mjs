import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
    console.log("Checking messages table columns...");
    // Try to insert a dummy message to see the error or columns
    const { data, error } = await supabase.from('messages').select('*').limit(1);
    if (error) {
        console.error("Error selecting from messages:", error);
    } else {
        console.log("Found messages data preview:", data);
        // We can't easily get column types via select * if it's empty, 
        // but we can check if it exists.
    }
    
    // Attempt to get column info via a standard query if possible, 
    // or just try an insert with string ID and see if it fails.
    const testId = "test-string-id-" + Date.now();
    const { error: insertError } = await supabase.from('messages').insert([{
        id: testId,
        sender_id: '00000000-0000-0000-0000-000000000000',
        sender_label: 'Debug',
        sender_role: 'system',
        receiver_id: 'GLOBAL',
        content: 'ping',
        type: 'text'
    }]);
    
    if (insertError) {
        console.error("Insert failed (likely schema mismatch or missing table):", insertError);
    } else {
        console.log("Insert succeeded! String IDs are supported.");
        // Clean up
        await supabase.from('messages').delete().eq('id', testId);
    }
}

checkSchema();
baundary%SAME%
