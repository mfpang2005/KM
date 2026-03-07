import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wryhvvakeysdbktvemzo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyeWh2dmFrZXlzZGJrdHZlbXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzY2NDAsImV4cCI6MjA4NzIxMjY0MH0.r4Io7xE4DuOzaHGQoJ21_d-pb_J5_JIDBDplvfKiGsY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log("Verifying Supabase connection...");
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'acc.kimlonggroup@gmail.com',
        password: 'password123' // I'm assuming this is the password based on previous context or common tests
    });

    if (error) {
        console.error("Supabase Login Failed:", error.message);
    } else {
        console.log("Supabase Login Success for acc.kimlonggroup@gmail.com");
        console.log("User ID:", data.user.id);
    }
}

verify();
