# Jenkins Setup Guide — SQA Portal Open Issues Report

Complete step-by-step guide to configure Jenkins for the SQA Portal automation pipeline on **Linux**.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Jenkins](#2-install-jenkins)
3. [Install Required Plugins](#3-install-required-plugins)
4. [Install Node.js on the Jenkins Server](#4-install-nodejs-on-the-jenkins-server)
5. [Install Git on the Jenkins Server](#5-install-git-on-the-jenkins-server)
6. [Configure Jenkins Credentials](#6-configure-jenkins-credentials)
7. [Create the Pipeline Job](#7-create-the-pipeline-job)
8. [Run Your First Build](#8-run-your-first-build)
9. [Understanding the Cron Schedule](#9-understanding-the-cron-schedule)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Requirement           | Details                                                  |
| --------------------- | -------------------------------------------------------- |
| **OS**                | Ubuntu 20.04+ / Debian / CentOS / RHEL                  |
| **Java (JDK 17+)**   | Required to run Jenkins — `sudo apt install openjdk-17-jdk` |
| **Git**               | Required to pull the repo — `sudo apt install git`       |
| **Node.js (v18+)**    | Required to run the agent — [Download](https://nodejs.org/) |
| **GitHub Repository** | `https://github.com/AydinAdnan/SQA_openIssues.git`      |

---

## 2. Install Jenkins

### 2.1 Install (Debian/Ubuntu)

```bash
# Add Jenkins GPG key and repo
sudo wget -O /usr/share/keyrings/jenkins-keyring.asc \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key

echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/" | \
  sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null

# Install
sudo apt update
sudo apt install jenkins -y

# Start & enable
sudo systemctl start jenkins
sudo systemctl enable jenkins
```

### 2.2 Initial Setup

1. Open your browser → navigate to `http://<your-server-ip>:8080`
2. Jenkins will show an **"Unlock Jenkins"** screen
3. Get the initial admin password:
   ```bash
   sudo cat /var/lib/jenkins/secrets/initialAdminPassword
   ```
4. Paste it and click **Continue**
5. Choose **"Install suggested plugins"** — wait for installation to finish
6. Create your **Admin user** (username, password, full name, email)
7. Set the **Jenkins URL** (keep `http://localhost:8080/` for local setups)
8. Click **"Start using Jenkins"**

---

## 3. Install Required Plugins

Navigate to: **Manage Jenkins → Plugins → Available plugins**

Search for and install the following:

| Plugin                 | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| **Pipeline**           | Enables Jenkinsfile-based pipelines (usually pre-installed) |
| **Git**                | Pulls code from GitHub (usually pre-installed) |
| **Email Extension**    | Sends HTML emails with attachments (`emailext`) |
| **Credentials**        | Manages secrets securely (usually pre-installed) |
| **Workspace Cleanup**  | Cleans workspace after builds               |

> After installing plugins, restart Jenkins when prompted.

---

## 4. Install Node.js on the Jenkins Server

### Option A — System-wide Install (Recommended)

```bash
# Install via NodeSource (Node.js 20.x)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v
npm -v
```

Restart Jenkins so it picks up the updated PATH:

```bash
sudo systemctl restart jenkins
```

### Option B — NodeJS Jenkins Plugin

1. Install the **NodeJS** plugin from **Manage Jenkins → Plugins**
2. Go to **Manage Jenkins → Tools → NodeJS installations**
3. Click **Add NodeJS**, name it `NodeJS-20`, select version **20.x** or higher
4. Uncomment the `tools` block in the `Jenkinsfile`:
   ```groovy
   tools {
       nodejs 'NodeJS-20'
   }
   ```

> **Option A is recommended** because Option B can cause `"Invalid tool type 'nodejs'"` errors if the plugin isn't correctly configured.

---

## 5. Install Git on the Jenkins Server

```bash
sudo apt install git -y
git --version
```

Restart Jenkins if Git was installed after Jenkins:

```bash
sudo systemctl restart jenkins
```

---

## 6. Configure Jenkins Credentials

The pipeline needs **3 credentials**. Navigate to:

**Manage Jenkins → Credentials → System → Global credentials → Add Credentials**

### 6.1 MantisBT Username

| Field             | Value                  |
| ----------------- | ---------------------- |
| **Kind**          | Secret text            |
| **Secret**        | `aydin.adnan` (your MantisBT username) |
| **ID**            | `sqaportal-username`   |
| **Description**   | MantisBT login username |

### 6.2 MantisBT Password

| Field             | Value                  |
| ----------------- | ---------------------- |
| **Kind**          | Secret text            |
| **Secret**        | *(your MantisBT password)* |
| **ID**            | `sqaportal-password`   |
| **Description**   | MantisBT login password |

### 6.3 Email Recipient

| Field             | Value                  |
| ----------------- | ---------------------- |
| **Kind**          | Secret text            |
| **Secret**        | `aydinadnan545@gmail.com` (or your recipient email) |
| **ID**            | `sqa_fwd_email`        |
| **Description**   | Report recipient email |

> These IDs **must match exactly** what is in the `Jenkinsfile` `environment` block:
> ```groovy
> environment {
>     MANTIS_USERNAME = credentials('sqaportal-username')
>     MANTIS_PASSWORD = credentials('sqaportal-password')
>     EMAIL_TO        = credentials('sqa_fwd_email')
> }
> ```

---

## 7. Create the Pipeline Job

### 7.1 Create New Job

1. From the Jenkins Dashboard, click **"New Item"**
2. Enter name: **`SQA-Open-Defect-Report`**
3. Select **"Pipeline"** → click **OK**

### 7.2 Configure Pipeline Source

1. Scroll down to the **Pipeline** section
2. Set **Definition** to: **Pipeline script from SCM**
3. Set **SCM** to: **Git**
4. Set **Repository URL** to:
   ```
   https://github.com/AydinAdnan/SQA_openIssues.git
   ```
5. Leave **Credentials** as `- none -` (public repo)
6. Set **Branch Specifier** to: `*/main`
7. Set **Script Path** to: `Jenkinsfile`
8. Click **Save**

> **Important**: You must run the pipeline **at least once manually** for Jenkins to register the cron trigger.

---

## 8. Run Your First Build

1. Open the job → click **"Build Now"**
2. Click on the build number (e.g., **#1**) in the build history
3. Click **"Console Output"** to watch the pipeline progress
4. On success, you'll see:
   ```
   ✅ Open Issues Report generated and emailed successfully.
   Finished: SUCCESS
   ```
5. The report artifacts (`Open_Issues.xlsx`, `open_issues.json`) will be available on the build page

---

## 9. Understanding the Cron Schedule

Jenkins uses a 5-field cron syntax: `MINUTE HOUR DAY_OF_MONTH MONTH DAY_OF_WEEK`

| Cron Expression  | Schedule                             |
| ---------------- | ------------------------------------ |
| `0 11 * * 5`     | Every Friday at 11:00 UTC            |
| `0 0 * * 1`      | Every Monday at 00:00 UTC            |
| `0 0 * * 1-5`    | Every weekday at 00:00 UTC           |
| `*/5 * * * *`    | Every 5 minutes (for testing only)   |

To change the schedule, edit the `triggers` block in `Jenkinsfile` and push to Git.

---

## 10. Troubleshooting

### ❌ `Invalid tool type "nodejs"`

**Cause**: NodeJS plugin not installed or misconfigured.
**Fix**: Use system-installed Node.js (Option A in [Step 4](#4-install-nodejs-on-the-jenkins-server)). The `tools` block in the Jenkinsfile is already commented out.

---

### ❌ `Timeout waiting for Login button`

**Cause**: MantisBT server (`sqa.bluebird.co.kr`) is slow or unreachable from Jenkins.
**Fix**:
1. Check connectivity: `curl -I http://sqa.bluebird.co.kr`
2. Check for firewall/proxy rules blocking the connection
3. If login failed, download **`debug_login_failure.png`** from the build artifacts to see what the browser was showing

---

### ❌ `Email not sent / emailext error`

**Cause**: Email Extension plugin not configured.
**Fix**:
1. Go to **Manage Jenkins → System → Extended E-mail Notification**
2. Set **SMTP server**: `smtp.gmail.com`
3. Click **Advanced** → check **Use SSL** → set **SMTP port**: `465`
4. Add SMTP credentials (your Gmail + App Password)

---

### ❌ `node: command not found`

**Cause**: Node.js not in the Jenkins service's PATH.
**Fix**:
```bash
sudo systemctl restart jenkins
```

---

### ❌ Playwright browser launch fails

**Cause**: Missing system dependencies for Chromium.
**Fix**:
```bash
# Install Playwright system dependencies
npx playwright install-deps chromium
```

---

## Quick Reference

| Item                     | Value                                             |
| ------------------------ | ------------------------------------------------- |
| **Jenkins URL**          | `http://localhost:8080`                            |
| **GitHub Repo**          | `https://github.com/AydinAdnan/SQA_openIssues.git` |
| **Branch**               | `main`                                            |
| **Jenkinsfile**          | Root of repository                                |
| **Credential IDs**       | `sqaportal-username`, `sqaportal-password`, `sqa_fwd_email` |
| **Build Artifacts**      | `Open_Issues.xlsx`, `open_issues.json`            |
| **Debug Screenshot**     | `debug_login_failure.png` (only on failure)       |
| **Cron (current)**       | `0 11 * * 5` — Every Friday 11:00 UTC             |
