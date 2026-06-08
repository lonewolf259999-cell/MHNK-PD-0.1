// =================================================================
// 🔄 features/get-tags/resendMissed.js — ส่งย้อนหลัง BYPD + Proctor (แบบมี Progress)
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const processAndSendBypd = require('./processAndSend');
const proctorModule = require('../proctor/proctor');
const { safeFetchMessages } = require('../../utils/discordSafe');
const { extractContent } = processAndSendBypd;

/**
 * runResendMissed — สแกนย้อนหลังทั้งหมด + ส่ง + รายงานความคืบหน้า
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').CommandInteraction} interaction - สำหรับ editReply อัปเดตความคืบหน้า
 * @param {AbortSignal|null} abortSignal
 * @returns {Promise<Object>} { success, count, found, failed, message }
 */
async function runResendMissed(client, interaction, abortSignal = null) {
    const logChannelId = sheetConfig.getLogCaseChannelId();
    const guild = interaction.guild;

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) {
        return { success: false, error: '❌ ไม่พบห้อง Log' };
    }

    // =============================================================
    // ระยะที่ 1: นับจำนวนข้อความทั้งหมด (สแกนแค่ ID ไม่ดึง content)
    // =============================================================
    await interaction.editReply({ content: '⏳ กำลังนับจำนวนข้อความใน LogCase...' });

    const allMessageIds = [];
    let lastId = null;

    while (true) {
        if (abortSignal?.aborted) {
            return {
                success: true, count: 0, found: 0, failed: 0,
                message: '⏹️ ถูกหยุดระหว่างนับจำนวนข้อความ'
            };
        }

        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const messages = await safeFetchMessages(logChannel, options);
        if (messages.size === 0) break;

        allMessageIds.push(...Array.from(messages.keys()));
        lastId = messages.last().id;
    }

    const totalMessages = allMessageIds.length;
    console.log(`📊 พบทั้งหมด ${totalMessages} ข้อความ`);

    if (totalMessages === 0) {
        return {
            success: true, count: 0, found: 0, failed: 0,
            message: '📊 ไม่พบข้อความในห้อง Log'
        };
    }

    // =============================================================
    // ระยะที่ 2: ประมวลผลทีละ 100 ข้อความ
    // =============================================================
    await interaction.editReply({
        content: `📊 พบทั้งหมด **${totalMessages}** ข้อความ กำลังเริ่มประมวลผล...`
    });

    let scannedCount = 0;
    let bypdSentNow = 0;
    let proctorSentNow = 0;
    let failedCount = 0;
    let bypdAlreadySent = 0;   // มี ✅ อยู่ก่อนแล้ว
    let proctorAlreadySent = 0;
    let stopped = false;

    // ประมวลผลจากเก่าสุด→ใหม่สุด (reverse order)
    for (let batchStart = 0; batchStart < allMessageIds.length; batchStart += 100) {
        if (abortSignal?.aborted) {
            console.log(`⏹️ [resendMissed] ถูกหยุดที่ ${scannedCount}/${totalMessages}`);
            stopped = true;
            break;
        }

        const batchIds = allMessageIds.slice(batchStart, batchStart + 100);
        const batchMessages = [];

        // ดึงข้อความทีละ ID
        for (const id of batchIds) {
            try {
                const msg = await logChannel.messages.fetch(id);
                batchMessages.push(msg);
            } catch {
                // ข้อความถูกลบแล้ว
            }
        }

        // fetch content + reactions ให้ครบ
        for (const msg of batchMessages) {
            try {
                await msg.fetch();
            } catch {
                // ข้าม
            }
        }

        // กรอง BYPD + Proctor ที่ยังไม่มี ✅
        const toSendBypd = [];
        const toSendProctor = [];

        for (const msg of batchMessages) {
            const content = extractContent(msg);
            const embed = msg.embeds?.[0];

            const isBypd = content.toUpperCase().includes('BYPD');
            const isProctor = proctorModule.isProctorEmbed(embed);
            const hasCheckmark = msg.reactions.cache.some(r => r.emoji.name === '✅');

            if (isBypd && !hasCheckmark) {
                toSendBypd.push(msg);
            } else if (isBypd && hasCheckmark) {
                bypdAlreadySent++;
            }

            if (isProctor && !hasCheckmark) {
                toSendProctor.push(msg);
            } else if (isProctor && hasCheckmark) {
                proctorAlreadySent++;
            }
        }

        // ส่ง BYPD ก่อน (เรียงตามลำดับ)
        for (const msg of toSendBypd) {
            if (abortSignal?.aborted) { stopped = true; break; }
            try {
                const sent = await processAndSendBypd.processAndSend(msg);
                if (sent) bypdSentNow++;
                else failedCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
                console.error(`❌ ส่ง BYPD ID ${msg.id}:`, err.message);
                failedCount++;
            }
        }
        if (stopped) break;

        // ส่ง Proctor ต่อ
        for (const msg of toSendProctor) {
            if (abortSignal?.aborted) { stopped = true; break; }
            try {
                const sent = await proctorModule.forwardProctorMessage(msg, client);
                if (sent) proctorSentNow++;
                else failedCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
                console.error(`❌ ส่ง Proctor ID ${msg.id}:`, err.message);
                failedCount++;
            }
        }
        if (stopped) break;

        scannedCount += batchMessages.length;

        // ✅ อัปเดตความคืบหน้าทุก 100 ข้อความ
        const progressMsg =
            `📊 **${scannedCount}/${totalMessages}** | ` +
            `BYPD: ส่งแล้ว ${bypdSentNow} ✅ | ` +
            `Proctor: ส่งแล้ว ${proctorSentNow} ✅ | ` +
            `ล้มเหลว: ${failedCount}`;

        await interaction.editReply({ content: progressMsg });
    }

    // =============================================================
    // รายงานผลสรุป
    // =============================================================
    const totalSent = bypdSentNow + proctorSentNow;

    let message;
    if (stopped) {
        message = `⏹️ **หยุดส่งย้อนหลังแล้ว**\n` +
            `📊 สแกนไป: ${scannedCount}/${totalMessages}\n` +
            `✅ BYPD: ${bypdSentNow} | Proctor: ${proctorSentNow} | ❌ ล้มเหลว: ${failedCount}\n` +
            `📊 เคยส่งแล้วก่อนหน้า — BYPD: ${bypdAlreadySent} | Proctor: ${proctorAlreadySent}`;
    } else {
        message = `✅ **ส่งย้อนหลังเสร็จสิ้น**\n` +
            `📊 สแกนทั้งหมด: ${totalMessages} ข้อความ\n` +
            `✅ BYPD: ${bypdSentNow} | Proctor: ${proctorSentNow} | ❌ ล้มเหลว: ${failedCount}\n` +
            `📊 เคยส่งแล้วก่อนหน้า — BYPD: ${bypdAlreadySent} | Proctor: ${proctorAlreadySent}`;
    }

    return {
        success: true,
        count: totalSent,
        found: scannedCount,
        failed: failedCount,
        message
    };
}

module.exports = {
    runResendMissed
};