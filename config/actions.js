// =================================================================
// 💾 config/actions.js — Logic บันทึกต่างๆ ลง Sheet
// =================================================================

const sheetConfig = require('../utils/sheetConfig');
const { createPanelEmbed, buildPanelComponents } = require('./panelBuilder');
const countCase = require('../features/CountCase/CountCase');

// --- รีเฟรช config ---
async function handleRefreshConfig(interaction) {
    await sheetConfig.reloadSheetConfig();
    await interaction.message.edit({
        embeds: [createPanelEmbed()],
        components: buildPanelComponents()
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
        ['BYPD_SEND_CHANNEL_ID', interaction.fields.getTextInputValue('input_bypd_send').trim()]
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
            components: buildPanelComponents()
        }).catch(() => null);
    }
}

module.exports = {
    handleRefreshConfig,
    handleManualCount,
    handleCountSave,
    handleWelcomeSave,
    handleBypdSave,
    handleRegistrySave,
    tryRefreshPanelMessage
};