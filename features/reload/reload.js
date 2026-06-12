// =================================================================
// 🔄 features/reload/reload.js - คำสั่ง /reload (Slash Command)
// =================================================================
// ใช้ Slash Command (/reload) — ต่องเป็น Admin เท่านั้น
// =================================================================

const { SlashCommandBuilder, Events, MessageFlags } = require('discord.js');
const sheetConfig = require('../../utils/sheetConfig');
const rateLimiter = require('../../utils/rateLimiter');
module.exports = async (client) => {
    // ✅ ลงทะเบียน Slash Command
    client.once(Events.ClientReady, async () => {
        const command = new SlashCommandBuilder()
            .setName('reload')
            .setDescription('🔄 รีโหลด config จาก Google Sheet')
            .setDefaultMemberPermissions(0); // Admin only

        try {
            const existing = await client.application.commands.fetch();
            const oldCmd = existing.find(c => c.name === 'reload');
            if (oldCmd) {
                await client.application.commands.edit(oldCmd.id, command);
            } else {
                await client.application.commands.create(command);
            }
        } catch (e) {
            console.error('❌ [RELOAD] ลงทะเบียนคำสั่งไม่สำเร็จ:', e.message);
        }
    });

    // ✅ จัดการคำสั่ง /reload
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName !== 'reload') return;

        // ✅ เช็คสิทธิ์ Admin
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ เฉพาะผู้ดูแลระบบเท่านั้น', flags: MessageFlags.Ephemeral });
        }

        // ✅ Rate limit
        const limitCheck = rateLimiter.check(interaction.user.id, 'reload');
        if (!limitCheck.allowed) {
            return interaction.reply({
                content: `⏳ กรุณารอ **${Math.ceil(limitCheck.resetIn / 1000)}** วินาที ก่อนใช้คำสั่งอีกครั้ง`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
                    text: `โดย ${interaction.user.tag}`
                }
            };

            await interaction.editReply({ embeds: [successEmbed] });

            console.log(`✅ [RELOAD] Config reloaded by ${interaction.user.tag}`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

        } catch (error) {
            const errorEmbed = {
                color: 0xff4444,
                title: '❌ Config Reload ล้มเหลว',
                description: `เกิดข้อผิดพลาด: \`\`\`${error.message}\`\`\``,
                timestamp: new Date().toISOString()
            };

            await interaction.editReply({ embeds: [errorEmbed] });

            console.error(`❌ [RELOAD] Config reload failed: ${error.message}`, {
                userId: interaction.user.id
            });
        }
    });
};