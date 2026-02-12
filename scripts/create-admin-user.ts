
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Load env vars manually
const envPath = path.resolve(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};

envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^"(.*)"$/, "$1"); // Remove quotes
        env[key] = value;
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
    const email = "josuetercero717@gmail.com";
    const password = "AutolavadoAdmin2026!";
    const fullName = "Josue Tercero";

    console.log(`Creating admin user: ${email}`);
    console.log(`Using Supabase URL: ${supabaseUrl}`);

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                role: "admin", // application role
            },
        },
    });

    if (error) {
        console.error("Error creating user:", error.message);
    } else {
        console.log("User created successfully!");
        console.log("ID:", data.user?.id);
        console.log("Email:", data.user?.email);
        console.log("Please check your email for confirmation if required, or existing configuration.");
    }
}

createAdmin();
