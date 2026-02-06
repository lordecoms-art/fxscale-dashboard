const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

// API endpoint: Usage IA - détecte les sessions Claude Code actives sur le VPS
app.get('/api/ia-usage', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Mapping project IDs to their paths
    const projectPaths = {
        'fxscale-dashboard': '/root/projects/fxscale-dashboard',
        'closer-crm': '/root/projects/closer-crm',
        'trading-intelligence': '/root/projects/trading-intelligence',
        'telegram-monitor': '/root/projects/telegram-monitor',
        'lp-createur': '/root/projects/lp-createur',
        'analyseur-creatives': '/root/projects/analyseur-creatives',
        'generateur-creas-sth': '/root/projects/generateur-creas-sth'
    };

    const projectNames = {
        'fxscale-dashboard': 'FXScale Dashboard',
        'closer-crm': 'Closer CRM',
        'trading-intelligence': 'Trading Intelligence',
        'telegram-monitor': 'Telegram Monitoring',
        'lp-createur': 'LP Createur',
        'analyseur-creatives': 'Analyseur Creatives',
        'generateur-creas-sth': 'Générateur Créas STH'
    };

    // Find claude processes - look for claude CLI or node processes with claude
    exec('ps aux --no-headers | grep -E "claude" | grep -v grep', (err, stdout) => {
        const sessions = [];
        const seenProjects = new Set();

        if (!err && stdout.trim()) {
            const lines = stdout.trim().split('\n');

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 11) continue;

                const pid = parseInt(parts[1]);
                const startTime = parts[8]; // START or TIME column
                const command = parts.slice(10).join(' ');

                // Skip helper/grep processes
                if (command.includes('grep') || command.includes('/api/ia-usage')) continue;

                // Try to find associated project by reading /proc/PID/cwd
                let projectId = null;
                try {
                    const fs = require('fs');
                    const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
                    for (const [id, projPath] of Object.entries(projectPaths)) {
                        if (cwd.startsWith(projPath)) {
                            projectId = id;
                            break;
                        }
                    }
                    // If not in known projects, try to extract from cwd
                    if (!projectId && cwd.includes('/projects/')) {
                        const match = cwd.match(/\/projects\/([^/]+)/);
                        if (match) projectId = match[1];
                    }
                } catch (e) {
                    // /proc may not be readable for all processes
                    // Try to extract project from command line args
                    for (const [id, projPath] of Object.entries(projectPaths)) {
                        if (command.includes(projPath) || command.includes(id)) {
                            projectId = id;
                            break;
                        }
                    }
                }

                // Calculate uptime from process elapsed time
                let uptimeSeconds = 0;
                try {
                    const fs = require('fs');
                    const stat = fs.statSync(`/proc/${pid}`);
                    uptimeSeconds = Math.floor((Date.now() - stat.ctimeMs) / 1000);
                } catch (e) {
                    uptimeSeconds = 0;
                }

                const sessionKey = projectId || `unknown-${pid}`;
                if (!seenProjects.has(sessionKey)) {
                    seenProjects.add(sessionKey);
                    sessions.push({
                        project: projectId || 'unknown',
                        projectName: projectNames[projectId] || (projectId ? projectId : `Process ${pid}`),
                        pid,
                        model: 'claude-opus-4-6',
                        uptimeSeconds,
                        uptime: formatUptime(uptimeSeconds),
                        active: true,
                        command: command.substring(0, 120)
                    });
                }
            }
        }

        // Build health status for all projects
        const health = {};
        for (const [id, name] of Object.entries(projectNames)) {
            health[id] = {
                name,
                active: sessions.some(s => s.project === id),
                session: sessions.find(s => s.project === id) || null
            };
        }

        res.json({
            totalActive: sessions.length,
            model: 'claude-opus-4-6',
            sessions,
            health,
            timestamp: new Date().toISOString(),
            vps: 'VPS Principal (46.224.228.65)'
        });
    });
});

function formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
}

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`FXSCALE Dashboard running on port ${PORT}`);
});
