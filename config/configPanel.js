// =================================================================
// ⚙️ config/configPanel.js — แผงควบคุม 6 ปุ่ม + Modal ตั้งค่า
// =================================================================

const { REST, Routes, Events, SlashCommandBuilder, MessageFlags } = require('discord.js');
const { handleInteractionError } = require('../utils/interactionSafe');
const { createPanelEmbed, buildPanelComponents, sendPanelToChannel } = require('./panelBuilder');
const { buildCountModal, buildWelcomeModal, buildBypdModal, buildRegistryModal } = require('./modals');
const { handleRefreshConfig, handleManualCount, handleCountSave, handleWelcomeSave, handleBypdSave, handleRegistrySave, tryRefreshPanelMessage } = require('./actions');

const EPHEMERAL = MessageFlags.Ephemeral;

const CONFIG_PANEL_IDS = new Set([
    'btn_refresh_config',
    'btn_trigger_manual_count',
    'btn_cfg_count',
    'btn_cfg_welcome',
    'btn_cfg_bypd',
    'btn_cfg_registry',
    'modal_cfg_count',
    'modal_cfg_welcome',
    'modal_cfg_bypd',
    'modal_cfg_registry'
]);

function isPanelInteraction(interaction) {
    return CONFIG_PANEL_IDS.has(interaction.customId);
}

function isAdmin(interaction) {
    return interaction.member?.permissions?.has('Administrator');
}

async function safeDefer(interaction, options = {}) {
    try {
        if (interaction.isButton()) {
            await interaction.deferUpdate(options);
        } else {
            await interaction.deferReply(options);
        }
    } catch (deferErr) {
        console.error(`❌ [configPanel] defer ล้มเหลว (${interaction.customId}):`, deferErr.message);
        return false;
    }
    return true;
}

