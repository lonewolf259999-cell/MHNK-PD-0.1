// =================================================================
// 💾 config/actions.js — Logic บันทึกต่างๆ ลง Sheet
// =================================================================

const { EmbedBuilder } = require('discord.js');
const sheetConfig = require('../utils/sheetConfig');
const { createPanelEmbed, buildPanelComponents } = require('./panelBuilder');
const countCase = require('../features/CountCase/CountCase');
const { runResendMissed } = require('../features/get-tags/resendMissed');
const { resendStates } = require('./resendState');

// --- รีเฟรช config ---
async function handleRefreshConfig(interaction) {
    await sheetConfig.reloadSheetConfig();
    await interaction.message.edit({
        embeds: [createPanelEmbed()],
        components: buildPanelComponents(interaction.guildId)
    });
}

// --- เริ่มนับข้อความเก่า ---
async function handleManualCount(client, interaction) {
    await countCase.runManualRecount(client, interaction);
}

// --- บันทึก: นับเคส ---
async function handleCountSave(interaction) {
    const raw = interaction.fields.getTextInputValue('input_all_channels').split(',');
    await sheetConfig.writeConfigKeys([
        ['SPREADSHEET_ID', interaction.fields.getTextInputValue('input_spreadsheet_id').trim()],
        ['SHEET_NAME',     interaction.fields.getTextInputValue('input_sheet_name').trim()],
        ...[1, 2, 3, 4, 5].map((n, i) => [`CHANNEL_ID_${n}`, (raw[i] || '').trim()])
    ]);
    return '✅ บันทึกตั้งค่านับเคสแล้ว';
}

// --- บันทึก: ต้อนรับ ---
async function handleWelcomeSave(interaction) {
    await sheetConfig.writeConfigKeys([
        ['WELCOME_CHANNEL_ID', interaction.fields.getTextInputValue('input_welcome_channel').trim()],
        ['LOG_CHANNEL_ID',     interaction.fields.getTextInputValue('input_log_channel').trim()],
        ['LOGTIME_CHANNEL_ID', interaction.fields.getTextInputValue('input_logtime_channel').trim()]
    ]);
    return '✅ บันทึกตั้งค่าต้อนรับแล้ว';
}

// --- บันทึก: BYPD ---
async function handleBypdSave(interaction) {
    await sheetConfig.writeConfigKeys([
        ['BYPD_SCAN_CHANNEL_ID', interaction.fields.getTextInputValue('input_bypd_scan').trim()],
        ['BYPD_SEND_CHANNEL_ID', interaction.fields.getTextInputValue('input_bypd_send').trim()],
        ['BYPD_LOG_CHANNEL_ID',  interaction.fields.getTextInputValue('input_bypd_log').trim()]
    ]);
    return '✅ บันทึกตั้งค่า BYPD แล้ว';
}

// --- บันทึก: ชีต PD ---
async function handleRegistrySave(interaction) {
    await sheetConfig.writeConfigKeys([
        ['REGISTRY_SPREADSHEET_ID', interaction.fields.getTextInputValue('input_registry_sheet_id').trim()],
        ['REGISTRY_SHEET_NAME',     interaction.fields.getTextInputValue('input_registry_sheet_name').trim()],
        ['REGISTRY_OUT_SHEET_NAME', interaction.fields.getTextInputValue('input_registry_out_sheet').trim()]
    ]);
    return '✅ บันทึกตั้งค่าชีต PD แล้ว';
}

// --- อัปเดตแผงควบคุม (ถ้ามี message) ---
async function tryRefreshPanelMessage(interaction) {
    if (interaction.message) {
        await interaction.message.edit({
            embeds: [createPanelEmbed()],
            components: buildPanelComponents(interaction.guildId)
        }).catch(() => null);
    }
}

// --- ส่งย้อนหลัง BYPD (toggle ส่ง/หยุด) ---
async function handleResendBypd(client, interaction) {
    const guildId = interaction.guildId;
    const state = resendStates.get(guildId);

    // ✅ ถ้ากำลังรันอยู่ → หยุด
    if (state?.isRunning) {
        state.abortController?.abort();
        resendStates.set(guildId, { isRunning: false, abortController: null });

        // ✅ อัปเดต panel เปลี่ยนปุ่มกลับเป็น "ส่งย้อนหลัง"
        await refreshPanel(guildId, interaction);

        await interaction.editReply({
            content: `⏹️ **หยุดทำงานแล้ว**\n` +
                `📊 ส่งสำเร็จ: ${state.totalSent || 0} | ล้มเหลว: ${state.totalFailed || 0}`
        });
        return;
    }

    // ✅ เริ่มส่งย้อนหลัง
    const abortController = new AbortController();
    const newState = {
        isRunning: true,
        abortController,
        totalFound: 0,
        totalSent: 0,
        totalFailed: 0
    };
    resendStates.set(guildId, newState);

    // ✅ อัปเดต panel เปลี่ยนปุ่มเป็น "หยุดทำงาน"
    await refreshPanel(guildId, interaction);

    await interaction.editReply({
        content: '🔄 **กำลังส่งย้อนหลัง BYPD...**\n⏳ กำลังสแกนห้อง Log...'
    });

    try {
        const result = await runResendMissed(client, interaction, abortController.signal);

        newState.isRunning = false;
        newState.abortController = null;

        // ✅ อัปเดต panel เปลี่ยนปุ่มกลับเป็น "ส่งย้อนหลัง"
        await refreshPanel(guildId, interaction);

        await interaction.editReply({
            content: result.message
        });
    } catch (err) {
        newState.isRunning = false;
        newState.abortController = null;

        // ✅ อัปเดต panel เปลี่ยนปุ่มกลับเป็น "ส่งย้อนหลัง"
        await refreshPanel(guildId, interaction);

        console.error('❌ [handleResendBypd] Error:', err);
        await interaction.editReply({
            content: `❌ **เกิดข้อผิดพลาด:** ${err.message}`
        });
    }
}

// ✅ รีเฟรช panel เพื่ออัปเดต label ปุ่ม
async function refreshPanel(guildId, interaction) {
    try {
        if (interaction?.message) {
            await interaction.message.edit({
                embeds: [createPanelEmbed()],
                components: buildPanelComponents(guildId)
            });
        }
    } catch (refreshErr) {
        console.error('❌ [handleResendBypd] refreshPanel ล้มเหลว:', refreshErr.message);
    }
}

module.exports = {
    handleRefreshConfig,
    handleManualCount,
    handleCountSave,
    handleWelcomeSave,
    handleBypdSave,
    handleRegistrySave,
    tryRefreshPanelMessage,
    handleResendBypd,
    refreshPanel
};