/**
 * gsheet.ts
 * ---------
 * Creates a new Google Sheet from scraped issue data and returns
 * a public shareable link (viewer access for anyone with the link).
 *
 * Authenticates using OAuth2 refresh token (no GCP billing required).
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 */

import { google } from "googleapis";
import type { IssueRow } from "./scraper";

// ── Auth ────────────────────────────────────────────────────────────────────

function getOAuthClient() {
    const clientId     = process.env.GOOGLE_CLIENT_ID     ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN ?? "";

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
            "Missing Google OAuth2 credentials.\n" +
            "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in your .env.\n" +
            "Run: npx ts-node oauth-setup.ts to generate them."
        );
    }

    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        "urn:ietf:wg:oauth:2.0:oob"
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Creates a new Google Sheet with the given issues, formats it,
 * makes it publicly viewable, and returns the shareable URL.
 *
 * Sheet name: "SQAPortal Issue Sheet - YYYY-MM-DD"
 */
export async function createGoogleSheet(issues: IssueRow[]): Promise<string> {
    const auth   = getOAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const drive  = google.drive({ version: "v3", auth });

    // Build the sheet name with today's date
    const dateStr    = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const sheetTitle = `SQAPortal Issue Sheet - ${dateStr}`;

    // ── 1. Create the spreadsheet ────────────────────────────────────────────
    const createResp = await sheets.spreadsheets.create({
        requestBody: {
            properties: { title: sheetTitle },
            sheets: [{ properties: { title: "Open Issues" } }],
        },
    });

    const spreadsheetId = createResp.data.spreadsheetId!;
    const sheetId       = createResp.data.sheets![0].properties!.sheetId!;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    console.log(`       → Sheet created: ${spreadsheetUrl}`);

    // ── 2. Write headers + data rows ────────────────────────────────────────
    const headers = ["#", "ID", "Project", "Severity", "Status", "Assignee", "Resolution", "Summary"];
    const rows: (string | number)[][] = [
        headers,
        ...issues.map((issue, idx) => [
            idx + 1,
            issue.id,
            issue.project,
            issue.severity,
            issue.status,
            issue.assignee,
            issue.resolution,
            issue.summary,
        ]),
    ];

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Open Issues!A1",
        valueInputOption: "RAW",
        requestBody: { values: rows },
    });

    // ── 3. Format: bold frozen header + auto-resize columns ─────────────────
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                // Bold white text + dark header background
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                        cell: {
                            userEnteredFormat: {
                                textFormat: {
                                    bold: true,
                                    foregroundColor: { red: 1, green: 1, blue: 1 },
                                },
                                backgroundColor: { red: 0.18, green: 0.098, blue: 0.188 },
                                horizontalAlignment: "CENTER",
                            },
                        },
                        fields: "userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)",
                    },
                },
                // Freeze header row
                {
                    updateSheetProperties: {
                        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                        fields: "gridProperties.frozenRowCount",
                    },
                },
                // Auto-resize all columns
                {
                    autoResizeDimensions: {
                        dimensions: {
                            sheetId,
                            dimension: "COLUMNS",
                            startIndex: 0,
                            endIndex: headers.length,
                        },
                    },
                },
            ],
        },
    });

    // ── 4. Share: anyone with the link = viewer ──────────────────────────────
    await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
            role: "reader",
            type: "anyone",
        },
    });

    console.log(`       → Publicly viewable (read-only for anyone with the link)`);

    return spreadsheetUrl;
}
