const resendStates = new Map();

// ✅ Cleanup states ที่ไม่ได้ใช้แล้ว (ทุก 10 นาที)
const CLEANUP_INTERVAL = 10 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [guildId, state] of resendStates.entries()) {
        if (!state.isRunning && (!state.lastUsed || now - state.lastUsed > CLEANUP_INTERVAL)) {
            resendStates.delete(guildId);
        }
    }
}, CLEANUP_INTERVAL);

module.exports = { resendStates };
