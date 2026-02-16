# Helper Script: Delete All Custom Lots

This script will be used to clean up the unwanted custom lots.

```typescript

// Script to delete all custom lots by creating a temp user
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://dfkxffdplikdyhuvubnr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma3hmZmRwbGlrZHlodXZ1Ym5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjI5NTksImV4cCI6MjA4NjU5ODk1OX0.cTJoF4JC2j7qw8QGt2JNcXupIQEDvdwbCUOfm-fGOAI";
const BACKEND_URL = "https://dfkxffdplikdyhuvubnr.supabase.co/functions/v1/server";

const email = `cleanup_${ Date.now() } @rutgers.edu`;
const password = "TemporaryPassword123!";

async function cleanup() {
  console.log(`1. Creating temporary user: ${ email } `);
  const signupRes = await fetch(`${ BACKEND_URL }/signup`, {
method: "POST",
    headers: { "Content-Type": "application/json" },
body: JSON.stringify({ email, password, name: "Cleanup Bot" })
  });

if (!signupRes.ok) {
    const txt = await signupRes.text();
    console.error("Signup failed:", txt);
    // If user already exists, try login
    if (!txt.includes("already registered")) return;
}

console.log("2. Logging in to get access token...");
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error || !data.session) {
    console.error("Login failed:", error);
    return;
}

const token = data.session.access_token;
console.log("Logged in successfully.");

console.log("3. Fetching lots...");
const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
};

const lotsRes = await fetch(`${BACKEND_URL}/lots`, { headers });
const lotsData = await lotsRes.json();

if (!lotsData.lots) {
    console.log("No lots found or error:", lotsData);
    return;
}

const customLots = lotsData.lots.filter((lot: any) => lot.id.startsWith("custom:"));
console.log(`Found ${customLots.length} custom lots to delete.`);

for (const lot of customLots) {
    console.log(`Deleting lot: ${lot.name} (${lot.id})`);
    const deleteRes = await fetch(`${BACKEND_URL}/lots/custom/${lot.id}`, {
        method: "DELETE",
        headers
    });
    if (deleteRes.ok) {
        console.log(`  Deleted ${lot.id}`);
    } else {
        console.error(`  Failed to delete ${lot.id}: ${deleteRes.status}`);
    }
}
console.log("Cleanup complete.");
}

cleanup();
