// ═══════════════════════════════════════════════════════════════════════════
//  SQA Portal — Open Defect Report Agent
//  Declarative Jenkins Pipeline
//
//  Schedule : Every Monday at 9:00 AM KST (00:00 UTC)
//  Purpose  : Scrape MantisBT for open defects across 6 device projects,
//             generate Excel + JSON reports, and email the results.
// ═══════════════════════════════════════════════════════════════════════════

pipeline {
    agent any

    // ── Weekly Trigger ──────────────────────────────────────────────────
    // Every Friday at 2:00 PM IST (08:30 UTC)
    triggers {
        cron('0 11 * * 5')
    }

    // ── Tools — Commented out to avoid 'Invalid tool type "nodejs"' if plugin is missing. ──
    // tools {
    //     nodejs 'NodeJS-20'
    // }

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
                sh 'npm install' // Use install instead of ci for better flexibility if lockfile mismatch
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
                withCredentials([
                    usernamePassword(
                        credentialsId: 'd819dc76-b250-4164-a7a2-1a8eb98f220b',
                        usernameVariable: 'EMAIL_USER',
                        passwordVariable: 'EMAIL_PASS'
                    )
                ]) {
                    sh 'npx ts-node index.ts'
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'Open_Defects.xlsx, open_issues.json',
                             allowEmptyArchive: true
        }
        success {
            echo '✅ Open Defect Report generated and emailed successfully.'
        }
        failure {
            echo '❌ Pipeline failed — check console output for details.'
        }
        cleanup {
            cleanWs(deleteDirs: true, patterns: [[pattern: 'node_modules/**', type: 'EXCLUDE']])
        }
    }
}
