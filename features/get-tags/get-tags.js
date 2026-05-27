// =================================================================
// 🆔 features/get-tags/get-tags.js — Event Listener เท่านั้น (ไม่มี logic ซ้ำ)
// =================================================================

const { processAndSend } = require('./processAndSend');

module.exports = async (client) => {
    client.on('messageCreate', async (message) => {
        // ข้ามข้อความที่ไม่มีเนื้อหา
        const hasContent = message.content?.trim();
        const hasEmbed = message.embeds.length > 0;
        if (!hasContent && !hasEmbed) return;

        // ดึงข้อความเพื่อเช็คคำว่า BYPD
        let finalContent = hasContent ? message.content.trim() : "";
        if (!finalContent && hasEmbed) {
            const embedTexts = [];
            for (const embed of message.embeds) {
                if (embed.title) embedTexts.push(embed.title);
                if (embed.description) embedTexts.push(embed.description);
                if (embed.fields) {
                    for (const field of embed.fields) {
                        if (field.name) embedTexts.push(field.name);
                        if (field.value) embedTexts.push(field.value);
                    }
                }
                if (embed.footer?.text) embedTexts.push(embed.footer.text);
            }
            finalContent = embedTexts.join('\n');
        }

        // เช็คว่าเป็นข้อความ BYPD
        if (finalContent.toUpperCase().includes('BYPD')) {
            await processAndSend(message);
        }
    });
};