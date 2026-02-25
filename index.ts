/**
 * index.ts
 * --------
 * Entry point / orchestrator for the SQA Portal automation agent.
 *
 * Phase 2: Scrape → JSON → Excel → Email Report
 *
 * Run:  npx ts-node index.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

import { launchAndLogin, scrapeAllProjects, closeBrowser, type IssueRow } from "./scraper";
import { generateExcel } from "./excel";
import { buildEmailBody } from "./mailer";

// ── Configuration ───────────────────────────────────────────────────────────
// Loads .env for local development; in Jenkins, env vars are injected by the pipeline.

// Load .env ONLY for local runs, not Jenkins
if (!process.env.JENKINS_URL) {
    dotenv.config();
}

const MANTIS_USERNAME = process.env.MANTIS_USERNAME ?? "";
const MANTIS_PASSWORD = process.env.MANTIS_PASSWORD ?? "";
const JSON_OUTPUT = path.resolve(__dirname, "open_issues.json");
const EXCEL_OUTPUT = path.resolve(__dirname, "Open_Issues.xlsx");
const HTML_OUTPUT = path.resolve(__dirname, "email_body.html");

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Pretty-print the issues table to the console. */
function printIssuesTable(issues: IssueRow[]): void {
    if (issues.length === 0) {
        console.log("       (no open issues found)");
        return;
    }

    // Calculate column widths
    const cols: (keyof IssueRow)[] = ["id", "project", "severity", "status", "assignee", "resolution", "summary"];
    const headers = ["ID", "Project", "Severity", "Status", "Assignee", "Resolution", "Summary"];
    const widths = headers.map((h, i) => {
        const colKey = cols[i];
        return Math.max(h.length, ...issues.map((r) => r[colKey].length));
    });

    const pad = (str: string, w: number) => str.padEnd(w);
    const sep = widths.map((w) => "─".repeat(w)).join("─┼─");

    // Header
    console.log();
    console.log(
        "  " + headers.map((h, i) => pad(h, widths[i])).join(" │ ")
    );
    console.log("  " + sep);

    // Rows
    for (const row of issues) {
        const line = cols.map((c, i) => pad(row[c], widths[i])).join(" │ ");
        console.log("  " + line);
    }
    console.log();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("═══════════════════════════════════════════════════");
    console.log("  SQA Portal — Open Issues Report Agent");
    console.log("═══════════════════════════════════════════════════\n");

    // Validate required env vars
    if (!MANTIS_USERNAME || !MANTIS_PASSWORD) {
        throw new Error(
            "Missing MANTIS_USERNAME or MANTIS_PASSWORD environment variables.\n" +
            "Create a .env file from .env.example and fill in the values."
        );
    }

    let page;

    try {
        // Step 1: Launch & Login
        console.log("[1/5] Launching browser and logging in...");
        page = await launchAndLogin(MANTIS_USERNAME, MANTIS_PASSWORD);
        console.log("       ✔ Logged in successfully.\n");

        // Step 2: Scrape open issues
        console.log("[2/5] Scraping open issues across all projects...");
        const issues = await scrapeAllProjects(page);
        console.log(`       ✔ Found ${issues.length} total open issue(s).`);

        // Print the table to the console
        printIssuesTable(issues);

        // Step 3: Save JSON
        console.log("[3/5] Saving results to JSON...");
        fs.writeFileSync(JSON_OUTPUT, JSON.stringify(issues, null, 2), "utf-8");
        console.log(`       ✔ Saved to ${JSON_OUTPUT}\n`);

        // Step 4: Generate Excel
        console.log("[4/5] Generating Excel report...");
        await generateExcel(issues, EXCEL_OUTPUT);
        console.log(`       ✔ Saved to ${EXCEL_OUTPUT}\n`);

        // Step 5: Save email HTML body for Jenkins emailext
        console.log("[5/5] Saving email HTML body...");
        const emailHtml = buildEmailBody(issues);
        fs.writeFileSync(HTML_OUTPUT, emailHtml, "utf-8");
        console.log(`       ✔ Saved to ${HTML_OUTPUT}`);

        console.log("\n═══════════════════════════════════════════════════");
        console.log("  ✅  All steps completed successfully!");
        console.log("═══════════════════════════════════════════════════");
    } catch (error) {
        console.error("\n❌ Agent encountered an error:", error);
        process.exitCode = 1;
    } finally {
        if (page) {
            console.log("\n🧹 Closing browser...");
            await closeBrowser(page);
        }
    }
}

// ── Run ─────────────────────────────────────────────────────────────────────

main();
