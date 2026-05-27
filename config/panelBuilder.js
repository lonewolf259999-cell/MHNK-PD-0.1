// =================================================================
// 🎨 config/panelBuilder.js — สร้าง Embed + ปุ่ม
// =================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sheetConfig = require('../utils/sheetConfig');

function ch(id) {
    return id ? `<#${id}>` : '`ยังไม่ระบุ`';
}

function createPanelEmbed() {
    const count = sheetConfig.getCountConfig();
    const reg   = sheetConfig.getRegistryConfig();
    const chs   = count.CHANNELS;

    return new EmbedBuilder()
        .setColor('#f4c430')
        .setTitle('⚙️ แผงควบคุม Mahanakorn Bot')
        .setDescription(
            '**นับเคส**\n' +
            `• Sheet ID: \`${count.SPREADSHEET_ID || 'ยังไม่ตั้ง'}\`\n` +
            `• Sheet Name: \`${count.SHEET_NAME || 'ยังไม่ตั้ง'}\`\n` +
            `• CH1 (C): ${ch(chs.CHANNEL_1)} | CH2 (D): ${ch(chs.CHANNEL_2)}\n` +
            `• CH3 (E): ${ch(chs.CHANNEL_3)} | CH4 (F): ${ch(chs.CHANNEL_4)} | CH5 (G): ${ch(chs.CHANNEL_5)}\n\n` +
            '**ต้อนรับ / ลงทะเบียน**\n' +
            `• Welcome: ${ch(sheetConfig.getWelcomeChannelId())}\n` +
            `• Log ลงทะเบียน: ${ch(sheetConfig.getLogChannelId())}\n` +
            `• Log เวร: ${ch(sheetConfig.getLogtimeChannelId())}\n\n` +
            '**BYPD**\n' +
            `• อ่าน: ${ch(sheetConfig.getBypdScanChannelId())}\n` +
            `• ส่ง: ${ch(sheetConfig.getBypdSendChannelId())}\n\n` +
            '**ชีตลงทะเบียน PD**\n' +
            `• ID: \`${reg.spreadsheetId}\`\n` +
            `• แท็บ: \`${reg.sheetName}\` | ออก: \`${reg.outSheetName}\``
        )
        .setFooter({ text: 'กดปุ่มด้านล่างเพื่อตั้งค่าหรือเริ่มนับข้อความเก่า' });
}

function buildPanelComponents() {
    return [
        new ActionRowBuilder().addComponents(
            btn('btn_trigger_manual_count', 'เริ่มนับข้อความเก่า', ButtonStyle.Primary, '⭐'),
            btn('btn_cfg_count',           'ตั้งค่า — นับเคส',    ButtonStyle.Secondary, '📊'),
            btn('btn_cfg_welcome',         'ตั้งค่า — ต้อนรับ',    ButtonStyle.Secondary, '🚪')
        ),
        new ActionRowBuilder().addComponents(
            btn('btn_cfg_bypd',      'ตั้งค่า — BYPD',    ButtonStyle.Secondary, '🆔'),
            btn('btn_cfg_registry',  'ตั้งค่า — ชีต PD', ButtonStyle.Secondary, '📋'),
            btn('btn_refresh_config','รีเฟรช config',   ButtonStyle.Success,  '🔄')
        )
    ];
}

function btn(customId, label, style, emoji) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style)
        .setEmoji(emoji);
}

async function sendPanelToChannel(channel) {
    return channel.send({ embeds: [createPanelEmbed()], components: buildPanelComponents() });
}

module.exports = { createPanelEmbed, buildPanelComponents, sendPanelToChannel };