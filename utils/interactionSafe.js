// =================================================================
// 🛡️ utils/interactionSafe.js — ตอบ user เมื่อ interaction พัง ไม่ให้บอทดับ
// =================================================================

const { MessageFlags } = require('discord.js');

const EPHEMERAL = MessageFlags.Ephemeral;
const USER_MSG = '❌ เกิดข้อผิดพลาด โปรดลองใหม่หรือแจ้งแอดมิน';

async function handleInteractionError(interaction, err, label) {
    console.error(`❌ [${label}]`, err);

    if (!interaction.isRepliable()) return;

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: USER_MSG, components: [] });
        } else {
            await interaction.reply({ content: USER_MSG, flags: EPHEMERAL });
        }
    } catch (_) {
        // interaction หมดอายุหรือถูกตอบไปแล้ว — ข้าม
    }
}

module.exports = { handleInteractionError };
