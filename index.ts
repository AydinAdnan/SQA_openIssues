/**
 * index.ts
 * --------
 * Entry point / orchestrator for the SQA Portal automation agent.
 *
 * Phase 2: Scrape → JSON → Excel → Email Report
 *
 * Run:  npx ts-node index.ts
 */

// Load the dotenv library so we can read variables from a .env file
import * as dotenv from "dotenv";

// Load Node's built-in path module to construct absolute file paths safely
import * as path from "path";

// Load Node's built-in fs module to read/write files on disk
import * as fs from "fs";

// Import scraper functions and the IssueRow type from our scraper module
// - launchAndLogin  → opens Chromium and logs into MantisBT
// - scrapeAllProjects → loops every project and collects open issues
// - closeBrowser    → shuts down Chromium cleanly
// - IssueRow        → TypeScript interface that describes one issue record
import { launchAndLogin, scrapeAllProjects, closeBrowser, type IssueRow } from "./scraper";

// Import the function that creates a styled .xlsx file from the issues array
import { generateExcel } from "./excel";

// Import the function that converts the issues array into an HTML email body
import { buildEmailBody } from "./mailer";

// ── Configuration ───────────────────────────────────────────────────────────
// Loads .env for local development; in Jenkins, env vars are injected by the pipeline.

// Only call dotenv.config() when NOT running inside Jenkins.
// Jenkins injects secrets as real environment variables, so calling dotenv would be harmless
// but unnecessary.  Keeping it conditional makes the intent explicit.
if (!process.env.JENKINS_URL) {
    dotenv.config(); // reads .env file and adds its key=value pairs to process.env
}

// Read the Mantis username from the environment; fall back to "" if missing
const MANTIS_USERNAME = process.env.MANTIS_USERNAME ?? "";

// Read the Mantis password from the environment; fall back to "" if missing
const MANTIS_PASSWORD = process.env.MANTIS_PASSWORD ?? "";

// Build the full absolute path for the JSON output file
// __dirname is the directory this script lives in
const JSON_OUTPUT = path.resolve(__dirname, "open_issues.json");

// Build the full absolute path for the Excel output file
const EXCEL_OUTPUT = path.resolve(__dirname, "Open_Issues.xlsx");

// Build the full absolute path for the HTML email body file
const HTML_OUTPUT = path.resolve(__dirname, "email_body.html");

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Pretty-print the issues table to the console. */
function printIssuesTable(issues: IssueRow[]): void {
    // If there are no issues, print a simple message and stop
    if (issues.length === 0) {
        console.log("       (no open issues found)");
        return; // exit the function early — nothing more to do
    }

    // Define which IssueRow properties map to each column (in display order)
    const cols: (keyof IssueRow)[] = ["id", "project", "severity", "status", "assignee", "resolution", "summary"];

    // Human-readable header labels that correspond to the cols array above
    const headers = ["ID", "Project", "Severity", "Status", "Assignee", "Resolution", "Summary"];

    // Calculate the required width for each column dynamically:
    // it must be at least as wide as the header text, OR the longest data value
    const widths = headers.map((h, i) => {
        const colKey = cols[i]; // e.g. "id", "project", ...
        // Math.max picks the biggest number: header length vs. every cell's text length
        return Math.max(h.length, ...issues.map((r) => r[colKey].length));
    });

    // Helper: pad a string with trailing spaces until it reaches width w
    const pad = (str: string, w: number) => str.padEnd(w);

    // Build the horizontal separator line using box-drawing characters
    // e.g.  "────┼────┼────"
    const sep = widths.map((w) => "─".repeat(w)).join("─┼─");

    // ── Print header row ─────────────────────────────────────────────
    console.log(); // blank line for visual spacing

    // Print each header padded to its column width, separated by " │ "
    console.log(
        "  " + headers.map((h, i) => pad(h, widths[i])).join(" │ ")
    );

    // Print the separator line beneath the header
    console.log("  " + sep);

    // ── Print data rows ──────────────────────────────────────────────
    for (const row of issues) {
        // Build one line: each field padded to its column width
        const line = cols.map((c, i) => pad(row[c], widths[i])).join(" │ ");
        console.log("  " + line);
    }

    console.log(); // trailing blank line for visual spacing
}

