/**
 * mailer.ts
 * ---------
 * Builds an HTML table from issue data and sends the report email
 * with an Excel attachment via Nodemailer.
 */

import * as nodemailer from "nodemailer";
import * as path from "path";
import type { IssueRow } from "./scraper";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert an array of IssueRow objects into a styled HTML `<table>` string.
 */
export function buildHtmlTable(issues: IssueRow[]): string {
  if (issues.length === 0) {
    return `<p style="font-family:Arial,sans-serif;color:#666;">No open issues found.</p>`;
  }

  const headers = ["#", "ID", "Project", "Severity", "Status", "Assignee", "Resolution", "Summary"];

  const severityColor: Record<string, string> = {
    crash: "#dc3545",
    block: "#dc3545",
    major: "#fd7e14",
    minor: "#ffc107",
    tweak: "#17a2b8",
    trivial: "#6c757d",
    feature: "#28a745",
  };

  let html = `
<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">
  <thead>
    <tr style="background:#1a1a2e;color:#fff;">
      ${headers.map((h) => `<th style="padding:10px 12px;text-align:left;border:1px solid #333;">${h}</th>`).join("\n      ")}
    </tr>
  </thead>
  <tbody>`;

  issues.forEach((issue, idx) => {
    const bg = idx % 2 === 0 ? "#f8f9fa" : "#ffffff";
    const sevColor = severityColor[issue.severity.toLowerCase()] ?? "#6c757d";

    html += `
    <tr style="background:${bg};">
      <td style="padding:8px 12px;border:1px solid #dee2e6;text-align:center;">${idx + 1}</td>
      <td style="padding:8px 12px;border:1px solid #dee2e6;font-weight:bold;">${issue.id}</td>
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.project}</td>
      <td style="padding:8px 12px;border:1px solid #dee2e6;color:${sevColor};font-weight:bold;">${issue.severity}</td>
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.status}</td>
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.assignee}</td>
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.resolution}</td>
      <td style="padding:8px 12px;border:1px solid #dee2e6;">${issue.summary}</td>
    </tr>`;
  });

  html += `
  </tbody>
</table>`;

  return html;
}

/**
 * Build the full email HTML body with header, summary, and table.
 */
export function buildEmailBody(issues: IssueRow[]): string {
  const now = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  // Count per project
  const projectCounts: Record<string, number> = {};
  for (const issue of issues) {
    projectCounts[issue.project] = (projectCounts[issue.project] ?? 0) + 1;
  }

  const summaryRows = Object.entries(projectCounts)
    .map(([proj, count]) => `<tr><td style="padding:4px 12px;border:1px solid #dee2e6;">${proj}</td><td style="padding:4px 12px;border:1px solid #dee2e6;text-align:center;font-weight:bold;">${count}</td></tr>`)
    .join("\n");

  return `
<div style="font-family:Arial,sans-serif;max-width:1200px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:24px;">📋 OPEN ISSUES REPORT</h1>
    <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">Generated on ${now}</p>
  </div>

  <div style="padding:20px 32px;background:#fff;border:1px solid #dee2e6;">
    <h3 style="margin:0 0 12px;color:#1a1a2e;">Summary by Project</h3>
    <table style="border-collapse:collapse;margin-bottom:20px;font-size:13px;">
      <tr style="background:#e9ecef;"><th style="padding:6px 12px;border:1px solid #dee2e6;text-align:left;">Project</th><th style="padding:6px 12px;border:1px solid #dee2e6;">Open Issues</th></tr>
      ${summaryRows}
      <tr style="background:#d4edda;font-weight:bold;"><td style="padding:6px 12px;border:1px solid #dee2e6;">Total</td><td style="padding:6px 12px;border:1px solid #dee2e6;text-align:center;">${issues.length}</td></tr>
    </table>

    <h3 style="margin:0 0 12px;color:#1a1a2e;">All Open Issues</h3>
    ${buildHtmlTable(issues)}
  </div>

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
  htmlBody: string,
  attachmentPath: string
): Promise<void> {
  const emailUser = process.env.EMAIL_USER ?? "";
  const emailPass = process.env.EMAIL_PASS ?? "";
  const emailTo = process.env.EMAIL_TO ?? "aydinadnan545@gmail.com";
  const emailHost = process.env.EMAIL_HOST ?? "smtp.gmail.com";
  const emailPort = parseInt(process.env.EMAIL_PORT ?? "587", 10);

  if (!emailUser || !emailPass) {
    console.log("       ⚠ EMAIL_USER / EMAIL_PASS not set — skipping email.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  const info = await transporter.sendMail({
    from: `"SQA Portal Agent" <${emailUser}>`,
    to: emailTo,
    subject: "OPEN ISSUES REPORT",
    html: htmlBody,
    attachments: [
      {
        filename: path.basename(attachmentPath),
        path: attachmentPath,
      },
    ],
  });

  console.log(`       ✔ Email sent! Message ID: ${info.messageId}`);
}
