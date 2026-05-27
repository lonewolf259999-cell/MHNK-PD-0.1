// =================================================================
// 🆔 features/get-tags/get-tags.js
// =================================================================

const { EmbedBuilder } = require('discord.js');
const sheetConfig = require('../../utils/sheetConfig');

module.exports = async (client) => {

    client.on('messageCreate', async (message) => {

        const content = message.content ? message.content.trim() : "";
        let finalContent = content;

        // ถ้าไม่มี content หรือ content เป็นค่าว่าง ให้รวมข้อมูลจาก embed ทั้งหมด
        if (!finalContent && message.embeds.length > 0) {


            const embedTexts = [];
            for (const embed of message.embeds) {
                if (embed.title) embedTexts.push(embed.title);
                if (embed.description) embedTexts.push(embed.description);
                if (embed.fields && embed.fields.length > 0) {
                    for (const field of embed.fields) {
                        if (field.name) embedTexts.push(field.name);
                        if (field.value) embedTexts.push(field.value);
                    }
                }
                if (embed.footer && embed.footer.text) embedTexts.push(embed.footer.text);
            }
            finalContent = embedTexts.join('\n');
        }

        const upperContent = finalContent.toUpperCase();

        if (upperContent.includes('BYPD')) {
            try {
                const { guild } = message;

                // 1. สกัดรหัสแท็ก
                const regex = /(?:BYPD|PDBY)\s+((?:\d{2,3}\s*)+)/i;
                const match = finalContent.match(regex);

                let targetCodes = match ? match[1].trim().split(/\s+/) : [];

                let foundTags = [];
                for (const code of targetCodes) {
                    let member = guild.members.cache.find(m => (m.nickname || "").startsWith(`${code} `) || (m.nickname || "").startsWith(`${code}[`));
                    if (!member) {
                        const fetched = await guild.members.fetch({ query: code, limit: 10 });
                        member = fetched.find(m => (m.nickname || "").startsWith(`${code} `) || (m.nickname || "").startsWith(`${code}[`));
                    }
                    if (member) foundTags.push(`<@${member.user.id}>`);
                    else foundTags.push(`@${code}`);
                }

                // 2. แยกบรรทัดเพื่ออ่านข้อมูล
                const lines = finalContent.split('\n');
                let officerInfo = "-", offenderInfo = "-", caseInfo = "-", jailInfo = "-", fineInfo = "-", timeInfo = "-";

                for (const line of lines) {
                    if (line.includes("ผู้ต้องหา")) {
                        const offenderMatch = line.match(/ผู้ต้องหา\s+(.+?)(?:\s+ถูกจับโดย|$)/);
                        offenderInfo = offenderMatch ? offenderMatch[1].trim() : "-";
                    }
                    if (line.includes("เจ้าหน้าที่")) {
                        const officerMatch = line.match(/เจ้าหน้าที่\s+(.+)/);
                        officerInfo = officerMatch ? officerMatch[1].trim() : "-";
                    }
                    if (line.includes("คดี :")) caseInfo = line.split("คดี :")[1].trim();
                    if (line.includes("จำคุก :")) jailInfo = line.split("จำคุก :")[1].trim();
                    if (line.includes("ค่าปรับ :")) fineInfo = line.split("ค่าปรับ :")[1].trim();
                    if (line.includes("/") && line.includes(":")) {
                        const timeMatch = line.match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2}/);
                        if (timeMatch) timeInfo = timeMatch[0];
                    }
                }
                // 3. ส่งเป็น Embed
                const sendChannel = guild.channels.cache.get(sheetConfig.getBypdSendChannelId());
                if (sendChannel) {
                    const tagText = foundTags.join(' ') || '-';
                    const embed = new EmbedBuilder()
                        .setTitle('📋 รายงานคดี BYPD')
                        .setColor(0x3b82f6)
                        .addFields(
                            { name: '👮 เจ้าหน้าที่', value: officerInfo, inline: true },
                            { name: '🔴 ผู้ต้องหา', value: offenderInfo, inline: true },
                            { name: '📁 คดี', value: caseInfo, inline: false },
                            { name: '🔒 จำคุก', value: jailInfo, inline: true },
                            { name: '💰 ค่าปรับ', value: fineInfo, inline: true },
                            { name: '🕐 เวลา', value: timeInfo, inline: true }
                        )
                        .setTimestamp();

                    await sendChannel.send({ content: tagText, embeds: [embed] });
                    console.log(`✅ [BYPD System] ส่งข้อมูลเรียบร้อย`);
                }

            } catch (error) {
                console.error('❌ Error:', error);
            }
        }
    });
};