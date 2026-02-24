# SQA Portal — Open Defect Report Agent

Automated Playwright agent that scrapes **MantisBT** for open defects across multiple device projects, generates reports (`JSON` + `Excel`), and emails the results.

---

## 📁 Project Structure

```
sqaPortal/
├── index.ts          # Entry point — orchestrates the 5-step pipeline
├── scraper.ts        # Playwright browser automation & data extraction
├── excel.ts          # ExcelJS workbook generation
├── mailer.ts         # Nodemailer HTML email builder & sender
├── package.json      # Dependencies & scripts
├── tsconfig.json     # TypeScript configuration
├── Jenkinsfile       # CI pipeline with weekly cron trigger
├── .env              # Local credentials (git-ignored)
├── .env.example      # Template for required env vars
└── .gitignore        # Ignores node_modules, dist, secrets, reports
```

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Configure environment

Copy `.env.example` → `.env` and fill in values:

```env
MANTIS_USERNAME=aydin.adnan
MANTIS_PASSWORD=your_password

EMAIL_USER=sqa.bluebird@gmail.com
EMAIL_PASS=your_app_password
EMAIL_TO=aydinadnan545@gmail.com
```

> **Gmail users**: Use an [App Password](https://myaccount.google.com/apppasswords) (requires 2FA).

### 3. Run the agent

```bash
npx ts-node index.ts
```

---

## 📋 Pipeline Steps

| Step | Description |
|------|-------------|
| **1/5** | Launch headless Chromium & log into MantisBT |
| **2/5** | Scrape open issues across all target projects |
| **3/5** | Save results to `open_issues.json` |
| **4/5** | Generate `Open_Defects.xlsx` with styled worksheet |
| **5/5** | Email HTML report with Excel attachment |

---

## 🎯 Target Projects

| Device | MantisBT Project |
|--------|-----------------|
| HF550 | HF550 |
| EF550 | EF550_A14_SDM660 |
| T10 | T10_A14 |
| S10 | S10 |
| EK430 | EK430 |
| EF401 | EF401 Android |

> To add/remove projects, edit `TARGET_PROJECTS` in `scraper.ts`.

---

## 🏗️ Jenkins CI Setup

### Prerequisites

- **NodeJS Plugin** — configured as `NodeJS-20` in Global Tool Config
- **Pipeline Plugin** — usually pre-installed

### Required Credentials

Create these in **Manage Jenkins → Credentials → Global**:

| Credential ID | Type | Value |
|---------------|------|-------|
| `mantis-username` | Secret text | `aydin.adnan` |
| `mantis-password` | Secret text | MantisBT password |
| `d819dc76-b250-4164-a7a2-1a8eb98f220b` | Username + Password | `sqa.bluebird@gmail.com` (existing) |
| `email_recipient` | Secret text | `aydinadnan545@gmail.com` (existing) |

### Create the Pipeline Job

1. **New Item** → **Pipeline** → Name: `SQA-Open-Defect-Report`
2. **Pipeline** section → **Pipeline script from SCM** (or paste Jenkinsfile)
3. The `Jenkinsfile` already has the weekly trigger built in

### Schedule

The cron expression `0 0 * * 1` triggers **every Monday at 00:00 UTC (09:00 KST)**.

To change the schedule:

| Cron | When |
|------|------|
| `0 0 * * 1` | Monday 9:00 AM KST |
| `0 0 * * 5` | Friday 9:00 AM KST |
| `0 0 * * 1-5` | Every weekday 9:00 AM KST |
| `0 3 * * 1` | Monday 12:00 PM KST |

---

## 📧 Email Report

The email includes:

- **Subject**: `OPEN DEFECT REPORT`
- **Body**: Styled HTML with project summary table + full issue list (severity-colored)
- **Attachment**: `Open_Defects.xlsx`

---

## 📄 Output Files

| File | Description |
|------|-------------|
| `open_issues.json` | All open issues in JSON format |
| `Open_Defects.xlsx` | Styled Excel workbook with headers and formatting |

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MANTIS_USERNAME` | ✅ | — | MantisBT login username |
| `MANTIS_PASSWORD` | ✅ | — | MantisBT login password |
| `EMAIL_USER` | ❌ | — | SMTP sender email (skips email if empty) |
| `EMAIL_PASS` | ❌ | — | SMTP password / app password |
| `EMAIL_TO` | ❌ | `aydinadnan545@gmail.com` | Recipient email(s) |
| `EMAIL_HOST` | ❌ | `smtp.gmail.com` | SMTP server hostname |
| `EMAIL_PORT` | ❌ | `587` | SMTP port |
