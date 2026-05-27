// =================================================================
// 📝 features/CountAuto/logic/messageLog.js — จัดการ messageLog.json
// =================================================================

const fs = require('fs');

let lastCleanupTime = Date.now();
const CLEANUP_INTERVAL = 2 * 60 * 60 * 1000; // 2 ชั่วโมง

function shouldCleanup() {
    return Date.now() - lastCleanupTime >= CLEANUP_INTERVAL;
}

function performCleanup(logFile) {
    try {
        fs.writeFileSync(logFile, '{}');
        lastCleanupTime = Date.now();
        console.log('🧹 [CountAuto] Auto-cleanup สำเร็จ');
    } catch (e) {
        console.error('❌ [CountAuto] Cleanup ล้มเหลว:', e.message);
    }
}

function loadLog(logFile) {
    if (shouldCleanup()) {
        performCleanup(logFile);
        return {};
    }
    if (!fs.existsSync(logFile)) return {};
    try {
        return JSON.parse(fs.readFileSync(logFile));
    } catch (e) {
        return {};
    }
}

function saveLog(logFile, data) {
    fs.writeFileSync(logFile, JSON.stringify(data, null, 2));
}

module.exports = { loadLog, saveLog };