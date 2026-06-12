// =================================================================
// 🎓 features/proctor/proctor.js — ระบบบันทึกการคุมสอบ Proctor
// =================================================================
// รับข้อมูลจาก Discord Webhook (embed ใน LogCase channel)
// → ส่ง Embed ไปห้อง Proctor ที่กำหนดใน Google Sheet
// =================================================================

const { EmbedBuilder } = require('discord.js');
const sheetConfig = require('../../utils/sheetConfig');
const { safeSendMessage, safeReact } = require('../../utils/discordSafe');

// ===== Utility Functions (exported for resendMissed) =====

/**
 * ตรวจสอบว่า Proctor embed หรือไม่ (เช็คจาก title)
 */
function isProctorEmbed(embed) {
    return embed?.title?.includes('📋 บันทึกการคุมสอบ Proctor') === true;
}

/**
 * ตรวจสอบว่า message นี้มี ✅ reaction ของบอทแล้วหรือยัง
 */
function hasBotCheckReaction(message, client) {
    const botUserId = client.user?.id;
    if (!botUserId) return false;

    const reaction = message.reactions.cache.get('✅');
    if (!reaction) return false;

    return reaction.users.cache.has(botUserId);
}

/**
 * ส่งต่อ Proctor Embed ไปยัง PROCTOR_CHANNEL_ID + ติ๊กถูก
 */
async function forwardProctorMessage(message, client) {
    const embed = message.embeds?.[0];
    if (!embed) return false;
    if (!isProctorEmbed(embed)) return false;

    const proctorChannelId = sheetConfig.getProctorChannelId();
    if (!proctorChannelId) {
        console.error('❌ [Proctor Forward] ไม่ได้ตั้งค่า PROCTOR_CHANNEL_ID ใน Google Sheet');
        return false;
    }

    const targetChannel = client.channels.cache.get(proctorChannelId);
    if (!targetChannel) {
        console.error(`❌ [Proctor Forward] ไม่พบช่อง ID: ${proctorChannelId}`);
        return false;
    }

    const options = { embeds: [embed] };
    if (message.content) {
        options.content = message.content;
    }
    await safeSendMessage(targetChannel, options);

    try {
        await safeReact(message, '✅');
    } catch (reactErr) {
        console.error(`⚠️ [Proctor Forward] React ล้มเหลว:`, reactErr.message);
    }

    console.log(`✅ [Proctor Forward] ส่งต่อ Proctor ไปยัง channel สำเร็จ`);
    return true;
}

// ===== Listener Setup =====

/**
 * ตั้ง Listener คอยฟัง Webhook Message ใน LogCase channel
 */
function setupListener(client) {
    client.on('messageCreate', async (message) => {
        try {
            const logCaseChannelId = sheetConfig.getLogCaseChannelId();
            if (!logCaseChannelId) return;
            if (message.channel.id !== logCaseChannelId) return;
            if (!message.webhookId) return;

            const embed = message.embeds?.[0];
            if (!isProctorEmbed(embed)) return;

            // ✅ เช็คว่าเคยส่งแล้ว (มี ✅ reaction ของบอท) → ข้าม
            if (hasBotCheckReaction(message, client)) return;

            await forwardProctorMessage(message, client);
        } catch (error) {
            console.error(`❌ [Proctor Forward] Error:`, error);
        }
    });
}

// ===== Export =====
// ✅ Export เป็น static methods ทั้งหมด — resendMissed.js เรียกใช้โดยตรง
//    featureHandler เรียก module.exports(client) เพื่อ setup listener
const proctorModule = (client) => {
    setupListener(client);
};

// Static methods — ใช้โดย resendMissed.js และ feature อื่นๆ
proctorModule.forwardProctorMessage = forwardProctorMessage;
proctorModule.isProctorEmbed = isProctorEmbed;
proctorModule.hasBotCheckReaction = hasBotCheckReaction;
proctorModule.setupListener = setupListener;

module.exports = proctorModule;
