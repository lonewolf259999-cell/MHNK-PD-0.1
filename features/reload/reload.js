// =================================================================
// 🔄 features/reload/reload.js - คำสั่ง Reload Config แบบ Hot Reload
// =================================================================
const { Events } = require('discord.js');
const sheetConfig = require('../../utils/sheetConfig');
const logger = require('../../utils/logger');
const rateLimiter = require('../../utils/rateLimiter');

// ==============================================================
// CONFIG RELOAD COMMAND
// ==============================================================
module.exports = async (client) => {
    // รอให้ bot พร้อมก่อน
    client.once(Events.ClientReady, async () => {
        console.log('🔄 [RELOAD] Feature loaded: Config Reload Command');
    });

    // ตรวจจับคำสั่งในข้อความ
    client.on('messageCreate', async (message) => {
        // ข้าม bot ตัวเองและข้อความจาก bot
        if (message.author.bot) return;

        // ตรวจสอบว่าเป็นคำสั่ง reload หรือไม่
        const content = message.content.toLowerCase().trim();

        // รองรับหลายรูปแบบคำสั่ง
        const isReloadCommand = [
            '!reload',
            '!รีโหลด',
            '/reload',
            '!config reload',
            '!รีเฟรช'
        ].includes(content);

        if (!isReloadCommand) return;

        // ==========================================================
        // RATE LIMIT CHECK
        // ==========================================================
        const limitCheck = rateLimiter.check(message.author.id, 'reload');
        if (!limitCheck.allowed) {
            return message.reply({
                content: `⏳ กรุณารอ **${Math.ceil(limitCheck.resetIn / 1000)}** วินาที ก่อนใช้คำสั่งอีกครั้ง`,
            }).catch(() => { });
        }

        // ==========================================================
        // CHECK PERMISSION (เฉพาะ Admin)
        // ==========================================================
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        const isAdmin = adminRoleId
            ? message.member.roles.cache.has(adminRoleId)
            : message.member.permissions.has('Administrator');

        if (!isAdmin) {
            return message.reply({
                content: '❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ (ต้องเป็น Admin)',
                flags: ['Ephemeral']
            }).catch(() => { });
        }

        // ==========================================================
        // PERFORM RELOAD
        // ==========================================================
        const loadingMsg = await message.reply({
            content: '🔄 กำลังโหลด config ใหม่...'
        }).catch(() => null);

        try {
            // Reload config จาก Google Sheet
            await sheetConfig.reloadSheetConfig();

            const successEmbed = {
                color: 0x00c400,
                title: '✅ Config Reload สำเร็จ',
                description: 'Config ถูกโหลดใหม่จาก Google Sheet เรียบร้อยแล้ว',
                fields: [
                    {
                        name: '📊 Count Config',
                        value: sheetConfig.isLoaded() ? '✅ พร้อมใช้งาน' : '❌ ไม่พร้อม',
                        inline: true
                    },
                    {
                        name: '📋 Registry Config',
                        value: sheetConfig.getRegistryConfig().spreadsheetId ? '✅ พร้อมใช้งาน' : '❌ ไม่พร้อม',
                        inline: true
                    },
                    {
                        name: '👋 Welcome Channel',
                        value: sheetConfig.getWelcomeChannelId() ? `✅ \`${sheetConfig.getWelcomeChannelId()}\`` : '❌ ไม่ตั้งค่า',
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `โดย ${message.author.tag}`
                }
            };

            await loadingMsg.edit({ content: null, embeds: [successEmbed] });

            logger.info(`Config reloaded by ${message.author.tag}`, {
                userId: message.author.id,
                guildId: message.guild.id
            });

        } catch (error) {
            const errorEmbed = {
                color: 0xff4444,
                title: '❌ Config Reload ล้มเหลว',
                description: `เกิดข้อผิดพลาด: \`\`\`${error.message}\`\`\``,
                timestamp: new Date().toISOString()
            };

            await loadingMsg.edit({ content: null, embeds: [errorEmbed] });

            logger.error('Config reload failed', {
                error: error.message,
                userId: message.author.id
            });
        }
    });

    // ==========================================================
    // SLASH COMMAND: /reload (Optional - for future)
    // ==========================================================
};
