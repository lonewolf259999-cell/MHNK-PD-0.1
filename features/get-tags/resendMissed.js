// =================================================================
// 🔄 features/get-tags/resendMissed.js — ส่งย้อนหลัง BYPD + Proctor (ไม่มี Tracking ID)
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const processAndSendBypd = require('./processAndSend');
const proctorModule = require('../proctor/proctor');
const { safeFetchMessages } = require('../../utils/discordSafe');
const { extractContent } = processAndSendBypd;

const MAX_SCAN = 500;

async function runResendMissed(client, interaction, abortSignal = null) {
    const logChannelId = sheetConfig.getLogCaseChannelId();
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

    // ✅ 2. fetch reactions ทุกข้อความให้ครบก่อนเช็ค (ป้องกัน partial cache)
    for (const msg of allMessages) {
        try {
            await msg.fetch();
        } catch (fetchErr) {
            // ข้ามข้อความที่ fetch ไม่ได้ (ลบแล้ว/ไม่มีสิทธิ์)
        }
    }

    // ✅ 3. กรองเฉพาะข้อความ BYPD + Proctor ที่ยังไม่มี ✅ reaction
    const missedBypd = allMessages.filter(msg => {
        const content = extractContent(msg);
        if (!content.toUpperCase().includes('BYPD')) return false;
        const hasCheckmark = msg.reactions.cache.some(r => r.emoji.name === '✅');
        return !hasCheckmark;
    });

    const missedProctor = allMessages.filter(msg => {
        const embed = msg.embeds?.[0];
        if (!proctorModule.isProctorEmbed(embed)) return false;
        const hasCheckmark = msg.reactions.cache.some(r => r.emoji.name === '✅');
        return !hasCheckmark;
    });

    // ✅ นับจำนวนทั้งหมด
    const totalBypd = allMessages.filter(msg => extractContent(msg).toUpperCase().includes('BYPD')).length;
    const totalProctor = allMessages.filter(msg => {
        const embed = msg.embeds?.[0];
        return proctorModule.isProctorEmbed(embed);
    }).length;
    const alreadySentBypd = totalBypd - missedBypd.length;
    const alreadySentProctor = totalProctor - missedProctor.length;
    const totalFound = missedBypd.length + missedProctor.length;

    console.log(`📊 BYPD: พบ ${totalBypd} | ส่งแล้ว ${alreadySentBypd} | รอส่ง ${missedBypd.length}`);
    console.log(`📊 Proctor: พบ ${totalProctor} | ส่งแล้ว ${alreadySentProctor} | รอส่ง ${missedProctor.length}`);

    if (totalFound === 0) {
        return { 
            success: true, 
            count: 0, 
            found: 0, 
            failed: 0,
            message: `✅ ไม่มีข้อความที่ยังไม่ได้ส่ง\n` +
                `📊 BYPD: ${totalBypd} (ส่งแล้ว ${alreadySentBypd}) | ` +
                `Proctor: ${totalProctor} (ส่งแล้ว ${alreadySentProctor})`
        };
    }

    // ✅ 4. ส่งย้อนหลัง BYPD (เรียงจากเก่าไปใหม่)
    let sentCount = 0;
    let failedCount = 0;
    let stopped = false;
    const allMissed = [
        ...missedBypd.reverse().map(msg => ({ msg, type: 'BYPD' })),
        ...missedProctor.reverse().map(msg => ({ msg, type: 'Proctor' }))
    ];

    for (const { msg, type } of allMissed) {
        // ✅ เช็ค abort ก่อนส่งแต่ละข้อความ
        if (abortSignal?.aborted) {
            console.log(`⏹️ [resendMissed] ถูกหยุดกลางทาง — ส่งสำเร็จ ${sentCount}/${totalFound}`);
            stopped = true;
            break;
        }

        try {
            console.log(`🔄 กำลังส่งย้อนหลัง [${type}] ID: ${msg.id}`);
            
            let sent;
            if (type === 'BYPD') {
                sent = await processAndSendBypd.processAndSend(msg);
            } else {
                sent = await proctorModule.forwardProctorMessage(msg, client);
            }

            if (sent) {
                sentCount++;
                console.log(`✅ ส่ง [${type}] สำเร็จ ID: ${msg.id}`);
            } else {
                failedCount++;
            }

            // ✅ หน่วงเวลาเพื่อป้องกัน rate limit
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
            console.error(`❌ ส่งย้อนหลัง [${type}] msg ${msg.id} ล้มเหลว:`, err.message);
            failedCount++;
        }
    }

    // ✅ สร้างข้อความผลลัพธ์
    let message;
    if (stopped) {
        message = `⏹️ **หยุดส่งย้อนหลังแล้ว**\n` +
            `📊 BYPD: ส่งสำเร็จ ${sentCount}/${totalFound}\n` +
            `✅ BYPD ที่ส่งแล้วก่อนหน้า: ${alreadySentBypd}\n` +
            `✅ Proctor ที่ส่งแล้วก่อนหน้า: ${alreadySentProctor}`;
    } else {
        message = `✅ **ส่งย้อนหลังเสร็จสิ้น**\n` +
            `📊 พบ: ${totalFound} | ส่งสำเร็จ: ${sentCount} | ล้มเหลว: ${failedCount}\n` +
            `✅ BYPD ที่ส่งแล้วก่อนหน้า: ${alreadySentBypd}\n` +
            `✅ Proctor ที่ส่งแล้วก่อนหน้า: ${alreadySentProctor}`;
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
