// ═══════════════════════════════════════════════════════════════════════════
//  SQA Portal — Open Issues Report Agent
//  Declarative Jenkins Pipeline (Linux)
//
//  Schedule : Every Friday at 2:00 PM IST (08:30 UTC)
//  Purpose  : Scrape MantisBT for open issues across device projects,
//             generate Excel + JSON reports, and email the results.
// ═══════════════════════════════════════════════════════════════════════════

pipeline {
    agent any

    // ── Weekly Trigger ──────────────────────────────────────────────────
    triggers {
        cron('0 11 * * 5')
    }

    // ── Environment Variables ───────────────────────────────────────────
    environment {
        MANTIS_USERNAME = credentials('sqaportal-username')
        MANTIS_PASSWORD = credentials('sqaportal-password')
        EMAIL_TO        = credentials('sqa_fwd_email')
    }

    stages {
        stage('Check Environment') {
            steps {
                sh 'node -v'
                sh 'npm -v'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo '📦 Installing npm dependencies...'
                sh 'npm install'
            }
        }

        stage('Install Playwright Browsers') {
            steps {
                echo '🌐 Installing Chromium for Playwright...'
                sh 'npx playwright install'
            }
        }

        stage('Run Agent') {
            steps {
                echo '🤖 Running SQA Portal Agent...'
                sh 'npx ts-node index.ts'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'Open_Issues.xlsx, open_issues.json, debug_login_failure.png',
                             allowEmptyArchive: true

            script {
                def emailBody = ''
                if (fileExists('email_body.html')) {
                    emailBody = readFile(file: 'email_body.html')
                } else {
                    emailBody = '<p>Report generation may have failed. Check console output.</p>'
                }

                emailext(
                    subject: "OPEN ISSUES REPORT",
                    body: emailBody,
                    mimeType: 'text/html',
                    to: EMAIL_TO,
                    attachmentsPattern: 'Open_Issues.xlsx'
                )
            }
        }
        success {
            echo '✅ Open Issues Report generated and emailed successfully.'
        }
        failure {
            echo '❌ Pipeline failed — check console output for details.'
        }
        cleanup {
            cleanWs(deleteDirs: true, patterns: [[pattern: 'node_modules/**', type: 'EXCLUDE']])
        }
    }
}