module.exports = async (client) => {

    client.once(Events.ClientReady, async () => {
        try {
            console.log('⏳ [configPanel] กำลังลงทะเบียนคำสั่ง /recount...');
            const commands = [
                new SlashCommandBuilder()
                    .setName('recount')
                    .setDescription('⚙️ แผงควบคุมตั้งค่าและนับยอดเคส')
            ].map(cmd => cmd.toJSON());

            const rest = new REST({ version: '10' }).setToken(client.token);
            for (const guild of client.guilds.cache.values()) {
                await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
            }
            console.log('✅ [configPanel] ลงทะเบียน /recount พร้อมใช้งาน');
        } catch (err) {
            console.error('❌ [configPanel] ลงทะเบียนคำสั่งล้มเหลว:', err);
        }
    });

    client.on('interactionCreate', async (interaction) => {
        const isPanel = (interaction.isChatInputCommand() && interaction.commandName === 'recount')
            || ((interaction.isButton() || interaction.isModalSubmit()) && isPanelInteraction(interaction));
        if (!isPanel) return;

        if (!isAdmin(interaction)) {
            return interaction.reply({ content: '❌ เฉพาะผู้ดูแลระบบเท่านั้น', flags: EPHEMERAL });
        }

        try {
            // --- Slash Command ---
            if (interaction.isChatInputCommand() && interaction.commandName === 'recount') {
                if (!await safeDefer(interaction, { flags: EPHEMERAL })) return;
                await sendPanelToChannel(interaction.channel);
                await interaction.editReply({ content: '✅ วางแผงควบคุมในห้องนี้แล้ว' });
                setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
                return;
            }

            if (!interaction.isButton() && !interaction.isModalSubmit()) return;

            // --- ปุ่ม: รีเฟรช config ---
            if (interaction.customId === 'btn_refresh_config') {
                if (!await safeDefer(interaction, {})) return;
                try {
                    await handleRefreshConfig(interaction);
                } catch (err) {
                    console.error('❌ [configPanel] รีเฟรช config ล้มเหลว:', err);
                    await interaction.followUp({ content: '❌ โหลด config จาก Sheet ไม่สำเร็จ', flags: EPHEMERAL }).catch(() => {});
                }
                return;
            }

            // --- ปุ่ม: เริ่มนับข้อความเก่า ---
            if (interaction.customId === 'btn_trigger_manual_count') {
                if (!await safeDefer(interaction, { flags: EPHEMERAL })) return;
                await handleManualCount(client, interaction);
                return;
            }

            // --- ปุ่ม: เปิด Modal นับเคส ---
            if (interaction.customId === 'btn_cfg_count') {
                return interaction.showModal(buildCountModal()).catch(err => {
                    console.error('❌ [configPanel] showModal นับเคสล้มเหลว:', err.message);
                });
            }

            // --- ปุ่ม: เปิด Modal ต้อนรับ ---
            if (interaction.customId === 'btn_cfg_welcome') {
                return interaction.showModal(buildWelcomeModal()).catch(err => {
                    console.error('❌ [configPanel] showModal ต้อนรับล้มเหลว:', err.message);
                });
            }

            // --- ปุ่ม: เปิด Modal BYPD ---
            if (interaction.customId === 'btn_cfg_bypd') {
                return interaction.showModal(buildBypdModal()).catch(err => {
                    console.error('❌ [configPanel] showModal BYPD ล้มเหลว:', err.message);
                });
            }

            // --- ปุ่ม: เปิด Modal ชีต PD ---
            if (interaction.customId === 'btn_cfg_registry') {
                return interaction.showModal(buildRegistryModal()).catch(err => {
                    console.error('❌ [configPanel] showModal ชีตPD ล้มเหลว:', err.message);
                });
            }

            // --- Modal Submit: นับเคส ---
            if (interaction.customId === 'modal_cfg_count') {
                if (!await safeDefer(interaction, { flags: EPHEMERAL })) return;
                try {
                    const msg = await handleCountSave(interaction);
                    await tryRefreshPanelMessage(interaction);
                    await interaction.editReply({ content: msg });
                } catch (err) {
                    console.error('❌ [configPanel] บันทึกนับเคสล้มเหลว:', err);
                    await interaction.editReply({ content: '❌ บันทึกไม่สำเร็จ — เช็กสิทธิ์ Google Sheet' });
                } finally {
                    setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
                }
                return;
            }

            // --- Modal Submit: ต้อนรับ ---
            if (interaction.customId === 'modal_cfg_welcome') {
                if (!await safeDefer(interaction, { flags: EPHEMERAL })) return;
                try {
                    const msg = await handleWelcomeSave(interaction);
                    await tryRefreshPanelMessage(interaction);
                    await interaction.editReply({ content: msg });
                } catch (err) {
                    await interaction.editReply({ content: '❌ บันทึกไม่สำเร็จ' });
                } finally {
                    setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
                }
                return;
            }

            // --- Modal Submit: BYPD ---
            if (interaction.customId === 'modal_cfg_bypd') {
                if (!await safeDefer(interaction, { flags: EPHEMERAL })) return;
                try {
                    const msg = await handleBypdSave(interaction);
                    await tryRefreshPanelMessage(interaction);
                    await interaction.editReply({ content: msg });
                } catch (err) {
                    await interaction.editReply({ content: '❌ บันทึกไม่สำเร็จ' });
                } finally {
                    setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
                }
                return;
            }

            // --- Modal Submit: ชีต PD ---
            if (interaction.customId === 'modal_cfg_registry') {
                if (!await safeDefer(interaction, { flags: EPHEMERAL })) return;
                try {
                    const msg = await handleRegistrySave(interaction);
                    await tryRefreshPanelMessage(interaction);
                    await interaction.editReply({ content: msg });
                } catch (err) {
                    await interaction.editReply({ content: '❌ บันทึกไม่สำเร็จ' });
                } finally {
                    setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
                }
                return;
            }

        } catch (err) {
            await handleInteractionError(interaction, err, 'configPanel');
        }
    });
};