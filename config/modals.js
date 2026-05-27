// =================================================================
// 📋 config/modals.js — สร้าง Modal แต่ละประเภท
// =================================================================

const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const sheetConfig = require('../utils/sheetConfig');

function createModalBase(customId, title, fields) {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    for (const [id, label, value, isParagraph] of fields) {
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(id)
                    .setLabel(label)
                    .setStyle(isParagraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setValue(value || '')
                    .setRequired(true)
            )
        );
    }
    return modal;
}

function buildCountModal() {
    const live = sheetConfig.getCountConfig();
    const channels = [1, 2, 3, 4, 5].map(i => live.CHANNELS[`CHANNEL_${i}`]).join(',');

    return createModalBase('modal_cfg_count', 'ตั้งค่า — นับเคส', [
        ['input_spreadsheet_id', 'Spreadsheet ID', live.SPREADSHEET_ID],
        ['input_sheet_name',     'Sheet Name',     live.SHEET_NAME],
        ['input_all_channels',   'CH1,CH2,CH3,CH4,CH5 (คั่น ,)', channels, true]
    ]);
}

function buildWelcomeModal() {
    return createModalBase('modal_cfg_welcome', 'ตั้งค่า — ต้อนรับ / ลงทะเบียน', [
        ['input_welcome_channel', 'WELCOME_CHANNEL_ID', sheetConfig.getWelcomeChannelId()],
        ['input_log_channel',     'LOG_CHANNEL_ID',     sheetConfig.getLogChannelId()],
        ['input_logtime_channel', 'LOGTIME_CHANNEL_ID', sheetConfig.getLogtimeChannelId()]
    ]);
}

function buildBypdModal() {
    return createModalBase('modal_cfg_bypd', 'ตั้งค่า — BYPD', [
        ['input_bypd_scan', 'BYPD_SCAN_CHANNEL_ID',  sheetConfig.getBypdScanChannelId()],
        ['input_bypd_send', 'BYPD_SEND_CHANNEL_ID',  sheetConfig.getBypdSendChannelId()]
    ]);
}

function buildRegistryModal() {
    const reg = sheetConfig.getRegistryConfig();

    return createModalBase('modal_cfg_registry', 'ตั้งค่า — ชีตลงทะเบียน PD', [
        ['input_registry_sheet_id',   'REGISTRY_SPREADSHEET_ID',  reg.spreadsheetId],
        ['input_registry_sheet_name', 'REGISTRY_SHEET_NAME',      reg.sheetName],
        ['input_registry_out_sheet',  'REGISTRY_OUT_SHEET_NAME',  reg.outSheetName]
    ]);
}

module.exports = {
    buildCountModal,
    buildWelcomeModal,
    buildBypdModal,
    buildRegistryModal
};