#!/usr/bin/env node
// Standalone VPS monitoring service for Claude Code sessions
// Runs on port 3847, exposes /api/ia-usage

const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');

const PORT = 3847;

const projectPaths = {
    'fxscale-dashboard': '/root/projects/fxscale-dashboard',
    'closer-crm': '/root/projects/closer-crm',
    'trading-intelligence': '/root/projects/trading-intelligence',
    'telegram-monitor': '/root/projects/telegram-monitor',
    'lp-createur': '/root/projects/lp-createur',
    'analyseur-creatives': '/root/projects/analyseur-creatives',
    'generateur-creas-sth': '/root/projects/generateur-creas-sth',
    'spy-affiliation-trading': '/root/projects/spy-affiliation-trading'
};

const projectNames = {
    'fxscale-dashboard': 'FXScale Dashboard',
    'closer-crm': 'Closer CRM',
    'trading-intelligence': 'Trading Intelligence',
    'telegram-monitor': 'Telegram Monitoring',
    'lp-createur': 'LP Createur',
    'analyseur-creatives': 'Analyseur Creatives',
    'generateur-creas-sth': 'Générateur Créas STH',
    'spy-affiliation-trading': 'Spy Affiliation Trading'
};

function formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
}

function getIAUsage(callback) {
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

                if (command.includes('grep') || command.includes('monitor.js')) continue;

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

        callback({
            totalActive: sessions.length,
            model: 'claude-opus-4-6',
            sessions,
            health,
            timestamp: new Date().toISOString(),
            vps: 'VPS Principal (46.224.228.65)'
        });
    });
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (req.url === '/api/ia-usage' && req.method === 'GET') {
        getIAUsage((data) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        });
    } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`FXSCALE IA Monitor running on port ${PORT}`);
});
