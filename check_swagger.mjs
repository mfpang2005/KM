
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

async function listAllSchemas() {
    console.log("--- Listing All Accessible Tables across Schemas ---");
    
    // We can try to use a trick to see if we can query standard tables in other schemas
    // But PostgREST usually only exposes schemas explicitly configured.
    // Let's try to query the REST endpoint metadata if possible.
    
    try {
        const resp = await fetch(`${url}/rest/v1/`, {
            headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
        });
        const swagger = await resp.json();
        console.log("Exposed Tables in Schema Cache:");
        const paths = Object.keys(swagger.paths || {});
        paths.forEach(p => {
             if (p !== '/') console.log(` - ${p}`);
        });
        
        if (paths.length <= 1) {
            console.log("No specific tables exposed in root! Checking if they are in public schema...");
        }
    } catch (e) {
        console.log("Failed to fetch Swagger metadata:", e.message);
    }
}

listAllSchemas();
