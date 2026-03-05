const url = "https://wryhvvakeysdbktvemzo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyeWh2dmFrZXlzZGJrdHZlbXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzY2NDAsImV4cCI6MjA4NzIxMjY0MH0.r4Io7xE4DuOzaHGQoJ21_d-pb_J5_JIDBDplvfKiGsY";

async function test() {
    console.log("Testing POST to /auth/v1/token...");
    try {
        const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
                "apikey": key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: "test_kitchen1@example.com",
                password: "password123"
            })
        });

        const data = await res.json();
        if (!res.ok) {
            console.error("Auth Error:", data);
            return;
        }

        console.log("Auth Success. Expected User ID:", data.user.id);
        console.log("Now testing GET to /rest/v1/users to fetch role...");

        const token = data.access_token;

        const pRes = await fetch(`${url}/rest/v1/users?select=role&id=eq.${data.user.id}`, {
            headers: {
                "apikey": key,
                "Authorization": `Bearer ${token}`
            }
        });

        const pData = await pRes.json();
        if (!pRes.ok) {
            console.error("Profile Error:", pData);
        } else {
            console.log("Profile JSON:", pData);
        }
    } catch (e) {
        console.error("Fetch Exception:", e);
    }
}

test();
