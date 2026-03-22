
import axios from 'axios';
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
const key = envVars.SUPABASE_KEY;

const sql = fs.readFileSync('backend/add_billing_columns.sql', 'utf-8');

async function tryExecSql() {
    console.log("--- Attempting to execute SQL via potential exec_sql RPC ---");
    try {
        const response = await axios.post(`${url}/rest/v1/rpc/exec_sql`, 
            { sql_query: sql }, // common parameter name
            {
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("Response:", response.data);
    } catch (error) {
        if (error.response && error.response.status === 404) {
             console.log("RPC 'exec_sql' not found (404). This is expected if the helper wasn't created.");
        } else {
             console.error("Error:", error.message);
             if (error.response) console.log("Detail:", error.response.data);
        }
    }
}

tryExecSql();
