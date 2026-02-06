const express = require('express');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 8080;

// Detect if running on Railway (not on VPS)
const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_SERVICE_ID;
const VPS_MONITOR_URL = 'http://46.224.228.65:3847/api/ia-usage';

app.use(express.static(__dirname));

// API endpoint: Usage IA
app.get('/api/ia-usage', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (isRailway) {
        // On Railway: proxy to VPS monitoring service
        const request = http.get(VPS_MONITOR_URL, { timeout: 5000 }, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                try {
                    JSON.parse(data); // validate JSON
                    res.send(data);
                } catch (e) {
                    res.json(fallbackResponse('Invalid response from VPS'));
                }
            });
        });
        request.on('error', () => {
            if (!res.headersSent) res.json(fallbackResponse('VPS monitor unreachable'));
        });
        request.on('timeout', () => {
            request.destroy();
            if (!res.headersSent) res.json(fallbackResponse('VPS monitor timeout'));
        });
    } else {
        // On VPS: direct process detection
        detectLocalSessions(res);
    }
});

function fallbackResponse(error) {
    const projectNames = {
        'fxscale-dashboard': 'FXScale Dashboard',
        'closer-crm': 'Closer CRM',
        'trading-intelligence': 'Trading Intelligence',
        'telegram-monitor': 'Telegram Monitoring',
        'lp-createur': 'LP Createur',
        'analyseur-creatives': 'Analyseur Creatives',
        'generateur-creas-sth': 'Générateur Créas STH'
    };
    const health = {};
    for (const [id, name] of Object.entries(projectNames)) {
        health[id] = { name, active: false, session: null };
    }
    return {
        totalActive: 0,
        model: 'claude-opus-4-6',
        sessions: [],
        health,
        timestamp: new Date().toISOString(),
        vps: 'VPS Principal (46.224.228.65)',
        error
    };
}

function detectLocalSessions(res) {
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

    exec('ps aux --no-headers | grep -E "claude" | grep -v grep', (err, stdout) => {
        const sessions = [];
        const seenProjects = new Set();

        if (!err && stdout.trim()) {
            const lines = stdout.trim().split('\n');

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 11) continue;

                const pid = parseInt(parts[1]);
                const command = parts.slice(10).join(' ');

                if (command.includes('grep') || command.includes('/api/ia-usage')) continue;

                let projectId = null;
                try {
                    const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
                    for (const [id, projPath] of Object.entries(projectPaths)) {
                        if (cwd.startsWith(projPath)) {
                            projectId = id;
                            break;
                        }
                    }
                    if (!projectId && cwd.includes('/projects/')) {
                        const match = cwd.match(/\/projects\/([^/]+)/);
                        if (match) projectId = match[1];
                    }
                } catch (e) {
                    for (const [id, projPath] of Object.entries(projectPaths)) {
                        if (command.includes(projPath) || command.includes(id)) {
                            projectId = id;
                            break;
                        }
                    }
                }

                let uptimeSeconds = 0;
                try {
                    const stat = fs.statSync(`/proc/${pid}`);
                    uptimeSeconds = Math.floor((Date.now() - stat.ctimeMs) / 1000);
                } catch (e) {}

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
}

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
    console.log(`FXSCALE Dashboard running on port ${PORT}${isRailway ? ' (Railway - proxying to VPS)' : ' (VPS - local detection)'}`);
});
