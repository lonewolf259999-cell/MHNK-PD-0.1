// =================================================================
// 🆔 features/get-tags/get-tags.js — Event Listener เท่านั้น (ไม่มี logic ซ้ำ)
// =================================================================

const { processAndSend, extractContent } = require('./processAndSend');
const sheetConfig = require('../../utils/sheetConfig');

module.exports = async (client) => {
    client.on('messageCreate', async (message) => {
        // ✅ Filter: เฉพาะห้อง LogCase (BYPD_SCAN_CHANNEL_ID) เท่านั้น
        const logCaseChannelId = sheetConfig.getLogCaseChannelId();
        if (logCaseChannelId && message.channel.id !== logCaseChannelId) return;

        // ข้ามข้อความที่ไม่มีเนื้อหา
        const hasContent = message.content?.trim();
        const hasEmbed = message.embeds.length > 0;
        if (!hasContent && !hasEmbed) return;

        // ดึงข้อความผ่าน extractContent ที่ใช้ร่วมกัน
        const finalContent = extractContent(message);

        // เช็คว่าเป็นข้อความ BYPD
        if (finalContent && finalContent.toUpperCase().includes('BYPD')) {
            await processAndSend(message);
        }
    });
};
