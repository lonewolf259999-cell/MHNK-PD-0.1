// =================================================================
// 📝 features/EditTAG/EditTAG.js — Context Menu "Edit Tags"
// (คลิกขวาที่ข้อความ > Apps > Edit Tags)
// =================================================================

const {
    ContextMenuCommandBuilder, ApplicationCommandType, Events,
    ActionRowBuilder, StringSelectMenuBuilder,
    ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { handleInteractionError } = require('../../utils/interactionSafe');
const sheetConfig = require('../../utils/sheetConfig');
const rateLimiter = require('../../utils/rateLimiter');

// =====================
// ตั้งค่า (fallback ถ้าไม่มีใน Sheet)
// =====================
const DEFAULT_MODE = '484012084577828875'; // ถ้าไม่มีใน Sheet → เฉพาะคุณ

// =====================

module.exports = async (client) => {
    // ฟังก์ชันเช็คสิทธิ์ — อ่านจาก SheetConfig
    const checkPermission = (userId) => {
        const rawMode = sheetConfig.get('EDIT_TAG_MODE') || DEFAULT_MODE;
        const mode = rawMode.trim();

        // 'All' หรือ 'all' = เปิดให้ทุกคน
        if (mode.toLowerCase() === 'all') return true;

        // ถ้าเป็น list ID คั่นด้วย , = เช็คในนั้น
        const ids = mode.split(',').map(id => id.trim()).filter(Boolean);
        return ids.includes(userId);
    };

    // ลงทะเบียน Context Menu Command
    client.once(Events.ClientReady, async () => {
        const contextMenu = new ContextMenuCommandBuilder()
            .setName('Edit Tags')
            .setType(ApplicationCommandType.Message);
        try {
            const existing = await client.application.commands.fetch();
            // ลบ /edittag เดิมถ้ายังมี
            const oldSlash = existing.find(c => c.name === 'edittag');
            if (oldSlash) {
                await oldSlash.delete();
                console.log('✅ [EditTAG] ลบ /edittag เดิมแล้ว');
            }
            // ลงทะเบียน Context Menu (ถ้ายังไม่มี)
            const oldCtx = existing.find(c => c.name === 'Edit Tags');
            if (!oldCtx) {
                await client.application.commands.create(contextMenu);
                console.log('✅ [EditTAG] ลงทะเบียน Context Menu "Edit Tags" แล้ว');
            }
        } catch (e) {
            console.error('❌ [EditTAG] ลงทะเบียนคำสั่งไม่สำเร็จ:', e);
        }
    });

    client.on('interactionCreate', async (i) => {
        const isEditTag =
            (i.isMessageContextMenuCommand() && i.commandName === 'Edit Tags') ||
            (i.isButton() && (i.customId.startsWith('editag_add_') || i.customId.startsWith('editag_rem_'))) ||
            (i.isModalSubmit() && i.customId.startsWith('editag_addmodal_')) ||
            (i.isStringSelectMenu() && (i.customId.startsWith('editag_remove_') || i.customId.startsWith('editag_addsel_')));
        if (!isEditTag) return;

        // ✅ Rate limit ก่อนทุกอย่าง
        const limitCheck = rateLimiter.check(i.user.id, 'edittag');
        if (!limitCheck.allowed) {
            const seconds = Math.ceil(limitCheck.resetIn / 1000);
            return i.reply({
                content: `⏳ กรุณารอ **${seconds}** วินาที ก่อนใช้งานคำสั่งนี้อีกครั้ง`,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        // เช็คสิทธิ์ทันที
        if (!checkPermission(i.user.id)) {
            return i.reply({
                content: '❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        try {
            // =============================================================
            // 1. CONTEXT MENU: คลิกขวาที่ข้อความ → แสดงปุ่ม ➕/➖
            // =============================================================
            if (i.isMessageContextMenuCommand() && i.commandName === 'Edit Tags') {
                await i.deferReply({ flags: MessageFlags.Ephemeral });
                const targetMsg = i.targetMessage;

                // ดึง mention IDs จากข้อความ
                const content = targetMsg.content || '';
                const mentionIds = Array.from(new Set(
                    (content.match(/<@!?(\d+)>/g) || []).map(m => m.match(/\d+/)[0])
                ));

                // เช็คว่า mention แรก = เจ้าของคดี (เรา)
                if (mentionIds.length === 0 || mentionIds[0] !== i.user.id) {
                    return i.editReply('❌ มรึงไม่ไช้เจ้าของคดี อย่า ซี้ซั้ว แก้ดี้');
                }

                const embed = new EmbedBuilder()
                    .setTitle('📋 จัดการแท็กคน')
                    .setDescription(`**ข้อความ:** ${content.substring(0, 100)}...\n**แท็กปัจจุบัน:** ${mentionIds.length} คน`)
                    .setColor(0x3b82f6);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`editag_add_${targetMsg.id}_${targetMsg.channel.id}`)
                        .setLabel('➕ เพิ่มคน')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`editag_rem_${targetMsg.id}_${targetMsg.channel.id}`)
                        .setLabel('➖ ลบคน')
                        .setStyle(ButtonStyle.Danger)
                );

                return i.editReply({ embeds: [embed], components: [row] });
            }

            // Helper: fetch ข้อความ
            const fetchMessageSafe = async (channel, msgId) => {
                try {
                    return await channel.messages.fetch(msgId);
                } catch (error) {
                    return null;
                }
            };

            // =============================================================
            // 2. ปุ่ม ➕ → เปิด Modal ให้พิมพ์รหัสตำรวจ
            //    ⚠️ ห้าม deferUpdate() ก่อน showModal() — Discord ไม่ยอม
            // =============================================================
            if (i.isButton() && i.customId.startsWith('editag_add_')) {
                const parts = i.customId.split('_');
                const msgId = parts[2];
                const channelId = parts[3];

                const modal = new ModalBuilder()
                    .setCustomId(`editag_addmodal_${msgId}_${channelId}`)
                    .setTitle('➕ เพิ่มคนในคดี')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('input_codes')
                                .setLabel('รหัสตำรวจที่ต้องการเพิ่ม')
                                .setStyle(TextInputStyle.Paragraph)
                                .setPlaceholder('พิมพ์รหัส เช่น 001, 005, 010 (คั่นด้วย , หรือ enter)')
                                .setRequired(true)
                                .setMaxLength(200)
                        )
                    );

                return i.showModal(modal).catch(() => {});
            }

            // =============================================================
            // 3. ส่ง Modal → ค้นหาจากรหัส → แสดง SelectMenu ให้ติ๊กเลือก
            // =============================================================
            if (i.isModalSubmit() && i.customId.startsWith('editag_addmodal_')) {
                await i.deferUpdate();
                const parts = i.customId.split('_');
                const msgId = parts[2];
                const channelId = parts[3];

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return i.editReply({ content: '❌ ไม่พบช่องนี้', components: [] });

                const msg = await fetchMessageSafe(targetChannel, msgId);
                if (!msg) return i.editReply({ content: '❌ ข้อความไม่อยู่แล้ว', components: [] });

                // แยกรหัสจาก input (คั่นด้วย , หรือ newline)
                const rawInput = i.fields.getTextInputValue('input_codes').trim();
                const codes = rawInput.split(/[\n,]+/).map(c => c.trim()).filter(Boolean);

                if (codes.length === 0) {
                    return i.editReply({ content: '❌ ไม่พบรหัสที่ต้องการเพิ่ม', components: [] });
                }

                // ค้นหาสมาชิกจากรหัส (nickname ขึ้นต้นด้วย "{code} [MHNK-PD]")
                const members = await i.guild.members.fetch();
                const foundMembers = [];
                const notFoundCodes = [];

                for (const code of codes) {
                    const prefix = `${code} [MHNK-PD]`;
                    // ค้นหาแบบ startsWith
                    const matches = members.filter(m => {
                        const nick = m.nickname || '';
                        return nick.startsWith(prefix);
                    });

                    if (matches.size > 0) {
                        for (const [, m] of matches) {
                            // ป้องกันซ้ำ
                            if (!foundMembers.some(fm => fm.id === m.id)) {
                                // หาชื่อแบบ readable
                                const codeMatch = (m.nickname || '').match(/^\d+\s+\[MHNK-PD\]\s+(.+)/);
                                const displayLabel = codeMatch ? `${code} - ${codeMatch[1]}` : `${code} - ${m.displayName}`;
                                foundMembers.push({ id: m.id, label: displayLabel });
                            }
                        }
                    } else {
                        notFoundCodes.push(code);
                    }
                }

                if (foundMembers.length === 0) {
                    return i.editReply({
                        content: `❌ ไม่พบสมาชิกรหัส: ${notFoundCodes.join(', ')}`,
                        components: []
                    });
                }

                // สร้าง SelectMenu ให้ติ๊กเลือก (25 คนต่อช่อง)
                const options = foundMembers.map(fm => ({
                    label: fm.label,
                    value: fm.id
                }));

                const rows = [];
                for (let idx = 0; idx < options.length; idx += 25) {
                    const chunk = options.slice(idx, idx + 25);
                    rows.push(
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`editag_addsel_${msgId}_${channelId}_${idx}`)
                                .setPlaceholder(`เลือกคนที่จะเพิ่ม (ชุดที่ ${Math.floor(idx / 25) + 1})`)
                                .setMinValues(1)
                                .setMaxValues(chunk.length)
                                .addOptions(chunk)
                        )
                    );
                }

                await i.editReply({
                    content: `✅ พบ ${foundMembers.length} คน${notFoundCodes.length > 0 ? `\n⚠️ ไม่พบรหัส: ${notFoundCodes.join(', ')}` : ''}\n**เลือกคนที่จะเพิ่ม:**`,
                    components: rows
                });
                return;
            }

            // =============================================================
            // 3b. SelectMenu ➕ → เพิ่มคนที่เลือกเข้าไปในข้อความ
            // =============================================================
            if (i.isStringSelectMenu() && i.customId.startsWith('editag_addsel_')) {
                await i.deferUpdate();
                const parts = i.customId.split('_');
                const msgId = parts[2];
                const channelId = parts[3];

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return i.editReply({ content: '❌ ไม่พบช่องนี้', components: [] });

                const msg = await fetchMessageSafe(targetChannel, msgId);
                if (!msg) return i.editReply({ content: '❌ ข้อความไม่อยู่แล้ว', components: [] });

                const selectedIds = i.values;
                let newContent = msg.content;
                let added = 0;
                for (const id of selectedIds) {
                    if (!newContent.includes(`<@${id}>`) && !newContent.includes(`<@!${id}>`)) {
                        newContent += ` <@${id}>`;
                        added++;
                    }
                }
                await msg.edit(newContent);
                await i.editReply({ content: `✅ เพิ่ม ${added} คนสำเร็จ`, components: [] });
                setTimeout(() => i.deleteReply().catch(() => {}), 3000);
                return;
            }

            // =============================================================
            // 4. ปุ่ม ➖ → แสดง SelectMenu เลือกคนที่จะลบ
            // =============================================================
            if (i.isButton() && i.customId.startsWith('editag_rem_')) {
                await i.deferUpdate();
                const parts = i.customId.split('_');
                const msgId = parts[2];
                const channelId = parts[3];

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return i.editReply({ content: '❌ ไม่พบช่องนี้', components: [] });

                const msg = await fetchMessageSafe(targetChannel, msgId);
                if (!msg) return i.editReply({ content: '❌ ข้อความนี้ถูกลบไปแล้ว', components: [] });

                const ids = Array.from(new Set((msg.content.match(/<@!?(\d+)>/g) || []).map(m => m.match(/\d+/)[0])));
                const options = [];
                for (const id of ids.slice(1)) {
                    const member = await i.guild.members.fetch(id).catch(() => null);
                    options.push({ label: member ? member.displayName : id, value: id });
                }

                if (options.length === 0) return i.editReply({ content: '❌ ไม่มีคนอื่นให้ลบแล้ว', components: [] });

                const rows = [];
                for (let idx = 0; idx < options.length; idx += 25) {
                    const chunk = options.slice(idx, idx + 25);
                    rows.push(
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`editag_remove_${msgId}_${channelId}_${idx}`)
                                .setPlaceholder(`เลือกคนที่จะลบ (ชุดที่ ${Math.floor(idx / 25) + 1})`)
                                .setMinValues(1)
                                .setMaxValues(chunk.length)
                                .addOptions(chunk)
                        )
                    );
                }

                await i.editReply({ content: 'เลือกคนที่จะ **ลบ** ออก:', components: rows });
            }

            // =============================================================
            // 5. SelectMenu → ลบคนออกจากข้อความ
            // =============================================================
            if (i.isStringSelectMenu() && i.customId.startsWith('editag_remove_')) {
                await i.deferUpdate();
                const parts = i.customId.split('_');
                const msgId = parts[2];
                const channelId = parts[3];

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return i.editReply({ content: '❌ ไม่พบช่องนี้', components: [] });

                const msg = await fetchMessageSafe(targetChannel, msgId);
                if (!msg) return i.editReply({ content: '❌ ข้อความไม่อยู่แล้ว', components: [] });

                const removeIds = i.values;
                let newContent = msg.content;
                for (const id of removeIds) {
                    newContent = newContent.replace(new RegExp(`<@!?${id}>`, 'g'), '');
                }
                newContent = newContent.replace(/\s+/g, ' ').trim();

                await msg.edit(newContent);
                await i.editReply({ content: `✅ ลบ ${removeIds.length} คนสำเร็จ`, components: [] });
                setTimeout(() => i.deleteReply().catch(() => {}), 3000);
            }

        } catch (err) {
            await handleInteractionError(i, err, 'EditTAG');
        }
    });
};