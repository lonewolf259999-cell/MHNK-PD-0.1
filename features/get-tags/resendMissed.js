// =================================================================
// 🔄 features/get-tags/resendMissed.js — ส่งย้อนหลัง BYPD + Proctor (เร็ว ไม่ fetch ซ้ำ)
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const processAndSendBypd = require('./processAndSend');
const proctorModule = require('../proctor/proctor');
const { safeFetchMessages } = require('../../utils/discordSafe');
const { extractContent } = processAndSendBypd;

/**
 * runResendMissed — สแกนย้อนหลังทั้งหมด + ส่ง + รายงานความคืบหน้า
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

    // =============================================================
    // ระยะที่ 1: ดึงข้อความทั้งหมดทีละ 100 (ใช้ safeFetchMessages)
    // safeFetchMessages ได้ message objects ครบ พร้อม content, embed, reactions
    // =============================================================
    await interaction.editReply({ content: '⏳ กำลังสแกนข้อความใน LogCase...' });

    const allBatches = [];  // แต่ละ batch = array of Message objects (100 ตัว)
    let lastId = null;

    while (true) {
        if (abortSignal?.aborted) {
            return {
                success: true, count: 0, found: 0, failed: 0,
                message: '⏹️ ถูกหยุดระหว่างสแกนข้อความ'
            };
        }

        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const messages = await safeFetchMessages(logChannel, options);
        if (messages.size === 0) break;

        allBatches.push(Array.from(messages.values()));
        lastId = messages.last().id;
    }

    const totalMessages = allBatches.reduce((sum, b) => sum + b.length, 0);
    console.log(`📊 พบทั้งหมด ${totalMessages} ข้อความ`);

    if (totalMessages === 0) {
        return {
            success: true, count: 0, found: 0, failed: 0,
            message: '📊 ไม่พบข้อความในห้อง Log'
        };
    }

    // =============================================================
    // ระยะที่ 2: ประมวลผลจากเก่าสุด → ใหม่สุด
    // allBatches[0] = 100 ข้อความล่าสุด (fetched รอบแรก)
    // allBatches[n] = ข้อความเก่าสุด (fetched รอบสุดท้าย)
    // ต้อง reverse เพื่อให้ได้เก่าสุด→ใหม่สุด
    // =============================================================
    allBatches.reverse();
    // แต่ละ batch ภายในต้อง reverse ด้วย (fetched ล่าสุด→เก่า)
    for (const batch of allBatches) {
        batch.reverse();
    }

    await interaction.editReply({
        content: `📊 พบทั้งหมด **${totalMessages}** ข้อความ กำลังเริ่มประมวลผล...`
    });

    let scannedCount = 0;
    let bypdSentNow = 0;
    let proctorSentNow = 0;
    let failedCount = 0;
    let bypdAlreadySent = 0;
    let proctorAlreadySent = 0;
    let stopped = false;

    // ประมวลผลทีละ batch (100 ข้อความ) — ใช้ข้อมูลที่มีอยู่แล้ว ไม่ต้อง fetch ซ้ำ
    for (const batch of allBatches) {
        if (abortSignal?.aborted) {
            stopped = true;
            break;
        }

        // กรอง BYPD + Proctor ที่ยังไม่มี ✅
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

        // ส่ง BYPD ก่อน
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

        scannedCount += batch.length;

        // ✅ อัปเดตความคืบหน้าทุก batch (100 ข้อความ)
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