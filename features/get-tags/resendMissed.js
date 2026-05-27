// =================================================================
// 🔄 features/get-tags/resendMissed.js — ส่งย้อนหลัง + ลงชีตภายหลัง (รองรับ AbortController)
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const logCase = require('./logCase');
const { processAndSend, extractContent } = require('./processAndSend');

const MAX_SCAN = 500;

async function runResendMissed(client, interaction, abortSignal = null) {
    const logChannelId = sheetConfig.getBypdLogChannelId();
    const guild = interaction.guild;

    // ✅ 1. โหลดแคช
    await logCase.loadCache();

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) {
        return { success: false, error: '❌ ไม่พบห้อง Log' };
    }

    // ✅ 2. สแกนข้อความย้อนหลัง (สูงสุด 500)
    const allMessages = [];
    let lastId = null;
    let fetched = 0;

    while (fetched < MAX_SCAN) {
        // ✅ เช็ค abort ก่อน fetch รอบใหม่
        if (abortSignal?.aborted) {
            console.log('⏹️ [resendMissed] ถูกหยุดโดยผู้ใช้ระหว่างสแกน');
            break;
        }

        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const messages = await logChannel.messages.fetch(options);
        if (messages.size === 0) break;

        allMessages.push(...Array.from(messages.values()));
        fetched += messages.size;
        lastId = messages.last().id;
    }

    console.log(`📊 ข้อความทั้งหมดในห้อง Log: ${allMessages.length}`);

    // ✅ 3. กรองเฉพาะข้อความ BYPD ที่ยังไม่ถูกส่ง
    const missedMessages = allMessages.filter(msg => {
        if (logCase.isAlreadyTranslated(msg.id)) return false;
        const content = extractContent(msg);
        return content.toUpperCase().includes('BYPD');
    });

    const totalFound = missedMessages.length;
    console.log(`📊 ข้อความ BYPD ที่ยังไม่ส่ง: ${totalFound}`);

    if (totalFound === 0) {
        return { 
            success: true, 
            count: 0, 
            found: 0, 
            failed: 0,
            message: '✅ ไม่มีข้อความที่ยังไม่ถูกส่ง' 
        };
    }

    // ✅ 4. ส่งย้อนหลัง (เรียงจากเก่าไปใหม่)
    let sentCount = 0;
    let failedCount = 0;
    let stopped = false;

    for (const msg of missedMessages.reverse()) {
        // ✅ เช็ค abort ก่อนส่งแต่ละข้อความ
        if (abortSignal?.aborted) {
            console.log(`⏹️ [resendMissed] ถูกหยุดกลางทาง — ส่งสำเร็จ ${sentCount}/${totalFound}`);
            stopped = true;
            break;
        }

        try {
            console.log(`🔄 กำลังส่งย้อนหลัง ID: ${msg.id}`);
            // ✅ ส่งด้วยโหมด resend (เก็บลง IDMissedLog ก่อน)
            const sent = await processAndSend(msg, { isResendMode: true });

            if (sent) {
                sentCount++;
                console.log(`✅ ส่งสำเร็จ ID: ${msg.id}`);
            } else {
                failedCount++;
            }

            // ✅ หน่วงเวลาเพื่อป้องกัน rate limit
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
            console.error(`❌ ส่งย้อนหลัง msg ${msg.id} ล้มเหลว:`, err.message);
            failedCount++;
        }
    }

    // ✅ 5. ดึง ID ที่ส่งสำเร็จจาก IDMissedLog แล้ว batch ขึ้น Sheet
    const missedLogIds = Array.from(logCase.loadMissedLogFile());
    
    if (missedLogIds.length > 0) {
        try {
            await logCase.saveBatchToSheet(missedLogIds);
            logCase.clearMissedLog();
            console.log(`✅ [resendMissed] ลงชีต batch ${missedLogIds.length} ID + ล้าง IDMissedLog.json แล้ว`);
        } catch (batchErr) {
            console.error('❌ [resendMissed] batch ลง Sheet ล้มเหลว:', batchErr.message);
        }
    }

    // ✅ สร้างข้อความผลลัพธ์
    let message;
    if (stopped) {
        message = `⏹️ **หยุดส่งย้อนหลังแล้ว**
` +
            `📊 พบ: ${totalFound} | ส่งสำเร็จ: ${sentCount} | ล้มเหลว: ${failedCount}`;
    } else {
        message = `✅ **ส่งย้อนหลังเสร็จสิ้น**
` +
            `📊 พบ: ${totalFound} | ส่งสำเร็จ: ${sentCount} | ล้มเหลว: ${failedCount}
` +
            `📝 IDMissedLog ได้อัพเดตขึ้น Sheet แล้ว`;
    }

    return {
        success: true,
        count: sentCount,
        found: totalFound,
        failed: failedCount,
        message
    };
}

module.exports = {
    runResendMissed
};