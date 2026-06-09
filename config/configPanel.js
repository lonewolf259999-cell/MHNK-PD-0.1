// =================================================================
// ⚙️ config/configPanel.js — แผงควบคุม 6 ปุ่ม + Modal ตั้งค่า + /editpd
// =================================================================

const { REST, Routes, Events, SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { handleInteractionError } = require('../utils/interactionSafe');
const { createPanelEmbed, buildPanelComponents, sendPanelToChannel } = require('./panelBuilder');
const { buildCountModal, buildWelcomeModal, buildBypdModal, buildRegistryModal } = require('./modals');
const { handleRefreshConfig, handleManualCount, handleCountSave, handleWelcomeSave, handleBypdSave, handleRegistrySave, tryRefreshPanelMessage, handleResendBypd } = require('./actions');
const sheetConfig = require('../utils/sheetConfig');
const EPHEMERAL = MessageFlags.Ephemeral;

const CONFIG_PANEL_IDS = new Set([
    'btn_refresh_config',
    'btn_trigger_manual_count',
    'btn_cfg_count',
    'btn_cfg_welcome',
    'btn_cfg_bypd',
    'btn_cfg_registry',
    'btn_resend_bypd',
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
            const commands = [
                new SlashCommandBuilder()
                    .setName('recount')
                    .setDescription('⚙️ แผงควบคุมตั้งค่าและนับยอดเคส'),
                new SlashCommandBuilder()
                    .setName('editpd')
                    .setDescription('📝 แก้ไขโปรไฟล์ตำรวจ (ชื่อ IC, เบอร์โทร, อายุ)')
            ].map(cmd => cmd.toJSON());

            const rest = new REST({ version: '10' }).setToken(client.token);
            for (const guild of client.guilds.cache.values()) {
                await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
            }
        } catch (err) {
            console.error('❌ [configPanel] ลงทะเบียนคำสั่งล้มเหลว:', err);
        }
    });

    client.on('interactionCreate', async (interaction) => {
        // =================================================================
        // ✅ /editpd — ทุกคนใช้ได้ ไม่ต้องเช็ค admin
        //    แก้ไขชื่อ IC, เบอร์โทร IC, อายุ OOC
        //    อัปเดต Sheet (ชื่อ) + Embed (ชื่อ,เบอร์,อายุ) + Discord nickname
        // =================================================================
        if (interaction.isChatInputCommand() && interaction.commandName === 'editpd') {
            const modal = new ModalBuilder()
                .setCustomId('modal_edit_pd')
                .setTitle('📝 แก้ไขโปรไฟล์ตำรวจ')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('input_ic_name')
                            .setLabel('ชื่อ IC ใหม่')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('กรุณากรอกชื่อ IC ใหม่ (ถ้าไม่เปลี่ยนปล่อยว่าง)')
                            .setRequired(false)
                            .setMaxLength(100)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('input_ic_phone')
                            .setLabel('เบอร์โทร IC ใหม่')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('กรุณากรอกเบอร์โทรใหม่ (ถ้าไม่เปลี่ยนปล่อยว่าง)')
                            .setRequired(false)
                            .setMaxLength(20)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('input_ooc_age')
                            .setLabel('อายุ OOC ใหม่')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('กรุณากรอกอายุใหม่ (ถ้าไม่เปลี่ยนปล่อยว่าง)')
                            .setRequired(false)
                            .setMaxLength(3)
                    )
                );
            return await interaction.showModal(modal);
        }

        // =================================================================
        // ✅ modal_edit_pd submit — ทุกคนใช้ได้
        // =================================================================
        if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_pd') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            try {
                const newName = interaction.fields.getTextInputValue('input_ic_name').trim();
                const newPhone = interaction.fields.getTextInputValue('input_ic_phone').trim();
                const newAge = interaction.fields.getTextInputValue('input_ooc_age').trim();
                const userId = interaction.user.id;
                const changedFields = [];

                // หา Log channel ID
                const logChannelId = sheetConfig.getLogChannelId();
                if (!logChannelId) {
                    return await interaction.editReply({ content: '❌ ไม่ได้ตั้งค่า Log channel' });
                }

                const logChannel = interaction.guild.channels.cache.get(logChannelId);
                if (!logChannel) {
                    return await interaction.editReply({ content: '❌ ไม่พบ Log channel ในเซิร์ฟเวอร์นี้' });
                }

                // ค้นหา Embed ที่มี Discord ID ตรงกับ userId
                let embedMsg = null;
                const messages = await logChannel.messages.fetch({ limit: 100 });
                for (const msg of messages.values()) {
                    if (msg.embeds.length === 0) continue;
                    const embed = msg.embeds[0];
                    const discordIdField = embed.fields?.find(f => f.name.includes('Discord ID'));
                    if (!discordIdField) continue;
                    const idInEmbed = discordIdField.value.replace(/`/g, '').trim();
                    if (idInEmbed === userId) {
                        embedMsg = msg;
                        break;
                    }
                }

                if (!embedMsg) {
                    return await interaction.editReply({
                        content: '❌ ไม่พบประวัติการลงทะเบียนของคุณใน Log channel'
                    });
                }

                // ✅ ค้นหาข้อความ Fivem จาก messages ที่ fetch มาแล้ว
                let fivemMsg = null;
                for (const msg of messages.values()) {
                    if (msg.author.bot && msg.content && msg.content.includes('คัดลอกไปวางที่ Fivem')) {
                        fivemMsg = msg;
                        console.log(`✅ [editpd] เจอ Fivem message (ID: ${msg.id})`);
                        break;
                    }
                }
                if (!fivemMsg) {
                    console.log(`⚠️ [editpd] ไม่พบ Fivem message ใน 100 ข้อความล่าสุด — จะส่งใหม่แทน`);
                }

                // ✅ หาแถวใน Sheet และอัปเดตชื่อ
                const { findMemberByDiscordId, updateMemberNameInSheet } = require('../features/welcome/sheetManager');

                // ✅ ถ้ามีการเปลี่ยนชื่อ IC
                if (newName) {
                    const memberInfo = await findMemberByDiscordId(userId);
                    if (memberInfo) {
                        const fullNewName = `${memberInfo.codeNumber} [MHNK-PD] ${newName}`;

                        // อัปเดต Sheet คอลัมน์ D
                        await updateMemberNameInSheet(memberInfo.row, fullNewName);

                        // อัปเดต Discord nickname
                        const MAX_DISCORD_NICKNAME = 32;
                        let discordNickname = fullNewName;
                        if (fullNewName.length > MAX_DISCORD_NICKNAME) {
                            const prefixMatch = fullNewName.match(/^(.+? \[MHNK-PD\] )/);
                            if (prefixMatch) {
                                const prefix = prefixMatch[1];
                                const icPart = fullNewName.slice(prefix.length);
                                const availableForIC = MAX_DISCORD_NICKNAME - prefix.length;
                                if (availableForIC > 0) {
                                    discordNickname = prefix + icPart.slice(0, availableForIC);
                                } else {
                                    discordNickname = fullNewName.slice(0, MAX_DISCORD_NICKNAME);
                                }
                            } else {
                                discordNickname = fullNewName.slice(0, MAX_DISCORD_NICKNAME);
                            }
                        }
                        try {
                            await interaction.member.setNickname(discordNickname);
                        } catch (err) {
                            console.warn(`⚠️ [editpd] ไม่สามารถเปลี่ยน nickname: ${err.message}`);
                        }

                        changedFields.push(`ชื่อ IC → **${newName}**`);
                    } else {
                        console.warn(`⚠️ [editpd] ไม่พบข้อมูล ${userId} ใน Sheet`);
                    }
                }

                // ✅ แก้ไข Embed ใน Log channel
                let currentEmbed = EmbedBuilder.from(embedMsg.embeds[0]);
                let discordNicknameForFivem = '';
                if (newName) {
                    // อัปเดตชื่อ IC field (index 1)
                    currentEmbed = currentEmbed.spliceFields(1, 1, { name: '📛 ชื่อ IC', value: `${newName}`, inline: true });

                    // คำนวณชื่อในระบบแบบเดียวกับ welcome (ตัดให้เหลือ 32 ตัว)
                    const memberInfo = await findMemberByDiscordId(userId).catch(() => null);
                    if (memberInfo) {
                        const fullNewName = `${memberInfo.codeNumber} [MHNK-PD] ${newName}`;
                        const MAX_DISCORD_NICKNAME = 32;
                        let displayName = fullNewName;
                        if (fullNewName.length > MAX_DISCORD_NICKNAME) {
                            const prefixMatch = fullNewName.match(/^(.+? \[MHNK-PD\] )/);
                            if (prefixMatch) {
                                const prefix = prefixMatch[1];
                                const icPart = fullNewName.slice(prefix.length);
                                const availableForIC = MAX_DISCORD_NICKNAME - prefix.length;
                                if (availableForIC > 0) {
                                    displayName = prefix + icPart.slice(0, availableForIC);
                                } else {
                                    displayName = fullNewName.slice(0, MAX_DISCORD_NICKNAME);
                                }
                            } else {
                                displayName = fullNewName.slice(0, MAX_DISCORD_NICKNAME);
                            }
                        }
                        discordNicknameForFivem = displayName;
                        // อัปเดตชื่อในระบบ field (index 2) — ใช้ชื่อที่ตัดแล้ว เหมือน welcome
                        currentEmbed = currentEmbed.spliceFields(2, 1, { name: '⚙️ ชื่อในระบบ', value: `\`${displayName}\``, inline: false });
                    }
                }
                if (newPhone) {
                    currentEmbed = currentEmbed.spliceFields(3, 1, { name: '📞 เบอร์โทร IC', value: `${newPhone}`, inline: true });
                    changedFields.push(`เบอร์โทร → **${newPhone}**`);
                }
                if (newAge) {
                    currentEmbed = currentEmbed.spliceFields(4, 1, { name: '🎂 อายุ OOC', value: `${newAge} ปี`, inline: true });
                    changedFields.push(`อายุ → **${newAge}**`);
                }
                await embedMsg.edit({ embeds: [currentEmbed] });

                // ✅ ถ้ามีการเปลี่ยนชื่อ → แก้ไขข้อความ Fivem แทนการส่งเพิ่ม
                if (newName && discordNicknameForFivem) {
                    const fivemContent = `- คัดลอกไปวางที่ Fivem ใน ⚙️Setting > Player Name ก่อนเข้าประเทศ\n\`\`\`${discordNicknameForFivem}\`\`\``;
                    if (fivemMsg) {
                        await fivemMsg.edit(fivemContent);
                    } else {
                        await logChannel.send(fivemContent);
                    }
                }

                // ✅ สรุปผลลัพธ์
                if (changedFields.length === 0) {
                    return await interaction.editReply({ content: '⚠️ ไม่มีการเปลี่ยนแปลงใดๆ (คุณไม่ได้กรอกข้อมูลใหม่)' });
                }

                let replyMessage = '✅ อัปเดตข้อมูลสำเร็จ!\n' + changedFields.join('\n');
                if (newName) {
                    replyMessage += '\n🔄 Discord nickname ถูกเปลี่ยนตามชื่อ IC ใหม่แล้ว';
                }

                await interaction.editReply({ content: replyMessage });

            } catch (err) {
                console.error('❌ [editpd] error:', err);
                await interaction.editReply({
                    content: '❌ เกิดข้อผิดพลาด โปรดลองอีกครั้งหรือแจ้งเจ้าหน้าที่'
                });
            }
            return;
        }

        // =================================================================
        // ✅ ระบบเดิม — แผงควบคุม + ปุ่ม + Modal (เฉพาะ admin)
        // =================================================================
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

            // --- ปุ่ม: ส่งย้อนหลัง BYPD (toggle ส่ง/หยุด) ---
            if (interaction.customId === 'btn_resend_bypd') {
                if (!await safeDefer(interaction, { flags: EPHEMERAL })) return;
                try {
                    await handleResendBypd(client, interaction);
                } catch (err) {
                    console.error('❌ [configPanel] ส่งย้อนหลัง BYPD ล้มเหลว:', err);
                    await interaction.editReply({ content: `❌ เกิดข้อผิดพลาด: ${err.message}` });
                }
                return;
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

