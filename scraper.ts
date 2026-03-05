/**
 * scraper.ts
 * ----------
 * Handles browser automation via Playwright.
 * - Launches headless Chromium
 * - Logs into MantisBT
 * - Navigates to View Issues with "open" resolution filter
 * - Scrapes the buglist table
 */

// Node's 'path' module — used to build absolute file paths (e.g. for debug screenshots)
import * as path from "path";

// Import Playwright types and the chromium browser launcher:
// - chromium   → the browser engine we'll automate
// - Browser    → represents the browser process itself
// - BrowserContext → an isolated session (like an incognito window)
// - Page       → a single browser tab / page we can interact with
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// ── Data Model ──────────────────────────────────────────────────────────────

/**
 * Represents a single issue row extracted from the MantisBT table.
 * Using a TypeScript interface enforces that every row has exactly these fields.
 */
export interface IssueRow {
    id: string;         // The numeric Mantis issue ID (stored as string for consistency)
    project: string;    // The project name the issue belongs to
    severity: string;   // e.g. "major", "minor", "crash"
    status: string;     // e.g. "open", "assigned"
    assignee: string;   // The person assigned to this issue (may be empty)
    resolution: string; // Should always be "open" after our filter
    summary: string;    // Short one-line description of the issue
}

// ── Constants ───────────────────────────────────────────────────────────────

// URL of the MantisBT login page where we enter credentials
const LOGIN_URL = "http://sqa.bluebird.co.kr/login_page.php";

// URL of the "View All Bugs" page — we navigate here to apply project/filter selections
const VIEW_ALL_URL = "http://sqa.bluebird.co.kr/view_all_bug_page.php";

/**
 * Device projects to scrape.
 * Key   = the numeric dropdown value Mantis uses internally for each project
 * Value = a human-readable display name used in console logs and reports
 */
export const TARGET_PROJECTS: Record<string, string> = {

    "125": "HF550X_A13_SDM660",
    "147": "HF550X_A14",
    "129": "EF550_A13_SDM660",
    "145": "EF550_A14_SDM660",
    "132": "T10_A14",
    "138": "S10",
    "122": "S20",
    "149": "EK430_A14_SDM660",
    "103": "EF401 Android 10",
    "144": "DXA800 A15",
    "140": "Zbar Barcode Decoder"

};

// ── Private state (module-scoped) ───────────────────────────────────────────

// Hold a reference to the Browser instance so closeBrowser() can shut it down later.
// Initialized to null — we haven't launched anything yet.
let _browser: Browser | null = null;

// Hold a reference to the BrowserContext (isolated session) for the same reason.
let _context: BrowserContext | null = null;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Launch a headless Chromium browser, navigate to the MantisBT login page,
 * authenticate, and return the authenticated Page object.
 */