// ── Main ────────────────────────────────────────────────────────────────────

// The async keyword means this function can use `await` for asynchronous operations
// (like browser navigation, file writing, etc.)
async function main(): Promise<void> {
    // Print a decorative banner so the log is easy to read in the terminal / Jenkins output
    console.log("═══════════════════════════════════════════════════");
    console.log("  SQA Portal — Open Issues Report Agent");
    console.log("═══════════════════════════════════════════════════\n");

    // Guard: if credentials weren't supplied, stop immediately and tell the user how to fix it
    if (!MANTIS_USERNAME || !MANTIS_PASSWORD) {
        throw new Error(
            "Missing MANTIS_USERNAME or MANTIS_PASSWORD environment variables.\n" +
            "Create a .env file from .env.example and fill in the values."
        );
    }

    // Declare page outside the try block so the finally block can access it for cleanup
    let page;

    try {
        // ── Step 1: Launch browser and log in ─────────────────────────────
        console.log("[1/5] Launching browser and logging in...");

        // launchAndLogin opens headless Chromium, navigates to the login URL,
        // fills credentials, and returns an authenticated Playwright Page object
        page = await launchAndLogin(MANTIS_USERNAME, MANTIS_PASSWORD);

        console.log("       ✔ Logged in successfully.\n");

        // ── Step 2: Scrape open issues across every configured project ────
        console.log("[2/5] Scraping open issues across all projects...");

        // scrapeAllProjects iterates TARGET_PROJECTS, applies the "open" filter,
        // and returns every matching row as a flat IssueRow array
        const issues = await scrapeAllProjects(page);

        // Log how many rows were collected in total
        console.log(`       ✔ Found ${issues.length} total open issue(s).`);

        // Display the issues as a formatted table in the console / build log
        printIssuesTable(issues);

        // ── Step 3: Persist issues as JSON ────────────────────────────────
        console.log("[3/5] Saving results to JSON...");

        // JSON.stringify converts the JS array to a formatted JSON string (2-space indent)
        // writeFileSync saves it synchronously to disk (blocks until complete)
        fs.writeFileSync(JSON_OUTPUT, JSON.stringify(issues, null, 2), "utf-8");

        console.log(`       ✔ Saved to ${JSON_OUTPUT}\n`);

        // ── Step 4: Generate a styled Excel workbook ───────────────────────
        console.log("[4/5] Generating Excel report...");

        // generateExcel uses ExcelJS to create an .xlsx file with headers,
        // borders, colour-coded header row, and alternating row shading
        await generateExcel(issues, EXCEL_OUTPUT);

        console.log(`       ✔ Saved to ${EXCEL_OUTPUT}\n`);

        // ── Step 5: Write the HTML email body for Jenkins emailext ────────
        console.log("[5/5] Saving email HTML body...");

        // buildEmailBody converts the issues array into a fully-styled HTML string
        const emailHtml = buildEmailBody(issues);

        // Write that HTML string to disk so the Jenkinsfile can reference it
        // with the EMAIL_HTML_BODY environment variable or attach it inline
        fs.writeFileSync(HTML_OUTPUT, emailHtml, "utf-8");

        console.log(`       ✔ Saved to ${HTML_OUTPUT}`);

        // Print the final success banner
        console.log("\n═══════════════════════════════════════════════════");
        console.log("  ✅  All steps completed successfully!");
        console.log("═══════════════════════════════════════════════════");

    } catch (error) {
        // If anything above threw an error, log it with a clear marker
        console.error("\n❌ Agent encountered an error:", error);

        // Setting exitCode (instead of calling process.exit()) lets the finally block run
        // A non-zero exit code signals failure to Jenkins and marks the build as FAILED
        process.exitCode = 1;

    } finally {
        // This block always runs — success or failure — ensuring we clean up
        if (page) {
            console.log("\n🧹 Closing browser...");

            // Close the page, browser context, and the Chromium process itself
            await closeBrowser(page);
        }
    }
}

// ── Run ─────────────────────────────────────────────────────────────────────

// Kick off the orchestrator.  Because main() is async, Node will keep the
// process alive until the returned Promise settles (resolves or rejects).
main();
