/**
 * mailer.ts
 * ---------
 * Builds an HTML table from issue data and sends the report email
 * with an Excel attachment via Nodemailer.
 */

// Nodemailer is a Node.js library for sending emails via SMTP
import * as nodemailer from "nodemailer";

// Node's built-in path module — used to extract just the filename from a full path
import * as path from "path";

// Import the IssueRow type so TypeScript can validate every issue object we receive
import type { IssueRow } from "./scraper";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert an array of IssueRow objects into a styled HTML `<table>` string.
 */
export function buildHtmlTable(issues: IssueRow[]): string {

  // If there are no issues, return a simple paragraph instead of an empty table
  if (issues.length === 0) {
    return `<p style="font-family:Arial,sans-serif;color:#666;">No open issues found.</p>`;
  }

  // Column headers that will appear in the <thead> row of the HTML table
  // "#" is a row counter added on top of the standard IssueRow fields
  const headers = ["#", "ID", "Project", "Severity", "Status", "Assignee", "Resolution", "Summary"];

  // Map each severity level (lowercase) to a CSS colour for visual emphasis in the table
  const severityColor: Record<string, string> = {
    crash: "#dc3545", // red   — highest severity
    block: "#dc3545", // red   — also critical
    major: "#fd7e14", // orange
    minor: "#ffc107", // yellow
    tweak: "#17a2b8", // teal
    trivial: "#6c757d", // grey  — lowest severity
    feature: "#28a745", // green — enhancement requests
  };

  // Start building the HTML string with the <table> opening tag and inline styles
  let html = `
<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">
  <thead>
    <tr style="background:#1a1a2e;color:#fff;">
      ${headers.map((h) => `<th style="padding:10px 12px;text-align:left;border:1px solid #333;">${h}</th>`).join("\n      ")}
      <!--
        headers.map() loops through each header label and wraps it in a <th> element
        .join() concatenates all the <th> strings into one continuous string
        The result is a header row with dark background and white text
      -->
    </tr>
  </thead>
  <tbody>`;

  // Loop through each issue and build one <tr> per issue
  issues.forEach((issue, idx) => {

    // Alternate row background colours for readability (zebra striping)
    // Even-index rows (0, 2, 4…) get light grey; odd-index rows get white
    const bg = idx % 2 === 0 ? "#f8f9fa" : "#ffffff";

    // Look up the colour for this issue's severity; default to grey if not found
    const sevColor = severityColor[issue.severity.toLowerCase()] ?? "#6c757d";

    // Build one complete <tr> for this issue row using template literals
    html += `
    <tr style="background:${bg};">
      <!-- Row number (1-based) — shown in the "#" column -->
      <td style="padding:8px 12px;border:1px solid #dee2e6;text-align:center;">${idx + 1}</td>

      <!-- Issue ID — bold so it's easy to spot -->
      <td style="padding:8px 12px;border:1px solid #dee2e6;font-weight:bold;">${issue.id}</td>

      <!-- Project name -->
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.project}</td>

      <!-- Severity — coloured using the severityColor map defined above -->
      <td style="padding:8px 12px;border:1px solid #dee2e6;color:${sevColor};font-weight:bold;">${issue.severity}</td>

      <!-- Status (e.g. "open", "assigned") -->
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.status}</td>

      <!-- Assignee (person responsible for the issue) -->
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.assignee}</td>

      <!-- Resolution — always "open" after our scraper filter -->
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.resolution}</td>

      <!-- Summary — the one-line description of the issue -->
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.summary}</td>
    </tr>`;
  });

  // Close the <tbody> and <table> tags to produce valid HTML
  html += `
  </tbody>
</table>`;

  // Return the complete HTML table string to the caller
  return html;
}

/**
 * Build the full email HTML body with header, summary, and table.
 */
