// =================================================================
// 📤 features/get-tags/processAndSend.js — Logic ประมวลผล BYPD (ตัวเดียว ไม่ซ้ำ)
// =================================================================

const { EmbedBuilder } = require('discord.js');
const sheetConfig = require('../../utils/sheetConfig');
const { safeSendMessage } = require('../../utils/discordSafe');

// 🔒 Lock ป้องกันประมวลผลข้อความเดิมพร้อมกัน (race condition)
const processingLocks = new Set();

// 🔄 Retry utility
async function retryAsync(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

// ✅ ดึงข้อความจาก message (content + embeds)
function extractContent(message) {
    const content = message.content ? message.content.trim() : "";
    if (content) return content;

    if (message.embeds.length > 0) {
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
        return embedTexts.join('\n');
    }
    return "";
}

// ✅ สกัด tag เจ้าหน้าที่จากรหัส
async function resolveTags(guild, finalContent) {
    const regex = /(?:BYPD|PDBY)\s+((?:\d{2,3}\s*)+)/i;
    const match = finalContent.match(regex);
    const targetCodes = match ? match[1].trim().split(/\s+/) : [];

    const foundTags = [];
    for (const code of targetCodes) {
        let member = guild.members.cache.find(m =>
            (m.nickname || "").startsWith(`${code} `) ||
            (m.nickname || "").startsWith(`${code}[`)
        );
        if (!member) {
            const fetched = await guild.members.fetch({ query: code, limit: 10 });
            member = fetched.find(m =>
                (m.nickname || "").startsWith(`${code} `) ||
                (m.nickname || "").startsWith(`${code}[`)
            );
        }
        if (member) foundTags.push(`<@${member.user.id}>`);
        else foundTags.push(`@${code}`);
    }
    return foundTags;
}

// ✅ แยกข้อมูลจากข้อความ
function parseDetails(finalContent) {
    const lines = finalContent.split('\n');
    let officerInfo = "-", offenderInfo = "-", caseInfo = "-", jailInfo = "-", fineInfo = "-", timeInfo = "-";

    for (const rawLine of lines) {
        // ✅ ลบ ** (bold markdown) ก่อน parse เพราะ embed อาจมี ** คั่น
        const line = rawLine.replace(/\*\*/g, '').trim();
        if (!line) continue;

        if (line.includes("ผู้ต้องหา")) {
            const m = line.match(/ผู้ต้องหา\s+(.+?)(?:\s+ถูกจับโดย|$)/);
            offenderInfo = m ? m[1].trim() : "-";
        }
        if (line.includes("เจ้าหน้าที่")) {
            const m = line.match(/เจ้าหน้าที่\s+(.+)/);
            officerInfo = m ? m[1].trim() : "-";
        }
        if (line.includes("คดี :")) caseInfo = line.split("คดี :")[1].trim();
        if (line.includes("จำคุก :")) jailInfo = line.split("จำคุก :")[1].trim();
        if (line.includes("ค่าปรับ :")) fineInfo = line.split("ค่าปรับ :")[1].trim();
        if (line.includes("/") && line.includes(":")) {
            const timeMatch = line.match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2}/);
            if (timeMatch) timeInfo = timeMatch[0];
        }
    }

    return { officerInfo, offenderInfo, caseInfo, jailInfo, fineInfo, timeInfo };
}

// ✅ ฟังก์ชันหลัก: ประมวลผลและส่ง Embed
async function processAndSend(message, options = {}) {
    const { isResendMode = false } = options;
    const messageId = message.id;

    // 🔒 ป้องกันประมวลผลซ้ำพร้อมกัน
    if (processingLocks.has(messageId)) {
        console.log(`⏳ [processAndSend] ID ${messageId} กำลังประมวลผลอยู่ — ข้าม`);
        return false;
    }

    processingLocks.add(messageId);

    try {
        const { guild } = message;
        const finalContent = extractContent(message);

        if (!finalContent.toUpperCase().includes('BYPD')) return false;

        // 1. สกัด tag
        const foundTags = await resolveTags(guild, finalContent);

        // 2. แยกข้อมูล
        const { officerInfo, offenderInfo, caseInfo, jailInfo, fineInfo, timeInfo } = parseDetails(finalContent);

        // 3. ส่งเป็น Embed
        const sendChannel = guild.channels.cache.get(sheetConfig.getBypdSendChannelId());
        if (!sendChannel) {
            console.error('❌ [processAndSend] ไม่พบช่องปลายทาง');
            return false;
        }

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

        // 🔄 Retry การส่ง (ใช้ safeSendMessage)
        await retryAsync(async () => {
            await safeSendMessage(sendChannel, { content: tagText, embeds: [embed] });
        });

        console.log(`✅ [BYPD System] ส่งข้อมูลเรียบร้อย ID: ${messageId}`);

        // ✅ React (ไม่ block flow ถ้า error) - ใช้ safeReact
        try {
            const { safeReact } = require('../../utils/discordSafe');
            await retryAsync(() => safeReact(message, '✅'));
        } catch (reactErr) {
            console.error(`⚠️ [processAndSend] React ล้มเหลว ID ${messageId}:`, reactErr.message);
        }

        return true;
    } catch (error) {
        console.error(`❌ [processAndSend] Error ID ${messageId}:`, error);
        return false;
    } finally {
        processingLocks.delete(messageId);
    }
}

module.exports = {
    processAndSend,
    extractContent
};