export async function launchAndLogin(
    username: string, // Mantis username pulled from environment variables
    password: string  // Mantis password pulled from environment variables
): Promise<Page> {

    // Determine headless mode: default is true (no GUI).
    // Set HEADLESS=false in .env to watch the browser while debugging locally.
    const headless = (process.env.HEADLESS ?? "true").toLowerCase() !== "false";

    // Launch Chromium with the determined headless setting and stability flags
    _browser = await chromium.launch({
        headless, // true = no visible window; false = visible browser (for debugging)
        args: [
            '--ignore-certificate-errors',       // skip TLS/SSL certificate warnings
            '--unsafely-treat-insecure-origin-as-secure=http://sqa.bluebird.co.kr', // allow HTTP without blocking
            // CI/Jenkins-specific flags for a containerised / headless Linux environment:
            '--no-sandbox',                      // required in Docker/Jenkins — sandbox needs root privileges
            '--disable-setuid-sandbox',          // companion to --no-sandbox
            '--disable-dev-shm-usage',           // use /tmp instead of /dev/shm to avoid memory errors
            '--disable-gpu',                     // GPU not available in headless CI environments
            '--disable-extensions',              // extensions can interfere with automation
            '--lang=en-US',                      // force UI language to English so selectors are predictable
        ],
    });

    // Create an isolated browser context (like a fresh incognito session)
    _context = await _browser.newContext({
        ignoreHTTPSErrors: true,    // redundant safety net alongside the launch args
        locale: 'en-US',            // forces date/number formatting to US English
        timezoneId: 'Asia/Kolkata', // set timezone so timestamps are consistent with IST
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9' // tell the server to respond in English
        }
    });

    // Open a new tab inside the isolated context
    const page = await _context.newPage();

    // Give every element interaction (clicks, fills, etc.) up to 60 seconds before timing out
    page.setDefaultTimeout(60_000);

    // Give every page navigation up to 60 seconds — important on a slow internal network
    page.setDefaultNavigationTimeout(60_000);

    try {
        // Navigate to the login page and wait until no more network requests are in flight
        await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 60_000 });

        // Some Chromium versions show an HTTP security interstitial before the page loads.
        // Look for the "Continue to site" button; if it's visible, click it to bypass.
        const continueBtn = page.getByRole("button", { name: "Continue to site" });
        if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            // .catch(() => false) prevents isVisible() from throwing when the button is absent
            console.log("       → Bypassing HTTP security warning...");
            await continueBtn.click();                  // dismiss the interstitial
            await page.waitForLoadState("networkidle"); // wait for the real login page to load
        }

        // Wait up to 30 s for the username input field to appear in the DOM
        await page.locator('input[name="username"]').waitFor({ state: "visible", timeout: 30_000 });

        // Type the Mantis username into the field
        await page.locator('input[name="username"]').fill(username);

        // MantisBT uses a two-step login: submit username first, then show the password field.
        // Click the Login button to submit the username form.
        await page.getByRole("button", { name: "Login" }).click();

        // Wait for the page to reload/redirect after username submission
        await page.waitForLoadState("networkidle");

        // Wait for the password field to appear (it only shows after username is accepted)
        await page.locator('input[name="password"]').waitFor({ state: "visible", timeout: 30_000 });

        // Type the Mantis password into the now-visible password field
        await page.locator('input[name="password"]').fill(password);

        // Click the Login button a second time to submit the full credentials
        await page.getByRole("button", { name: "Login" }).click();

        // Wait for the post-login redirect to fully complete
        await page.waitForLoadState("networkidle");

        // Log success so it's visible in the Jenkins build log
        console.log(`       → Logged in as "${username}"`);

        // Return the authenticated page to the caller (index.ts → main)
        return page;

    } catch (error) {
        // If login fails for any reason, capture a full-page screenshot to help diagnose
        const screenshotPath = path.resolve(__dirname, "debug_login_failure.png");
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => { }); // .catch → don't crash if screenshot also fails
        console.error(`       📸 Debug screenshot saved to: ${screenshotPath}`);
        throw error; // re-throw so the caller's catch block handles it
    }
}

/**
 * Navigate to View Issues, apply the "open" resolution filter,
 * and scrape all rows from the buglist table for a single project.
 */