export function buildEmailBody(issues: IssueRow[], sheetUrl?: string): string {

  // Create a human-readable timestamp for the report generation time
  // toLocaleString formats: "Friday, February 27, 2026 at 2:41 PM"
  const now = new Date().toLocaleString("en-US", {
    dateStyle: "full",  // e.g. "Friday, February 27, 2026"
    timeStyle: "short", // e.g. "2:41 PM"
  });

  // ── Build a "Summary by Project" tally ────────────────────────────────────

  // Create an empty object to count how many open issues exist per project
  const projectCounts: Record<string, number> = {};

  for (const issue of issues) {
    // If this project hasn't been seen yet, initialise its count to 0 then add 1
    // The ?? operator falls back to 0 when projectCounts[issue.project] is undefined
    projectCounts[issue.project] = (projectCounts[issue.project] ?? 0) + 1;
  }

  // Convert the projectCounts object into an HTML table rows string.
  // Object.entries() gives an array of [projectName, count] pairs.
  const summaryRows = Object.entries(projectCounts)
    .map(([proj, count]) =>
      // Each pair becomes one <tr> with the project name and its count
      `<tr><td style="padding:4px 12px;border:1px solid #dee2e6;">${proj}</td>` +
      `<td style="padding:4px 12px;border:1px solid #dee2e6;text-align:center;font-weight:bold;">${count}</td></tr>`
    )
    .join("\n"); // join all row strings with a newline for readable HTML source

  // ── Assemble the full email HTML document ─────────────────────────────────

  return `
<div style="font-family:Arial,sans-serif;max-width:1200px;margin:0 auto;">

  <!-- ── Header banner ── -->
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:24px 32px;border-radius:8px 8px 0 0;">
    <!-- Main report title -->
    <h1 style="margin:0;font-size:24px;">📋 OPEN ISSUES REPORT</h1>
    <!-- Subtitle showing when the report was generated -->
    <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">Generated on ${now}</p>
  </div>

  <!-- ── Body content ── -->
  <div style="padding:20px 32px;background:#fff;border:1px solid #dee2e6;">

    ${sheetUrl ? `
    <!-- Google Sheet link button -->
    <div style="margin-bottom:20px;">
      <a href="${sheetUrl}" target="_blank"
         style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#fff;
                font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;">
        📊 View Google Sheet
      </a>
      <p style="margin:6px 0 0;font-size:12px;color:#888;">Anyone with this link can view the sheet.</p>
    </div>` : ''}

    <!-- Summary table: one row per project showing how many open issues it has -->
    <h3 style="margin:0 0 12px;color:#1a1a2e;">Summary by Project</h3>
    <table style="border-collapse:collapse;margin-bottom:20px;font-size:13px;">
      <!-- Header row for the summary table -->
      <tr style="background:#e9ecef;">
        <th style="padding:6px 12px;border:1px solid #dee2e6;text-align:left;">Project</th>
        <th style="padding:6px 12px;border:1px solid #dee2e6;">Open Issues</th>
      </tr>
      <!-- One row per project (built above using projectCounts) -->
      ${summaryRows}
      <!-- Total row at the bottom — bold green background for emphasis -->
      <tr style="background:#d4edda;font-weight:bold;">
        <td style="padding:6px 12px;border:1px solid #dee2e6;">Total</td>
        <td style="padding:6px 12px;border:1px solid #dee2e6;text-align:center;">${issues.length}</td>
      </tr>
    </table>

    <!-- Full detailed issues table generated by buildHtmlTable() -->
    <h3 style="margin:0 0 12px;color:#1a1a2e;">All Open Issues</h3>
    ${buildHtmlTable(issues)}
    <!-- buildHtmlTable returns the complete <table>…</table> HTML string with all rows -->
  </div>

  <!-- ── Footer ── -->
  <div style="background:#f8f9fa;padding:12px 32px;border-radius:0 0 8px 8px;border:1px solid #dee2e6;border-top:none;">
    <p style="margin:0;font-size:12px;color:#666;">This is an automated report from the SQA Portal Agent. Excel file is attached.</p>
  </div>

</div>`;
}

/**
 * Send the issues report email using Nodemailer.
 *
 * Environment variables required:
 *   EMAIL_USER       - Sender email address
 *   EMAIL_PASS       - Email password or app password
 *   EMAIL_TO         - Recipient(s), comma-separated (defaults to EMAIL_USER)
 *   EMAIL_HOST       - SMTP host (defaults to smtp.gmail.com)
 *   EMAIL_PORT       - SMTP port (defaults to 587)
 */
export async function sendReport(
  htmlBody: string,       // the complete HTML content for the email body
  attachmentPath: string  // absolute path to the Excel file to attach
): Promise<void> {

  // Read SMTP credentials and settings from environment variables
  const emailUser = process.env.EMAIL_USER ?? "";           // sender address
  const emailPass = process.env.EMAIL_PASS ?? "";           // sender password / app password
  const emailTo = process.env.EMAIL_TO ?? "aydinadnan545@gmail.com"; // recipient(s)
  const emailHost = process.env.EMAIL_HOST ?? "smtp.gmail.com"; // SMTP server hostname
  const emailPort = parseInt(process.env.EMAIL_PORT ?? "587", 10); // SMTP port (587 = STARTTLS)

  // Guard: if credentials are missing, skip sending rather than crashing
  if (!emailUser || !emailPass) {
    console.log("       ⚠ EMAIL_USER / EMAIL_PASS not set — skipping email.");
    return; // exit the function early without throwing an error
  }

  // Create a Nodemailer transport configured for the specified SMTP server
  const transporter = nodemailer.createTransport({
    host: emailHost,          // SMTP hostname (e.g. "smtp.gmail.com")
    port: emailPort,          // SMTP port (587 for STARTTLS, 465 for SSL)
    secure: emailPort === 465,  // true = use TLS from the start (port 465); false = STARTTLS (port 587)
    auth: {
      user: emailUser, // the "From" address used to authenticate with the SMTP server
      pass: emailPass, // the password or app-specific password for that account
    },
  });

  // Compose and send the email
  const info = await transporter.sendMail({
    from: `"SQA Portal Agent" <${emailUser}>`, // display name + address shown to recipients
    to: emailTo,     // recipient address(es) — comma-separated for multiple
    subject: "OPEN ISSUES REPORT", // email subject line
    html: htmlBody,    // the HTML content that renders in the email body
    attachments: [
      {
        filename: path.basename(attachmentPath), // just the file name (e.g. "Open_Issues.xlsx")
        path: attachmentPath,                // full absolute path, Nodemailer reads the file
      },
    ],
  });

  // Log the server-assigned message ID as confirmation the email was accepted
  console.log(`       ✔ Email sent! Message ID: ${info.messageId}`);
}
