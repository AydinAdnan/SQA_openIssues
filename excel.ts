/**
 * excel.ts
 * --------
 * Generates an Excel workbook from an array of IssueRow objects
 * using the ExcelJS library.
 */

// ExcelJS is a third-party library that creates and writes .xlsx files programmatically
import ExcelJS from "exceljs";

// Import the IssueRow type definition from scraper.ts so TypeScript can validate our data
import type { IssueRow } from "./scraper";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create an Excel (.xlsx) file from the provided issues array.
 *
 * The workbook will contain a single sheet named "Open Issues" with columns:
 *   ID | Project | Severity | Status | Assignee | Resolution | Summary
 */
export async function generateExcel(
    issues: IssueRow[], // the flat list of scraped issues to write into the spreadsheet
    filePath: string    // absolute path where the .xlsx file should be saved
): Promise<void> {

    // Create a new, empty Excel workbook in memory
    const workbook = new ExcelJS.Workbook();

    // Embed metadata into the file — visible in Excel's File → Properties panel
    workbook.creator = "SQA Portal Agent"; // who created this file
    workbook.created = new Date();          // timestamp set to now

    // Add a single worksheet (tab) named "Open Issues"
    const sheet = workbook.addWorksheet("Open Issues");

    // Define the column structure:
    // - header : the text that appears in row 1 as the column heading
    // - key    : the IssueRow property name ExcelJS will use to pull data from each row object
    // - width  : the default column width in character units
    sheet.columns = [
        { header: "ID", key: "id", width: 12 },
        { header: "Project", key: "project", width: 25 },
        { header: "Severity", key: "severity", width: 14 },
        { header: "Status", key: "status", width: 18 },
        { header: "Assignee", key: "assignee", width: 25 },
        { header: "Resolution", key: "resolution", width: 14 },
        { header: "Summary", key: "summary", width: 60 },
    ];

    // Add one row per issue — ExcelJS matches object keys to the column `key` values above
    for (const issue of issues) {
        sheet.addRow(issue); // inserts a new row at the bottom of the sheet
    }

    // ── Style the header row (row 1) ────────────────────────────────────────

    // Get a reference to row 1 (the header row that was auto-created by sheet.columns)
    const headerRow = sheet.getRow(1);

    // Make the header text bold and white
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    // ARGB format: FF = fully opaque alpha, FFFFFF = white text

    // Fill the header row background with a solid blue colour
    headerRow.fill = {
        type: "pattern",       // fill type must be "pattern" for solid colours
        pattern: "solid",      // no gradients — just a plain solid fill
        fgColor: { argb: "FF2E86C1" }, // FF = fully opaque, 2E86C1 = medium blue
    };

    // Centre the header text horizontally and vertically inside each cell
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    // Set the header row height to 22 points so it stands out visually
    headerRow.height = 22;

    // ── Add borders to every cell (header + data rows) ───────────────────────

    const totalRows = issues.length + 1; // + 1 accounts for the header row itself

    // Loop from row 1 (header) to the last data row
    for (let rowNum = 1; rowNum <= totalRows; rowNum++) {
        const row = sheet.getRow(rowNum); // get the Row object for this row number

        // eachCell iterates over every populated cell in this row
        row.eachCell((cell) => {
            // Apply a thin border on all four sides of every cell
            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
            };
        });
    }

    // ── Zebra-stripe the data rows for readability ──────────────────────────

    // Start at row 2 (first data row — row 1 is the header with its own colour)
    for (let rowNum = 2; rowNum <= totalRows; rowNum++) {

        // Apply the light-grey fill only to even-numbered rows
        // (odd rows stay white — the default)
        if (rowNum % 2 === 0) {
            const row = sheet.getRow(rowNum);
            row.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF2F4F4" }, // FF = fully opaque, F2F4F4 = very light grey
            };
        }
    }

    // Write the fully-styled workbook to disk at the specified file path
    // This is async because it involves disk I/O; we await it so the caller knows when it's done
    await workbook.xlsx.writeFile(filePath);
}
