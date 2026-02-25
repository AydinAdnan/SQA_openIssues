/**
 * scraper.ts
 * ----------
 * Handles browser automation via Playwright.
 * - Launches headless Chromium
 * - Logs into MantisBT
 * - Navigates to View Issues with "open" resolution filter
 * - Scrapes the buglist table
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// ── Data Model ──────────────────────────────────────────────────────────────

/** Represents a single issue row extracted from the MantisBT table. */
export interface IssueRow {
    id: string;
    project: string;
    severity: string;
    status: string;
    assignee: string;
    resolution: string;
    summary: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const LOGIN_URL = "http://sqa.bluebird.co.kr/login_page.php";
const VIEW_ALL_URL = "http://sqa.bluebird.co.kr/view_all_bug_page.php";

/** Device projects to scrape — { dropdownValue: displayName } */
export const TARGET_PROJECTS: Record<string, string> = {

    "125": "HF550X_A13_SDM660",
    "147": "HF550X_A14",
    "129": "EF550_A13_SDM660",
    "145": "EF550_A14_SDM660",
    "132": "T10_A14",
    "138": "S10",
    "149": "EK430_A14_SDM660",
    "103": "EF401 Android 10",
    "144": "DXA800 A15",
    "140": "Zbar Barcode Decoder"

};

// ── Private state (module-scoped) ───────────────────────────────────────────

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Launch a headless Chromium browser, navigate to the MantisBT login page,
 * authenticate, and return the authenticated Page object.
 */
export async function launchAndLogin(
    username: string,
    password: string
): Promise<Page> {
    // 1. Launch Chromium in headless mode
    _browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors'],
    });
    _context = await _browser.newContext({ ignoreHTTPSErrors: true });
    const page = await _context.newPage();

    // 2. Navigate to the login page
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });

    // 3. Fill username and submit
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="username"]').press("Tab");

    // 4. Fill password
    await page.locator('input[name="password"]').fill(password);

    // 5. Click Login
    await page.getByRole("button", { name: "Login" }).click();

    // 6. Wait for navigation after login
    await page.waitForLoadState("networkidle");

    console.log(`       → Logged in as "${username}"`);
    return page;
}

/**
 * Navigate to View Issues, apply the "open" resolution filter,
 * and scrape all rows from the buglist table for a single project.
 */
export async function scrapeOpenIssues(page: Page, projectValue: string): Promise<IssueRow[]> {
    // 1. Navigate directly to View Issues page
    await page.goto(VIEW_ALL_URL, { waitUntil: "networkidle" });

    // 2. Select the target project and click Switch
    await page.locator('select[name="project_id"]').selectOption(projectValue);
    await page.getByRole("button", { name: "Switch" }).click();
    await page.waitForLoadState("networkidle");

    // 3. Click "Resolution:" to expand the filter
    await page.getByRole("link", { name: "Resolution:" }).click();
    await page.waitForLoadState("networkidle");

    // 4. Select "open" (value=10) in the resolution dropdown
    await page.locator('select[name="show_resolution[]"]').selectOption("10");

    // 5. Apply the filter
    await page.getByRole("button", { name: "Apply Filter" }).click();
    await page.waitForLoadState("networkidle");

    // 6. Wait for the page to settle
    await page.waitForTimeout(2000);

    // 7. Extract all data rows from the issues table
    //    Table column layout (0-indexed):
    //    [0] checkbox  [1] ID  [2] Project  [3] Severity
    //    [4] 완료예상일  [5] 이슈발생시점  [6] #  [7] 이미지버전
    //    [8] Status  [9] Summary  [10] Reporter  [11] Resolution
    //    [12] Date Submitted  [13] Updated
    const issues = await page.evaluate(() => {
        // Find the issues table — it's the one whose first row contains "Viewing Issues"
        const allTables = document.querySelectorAll("table");
        let issueTable: HTMLTableElement | null = null;
        for (const tbl of allTables) {
            const firstCell = tbl.querySelector("td");
            if (firstCell && firstCell.textContent && firstCell.textContent.includes("Viewing Issues")) {
                issueTable = tbl;
                break;
            }
        }
        if (!issueTable) return [];

        const rows = issueTable.querySelectorAll("tr");
        const results: Array<{
            id: string;
            project: string;
            severity: string;
            status: string;
            assignee: string;
            resolution: string;
            summary: string;
        }> = [];

        for (const row of rows) {
            const cells = row.querySelectorAll("td");

            // Data rows have 10+ cells and a checkbox in the first cell
            if (cells.length < 10) continue;
            const checkbox = cells[0].querySelector('input[type="checkbox"]');
            if (!checkbox) continue;

            const getText = (idx: number): string => {
                if (idx >= cells.length) return "";
                return (cells[idx].textContent ?? "").trim();
            };

            const resolution = getText(11);

            // Only keep rows where resolution is "open"
            if (resolution.toLowerCase() !== "open") continue;

            // Parse the status column — it may contain combined text like:
            //   "assigned ([SW IN] naveen.r)"
            // We split into clean status + assignee name.
            const rawStatus = getText(8);
            const statusMatch = rawStatus.match(/^(\S+)\s+\((.+)\)$/);
            const cleanStatus = statusMatch ? statusMatch[1] : rawStatus;
            const assignee = statusMatch ? statusMatch[2] : "";

            // Only keep open or assigned statuses (exclude closed, resolved, etc.)
            const statusLower = cleanStatus.toLowerCase();
            if (statusLower !== "open" && statusLower !== "assigned") continue;

            results.push({
                id: getText(1),
                project: getText(2),
                severity: getText(3),
                status: cleanStatus,
                assignee: assignee,
                resolution: resolution,
                summary: getText(9),
            });
        }

        return results;
    });

    return issues;
}

/**
 * Scrape open issues across all TARGET_PROJECTS, aggregating results.
 */
export async function scrapeAllProjects(page: Page): Promise<IssueRow[]> {
    const allIssues: IssueRow[] = [];

    for (const [value, name] of Object.entries(TARGET_PROJECTS)) {
        console.log(`       → Scraping project: ${name} (value=${value})...`);
        const issues = await scrapeOpenIssues(page, value);
        console.log(`         ✔ ${issues.length} open issue(s)`);
        allIssues.push(...issues);
    }

    return allIssues;
}

/**
 * Gracefully close the browser context and browser instance.
 */
export async function closeBrowser(page: Page): Promise<void> {
    try {
        await page.close();
    } catch (_e) { /* already closed */ }

    if (_context) {
        await _context.close();
        _context = null;
    }
    if (_browser) {
        await _browser.close();
        _browser = null;
    }
}
