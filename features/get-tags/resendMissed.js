// =================================================================
// 🔄 features/get-tags/resendMissed.js — ส่งย้อนหลัง (ไม่มี Tracking ID)
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const { processAndSend, extractContent } = require('./processAndSend');
const { safeFetchMessages } = require('../../utils/discordSafe');

const MAX_SCAN = 500;

async function runResendMissed(client, interaction, abortSignal = null) {
    const logChannelId = sheetConfig.getBypdLogChannelId();
    const guild = interaction.guild;

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) {
        return { success: false, error: '❌ ไม่พบห้อง Log' };
    }

    // ✅ 1. สแกนข้อความย้อนหลัง (สูงสุด 500)
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

        const messages = await safeFetchMessages(logChannel, options);
        if (messages.size === 0) break;

        allMessages.push(...Array.from(messages.values()));
        fetched += messages.size;
        lastId = messages.last().id;
    }

    console.log(`📊 ข้อความทั้งหมดในห้อง Log: ${allMessages.length}`);

    // ✅ 2. กรองเฉพาะข้อความ BYPD ที่ยังไม่มี ✅ reaction
    const missedMessages = allMessages.filter(msg => {
        const content = extractContent(msg);
        if (!content.toUpperCase().includes('BYPD')) return false;

        // ✅ เช็คว่ามี ✅ reaction แล้วหรือยัง (ใช้ bot reaction เป็นตัวจัดการ)
        const hasCheckmark = msg.reactions.cache.some(r => r.emoji.name === '✅');
        return !hasCheckmark;
    });

    // ✅ นับจำนวน BYPD ทั้งหมด (รวมที่ส่งแล้ว)
    const totalBypd = allMessages.filter(msg => {
        const content = extractContent(msg);
        return content.toUpperCase().includes('BYPD');
    }).length;
    const alreadySent = totalBypd - missedMessages.length;
    const totalFound = missedMessages.length;

    console.log(`📊 ข้อความ BYPD ทั้งหมด: ${totalBypd} | ส่งแล้ว (มี ✅): ${alreadySent} | ยังไม่ส่ง: ${totalFound}`);

    if (totalFound === 0) {
        return { 
            success: true, 
            count: 0, 
            found: 0, 
            failed: 0,
            message: `✅ ไม่มีข้อความ BYPD ที่ยังไม่ได้ส่ง\n📊 BYPD ทั้งหมด: ${totalBypd} | ส่งแล้ว: ${alreadySent}`
        };
    }

    // ✅ 3. ส่งย้อนหลัง (เรียงจากเก่าไปใหม่)
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

    // ✅ สร้างข้อความผลลัพธ์
    let message;
    if (stopped) {
        message = `⏹️ **หยุดส่งย้อนหลังแล้ว**
` +
            `📊 พบ: ${totalFound} | ส่งสำเร็จ: ${sentCount} | ล้มเหลว: ${failedCount}
` +
            `✅ ส่งแล้วก่อนหน้า: ${alreadySent}`;
    } else {
        message = `✅ **ส่งย้อนหลังเสร็จสิ้น**
` +
            `📊 พบ: ${totalFound} | ส่งสำเร็จ: ${sentCount} | ล้มเหลว: ${failedCount}
` +
            `✅ ส่งแล้วก่อนหน้า: ${alreadySent}`;
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