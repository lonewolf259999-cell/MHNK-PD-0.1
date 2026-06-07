// =================================================================
// 🆔 features/get-tags/get-tags.js — Event Listener เท่านั้น (ไม่มี logic ซ้ำ)
// =================================================================

const { processAndSend } = require('./processAndSend');
const sheetConfig = require('../../utils/sheetConfig');

module.exports = async (client) => {
    client.on('messageCreate', async (message) => {
        // ✅ Filter: เฉพาะห้อง LogCase เท่านั้น
        const logCaseChannelId = sheetConfig.getLogCaseChannelId();
        if (logCaseChannelId && message.channel.id !== logCaseChannelId) return;

        // ข้ามข้อความที่ไม่มีเนื้อหาและไม่มี embed
        if (!message.content?.trim() && message.embeds.length === 0) return;

        // ✅ ปล่อยให้ processAndSend จัดการเช็ค BYPD และ extract embed content เอง
        await processAndSend(message);
    });
};
