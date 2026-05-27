// =================================================================
// 🚀 MHNK-PD-0.1 \ index.js
// =================================================================

/* =====================================================
🛡️ SAFE AUTO RESTART + ANTI BAN SYSTEM
===================================================== */
let restartCount = 0;
let firstCrash = Date.now();
function safeRestart(reason = "Unknown") {
    const now = Date.now();
    if (now - firstCrash > 24 * 60 * 60 * 1000) {
        restartCount = 0;
        firstCrash = now;
    }
    restartCount++;
    if (restartCount > 8) {
        console.error("🚫 Restart limit reached (8/day). Stop reboot.");
        return;
    }
    console.error(`♻️ Restarting (${restartCount}/8) | Reason: ${reason}`);
    setTimeout(() => {
    process.exit(1);
    }, 15000);
}

/* =====================================================
❤️ HEARTBEAT + WATCHDOG (ANTI FREEZE)
===================================================== */
let lastAlive = Date.now();
function heartbeat() {
    lastAlive = Date.now();
}

// Watchdog ตรวจทุก 1 นาที
setInterval(() => {
    const diff = Date.now() - lastAlive;
    if (diff > 15 * 60 * 1000) {
        console.error("⏰ Watchdog: บอทเงียบเกิน 15 นาที กำลัง restart...");
        safeRestart("Watchdog Timeout");
    }
}, 60 * 1000);

const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const http = require('http');
const https = require('https');
const { BOT_TOKEN } = require('./configManager');
const sheetConfig = require('./utils/sheetConfig');
const loadFeatures = require('./handlers/featureHandler');
const loadConfig = require('./config/configPanel');

// ===== KEEP-ALIVE HTTP SERVER =====
const server = http.createServer((req, res) => {
    heartbeat();
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() }));
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive! ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[KEEP-ALIVE] HTTP server running on port ${PORT}`);
});

// ===== SELF-PING เพื่อป้องกันหลับ =====
setInterval(() => {
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const lib = url.startsWith('https://') ? https : http;
    lib.get(url, (res) => {
        console.log(`[SELF-PING] Ping สำเร็จ: ${res.statusCode}`);
    }).on('error', (err) => {
        console.log(`[SELF-PING] Ping ไม่สำเร็จ: ${err.message}`);
    });
    heartbeat();
}, 7 * 60 * 1000); // ping ทุก 7 นาที
// ===== END SELF-PING =====
// ===== END KEEP-ALIVE =====

process.on('unhandledRejection', (reason) => {
    console.error('❌ [SYSTEM] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ [SYSTEM] Uncaught exception (บอทยังรันต่อ):', err);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ]
});

client.on('error', (err) => {
    console.error('❌ [SYSTEM] Discord client error:', err);
});

client.on('warn', (info) => {
    console.warn('⚠️ [SYSTEM] Discord warn:', info);
});

client.once(Events.ClientReady, () => {
    heartbeat();
    console.log(`🟢 [SYSTEM] ${client.user.tag} ออนไลน์พร้อมทำงาน (โครงสร้างแบบไม่มี src)`);
});

async function start() {
    try {
        await sheetConfig.loadSheetConfig();
    } catch (error) {
        console.error('❌ [SYSTEM] โหลด config จาก Google Sheet ไม่สำเร็จ — บอทอาจทำงานไม่ครบ');
    }

    loadFeatures(client);
    loadConfig(client);
    client.login(BOT_TOKEN);
}

start().catch((error) => {
    console.error('❌ [SYSTEM] เริ่มบอทไม่สำเร็จ:', error);
    process.exit(1);
});

