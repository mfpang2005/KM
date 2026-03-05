import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
    console.log("Testing login for: test_kitchen1@example.com");

    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'test_kitchen1@example.com',
        password: 'password123'
    });

    if (error) {
        console.error("Login failed:", error.message);
        return;
    }

    console.log("Login successful. User ID:", data.user?.id);

    console.log("Fetching user profile...");
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single();

    if (profileError) {
        console.error("Failed to fetch profile:", profileError.message);
    } else {
        console.log("Profile fetched successfully:", profile);
    }
}

testLogin();