export async function scrapeOpenIssues(page: Page, projectValue: string): Promise<IssueRow[]> {

    // Navigate to the "View All Bugs" page (filter state resets on navigation)
    await page.goto(VIEW_ALL_URL, { waitUntil: "networkidle" });

    // Select the target project from the project dropdown by its numeric value
    await page.locator('select[name="project_id"]').selectOption(projectValue);

    // Click the "Switch" button to apply the project selection
    await page.getByRole("button", { name: "Switch" }).click();

    // Wait for the page to reload with the selected project's issues
    await page.waitForLoadState("networkidle");

    // The "Resolution" filter row is collapsed by default — click its label to expand it
    await page.getByRole("link", { name: "Resolution:" }).click();

    // Wait for the filter panel to fully render after expanding
    await page.waitForLoadState("networkidle");

    // From the expanded resolution dropdown, choose "open" (internal Mantis value = "10")
    await page.locator('select[name="show_resolution[]"]').selectOption("10");

    // Click "Apply Filter" to submit the filter form and reload the issue list
    await page.getByRole("button", { name: "Apply Filter" }).click();

    // Wait until the filtered results are fully loaded
    await page.waitForLoadState("networkidle");

    // Extra 2-second pause: the page's JS may still be rendering the table
    // even after the network is idle, so this prevents premature DOM reads
    await page.waitForTimeout(2000);

    // ── DOM Extraction ──────────────────────────────────────────────────────
    // page.evaluate() runs the provided function inside the browser context
    // (i.e. it has access to `document`, `querySelectorAll`, etc.)
    // It returns a serialisable value (plain object/array) back to Node.js.
    //
    // MantisBT table column layout (0-indexed):
    //   [0]  checkbox        [1]  ID          [2]  Project      [3]  Severity
    //   [4]  완료예상일       [5]  이슈발생시점  [6]  #           [7]  이미지버전
    //   [8]  Status          [9]  Summary     [10] Reporter     [11] Resolution
    //   [12] Date Submitted  [13] Updated
    const issues = await page.evaluate(() => {

        // Select every <table> element on the page
        const allTables = document.querySelectorAll("table");

        // We want the specific table that shows the issue list.
        // That table starts with a cell containing "Viewing Issues".
        let issueTable: HTMLTableElement | null = null;
        for (const tbl of allTables) {
            const firstCell = tbl.querySelector("td"); // the very first <td> in this table
            if (firstCell && firstCell.textContent && firstCell.textContent.includes("Viewing Issues")) {
                issueTable = tbl; // found the right table
                break;            // stop searching
            }
        }

        // If we couldn't identify the issues table (e.g. 0 results), return an empty array
        if (!issueTable) return [];

        // Get all row elements inside the identified table
        const rows = issueTable.querySelectorAll("tr");

        // Typed array to accumulate the parsed issue objects
        const results: Array<{
            id: string;
            project: string;
            severity: string;
            status: string;
            assignee: string;
            resolution: string;
            summary: string;
        }> = [];

        // Iterate through every <tr> in the issue table
        for (const row of rows) {
            // Get all <td> cells in this row
            const cells = row.querySelectorAll("td");

            // Skip rows that don't have enough cells to be a real data row
            // (header rows, separator rows, etc. have fewer cells)
            if (cells.length < 10) continue;

            // Real data rows always have a checkbox in the first cell
            const checkbox = cells[0].querySelector('input[type="checkbox"]');
            if (!checkbox) continue; // not a data row — skip

            // Helper: safely extract trimmed text from a cell by index.
            // Returns "" if the index is out of bounds, preventing crashes.
            const getText = (idx: number): string => {
                if (idx >= cells.length) return "";
                return (cells[idx].textContent ?? "").trim(); // trim whitespace around the value
            };

            // Extract the Resolution column (index 11)
            const resolution = getText(11);

            // Filter: only keep rows where Resolution is exactly "open" (case-insensitive)
            if (resolution.toLowerCase() !== "open") continue;

            // The Status column (index 8) can look like:
            //   "open"                            — just a status
            //   "assigned ([SW IN] naveen.r)"     — status + assignee in parentheses
            const rawStatus = getText(8);

            // Try to match the "status (assignee)" pattern with a regular expression
            const statusMatch = rawStatus.match(/^(\S+)\s+\((.+)\)$/);

            // If the regex matched, statusMatch[1] = status, statusMatch[2] = assignee
            // Otherwise the whole raw string is the status and there's no assignee
            const cleanStatus = statusMatch ? statusMatch[1] : rawStatus;
            const assignee = statusMatch ? statusMatch[2] : "";

            // Secondary filter: only keep issues that are "open" or "assigned"
            // (excludes "resolved", "closed", "feedback", etc.)
            const statusLower = cleanStatus.toLowerCase();
            if (statusLower !== "open" && statusLower !== "assigned") continue;

            // All filters passed — push the parsed row into our results array
            results.push({
                id: getText(1),  // column 1 = Issue ID
                project: getText(2),  // column 2 = Project name
                severity: getText(3),  // column 3 = Severity
                status: cleanStatus, // parsed clean status string
                assignee: assignee,    // parsed assignee (or "" if unassigned)
                resolution: resolution,  // always "open" at this point
                summary: getText(9),  // column 9 = Issue summary text
            });
        }

        // Return the accumulated results — Playwright serialises this back to Node.js
        return results;
    });

    // Return the scraped rows for this project to the caller
    return issues;
}

/**
 * Scrape open issues across all TARGET_PROJECTS, aggregating results.
 */
export async function scrapeAllProjects(page: Page): Promise<IssueRow[]> {

    // Start with an empty accumulator array
    const allIssues: IssueRow[] = [];

    // Object.entries() converts { "125": "HF550X_A13_SDM660", ... } into
    // an array of [key, value] pairs so we can iterate with a for…of loop
    for (const [value, name] of Object.entries(TARGET_PROJECTS)) {
        // Log which project we're about to scrape (value = numeric ID, name = display label)
        console.log(`       → Scraping project: ${name} (value=${value})...`);

        // Scrape this one project and wait for the result
        const issues = await scrapeOpenIssues(page, value);

        // Log how many issues were found for this project
        console.log(`         ✔ ${issues.length} open issue(s)`);

        // Append this project's issues to the master list using the spread operator (...issues)
        allIssues.push(...issues);
    }

    // Return the combined array of issues from all projects
    return allIssues;
}

/**
 * Gracefully close the browser context and browser instance.
 */
export async function closeBrowser(page: Page): Promise<void> {
    try {
        // Attempt to close the individual tab/page
        await page.close();
    } catch (_e) { /* page may already be closed — ignore the error */ }

    // If a browser context was created, close it and clear the reference
    if (_context) {
        await _context.close();
        _context = null; // null out so the garbage collector can free the memory
    }

    // If the browser process is still running, close it and clear the reference
    if (_browser) {
        await _browser.close();
        _browser = null; // null out so the garbage collector can free the memory
    }
}
