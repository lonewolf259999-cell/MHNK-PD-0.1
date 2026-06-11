// =================================================================
// 🔄 features/get-tags/resendMissed.js — ส่งย้อนหลัง BYPD + Proctor (Stream, ไม่เก็บทั้งหมด)
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const processAndSendBypd = require('./processAndSend');
const proctorModule = require('../proctor/proctor');
const { safeFetchMessages } = require('../../utils/discordSafe');
const { extractContent } = processAndSendBypd;

/**
 * runResendMissed — สแกนย้อนหลังแบบ Stream (ประมวลผลทีละ 100 ไม่เก็บทั้งหมด)
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {AbortSignal|null} abortSignal
 */
async function runResendMissed(client, interaction, abortSignal = null) {
    const logChannelId = sheetConfig.getLogCaseChannelId();
    const guild = interaction.guild;

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) {
        return { success: false, error: '❌ ไม่พบห้อง Log' };
    }

    await interaction.editReply({ content: '⏳ กำลังสแกนข้อความใน LogCase...' });

    // =============================================================
    // ระยะ: ดึงข้อความ + ประมวลผลทันที (Stream) — ทีละ 100 ข้อความ
    // =============================================================
    let scannedCount = 0;
    let bypdSentNow = 0;
    let proctorSentNow = 0;
    let failedCount = 0;
    let bypdAlreadySent = 0;
    let proctorAlreadySent = 0;
    let stopped = false;
    let lastId = null;

    while (true) {
        if (abortSignal?.aborted) {
            stopped = true;
            break;
        }

        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const messages = await safeFetchMessages(logChannel, options);
        if (messages.size === 0) break;

        // batch นี้เรียงจากล่าสุด → เก่า (เพราะใช้ before)
        const batch = Array.from(messages.values());
        // reverse ให้ได้เก่าสุด → ล่าสุด (ใน batch นี้)
        batch.reverse();

        // =============================================================
        // กรอง BYPD + Proctor ที่ยังไม่มี ✅
        // =============================================================
        const toSendBypd = [];
        const toSendProctor = [];

        for (const msg of batch) {
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

        // =============================================================
        // ส่ง BYPD
        // =============================================================
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

        // =============================================================
        // ส่ง Proctor
        // =============================================================
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

        scannedCount += batch.length;

        // ✅ อัปเดตความคืบหน้าทุก batch (100 ข้อความ)
        const progressMsg =
            `📊 สแกนแล้ว **${scannedCount}** ข้อความ | ` +
            `BYPD: ส่งแล้ว ${bypdSentNow} ✅ | ` +
            `Proctor: ส่งแล้ว ${proctorSentNow} ✅ | ` +
            `ล้มเหลว: ${failedCount}`;

        await interaction.editReply({ content: progressMsg });

        // ตั้งค่า lastId สำหรับ fetch รอบถัดไป (ข้อความที่เก่ากว่า)
        lastId = messages.last().id;

        // batch นี้หลุด scope → GC เก็บคืน memory อัตโนมัติ
    }

    // =============================================================
    // รายงานผลสรุป
    // =============================================================
    const totalSent = bypdSentNow + proctorSentNow;

    let message;
    if (stopped) {
        message = `⏹️ **หยุดส่งย้อนหลังแล้ว**\n` +
            `📊 สแกนไป: ${scannedCount} ข้อความ\n` +
            `✅ BYPD: ${bypdSentNow} | Proctor: ${proctorSentNow} | ❌ ล้มเหลว: ${failedCount}\n` +
            `📊 เคยส่งแล้วก่อนหน้า — BYPD: ${bypdAlreadySent} | Proctor: ${proctorAlreadySent}`;
    } else {
        message = `✅ **ส่งย้อนหลังเสร็จสิ้น**\n` +
            `📊 สแกนทั้งหมด: ${scannedCount} ข้อความ\n` +
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