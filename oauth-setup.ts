/**
 * oauth-setup.ts
 * --------------
 * Run this ONCE manually to generate your Google OAuth2 refresh token.
 *
 * Usage:
 *   npx ts-node oauth-setup.ts
 *
 * It will open a local server, print a URL → open it in your browser →
 * Google redirects back automatically → the refresh token is printed.
 * Copy it into your .env as GOOGLE_REFRESH_TOKEN.
 *
 * IMPORTANT: Add http://localhost:3000/callback as an authorized redirect
 * URI in your GCP OAuth 2.0 client before running this script.
 */

import * as http from "http";
import * as dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const REDIRECT_URI  = "http://localhost:3000/callback";
const PORT          = 3000;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env first.");
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
});

console.log("\n═══════════════════════════════════════════════════");
console.log("  Google OAuth2 Setup — SQA Portal");
console.log("═══════════════════════════════════════════════════\n");
console.log("Waiting for Google to redirect back...");
console.log("\nOpen this URL in your browser:\n");
console.log(" ", authUrl, "\n");

// Start a temporary local server to capture the OAuth callback
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${PORT}`);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h2>❌ Authorization denied: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        process.exit(1);
    }

    if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h2>❌ No code received.</h2><p>You can close this tab.</p>");
        server.close();
        process.exit(1);
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>✅ Authorization successful!</h2><p>You can close this tab and return to the terminal.</p>");
        server.close();

        console.log("✅ Success! Add this to your .env file:\n");
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log("\n⚠  Keep your refresh token secret — treat it like a password.\n");

    } catch (err) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end("<h2>❌ Token exchange failed.</h2><p>You can close this tab.</p>");
        server.close();
        console.error("\n❌ Failed to exchange code:", err);
        process.exit(1);
    }
});

server.listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}/callback ...`);
});
