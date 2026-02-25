/**
 * excel.ts
 * --------
 * Generates an Excel workbook from an array of IssueRow objects
 * using the ExcelJS library.
 */

import ExcelJS from "exceljs";
import type { IssueRow } from "./scraper";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create an Excel (.xlsx) file from the provided issues array.
 *
 * The workbook will contain a single sheet named "Open Issues" with columns:
 *   ID | Project | Severity | Status | Resolution | Summary
 */
export async function generateExcel(
    issues: IssueRow[],
    filePath: string
): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SQA Portal Agent";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Open Issues");

    // Define columns
    sheet.columns = [
        { header: "ID", key: "id", width: 12 },
        { header: "Project", key: "project", width: 25 },
        { header: "Severity", key: "severity", width: 14 },
        { header: "Status", key: "status", width: 18 },
        { header: "Assignee", key: "assignee", width: 25 },
        { header: "Resolution", key: "resolution", width: 14 },
        { header: "Summary", key: "summary", width: 60 },
    ];

    // Add data rows
    for (const issue of issues) {
        sheet.addRow(issue);
    }

    // Style the header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2E86C1" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 22;

    // Add borders to all populated cells
    const totalRows = issues.length + 1; // +1 for header
    for (let rowNum = 1; rowNum <= totalRows; rowNum++) {
        const row = sheet.getRow(rowNum);
        row.eachCell((cell) => {
            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
            };
        });
    }

    // Alternate row shading for readability
    for (let rowNum = 2; rowNum <= totalRows; rowNum++) {
        if (rowNum % 2 === 0) {
            const row = sheet.getRow(rowNum);
            row.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF2F4F4" },
            };
        }
    }

    await workbook.xlsx.writeFile(filePath);
}
