const {
    SlashCommandBuilder, Events,
    ActionRowBuilder, StringSelectMenuBuilder,
    ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder
} = require('discord.js');
const { handleInteractionError } = require('../../utils/interactionSafe');

// =====================
// ตั้งค่าที่นี่ เท่านั้น!
// =====================
const CONFIG = {
    mode: 'whitelist', // 'all' = ใช้ได้ทุกคน, 'whitelist' = เฉพาะคนในรายการ
    allowedUsers: ['484012084577828875'], // User ID ที่อนุญาต (ใส่กี่คนก็ได้)
    // เปลี่ยน mode เป็น 'all' เพื่อเปิดให้ทุกคนใช้ได้
    // เปลี่ยน mode เป็น 'whitelist' เพื่อจำกัดเฉพาะ allowedUsers
};
// =====================

module.exports = async (client) => {
    // ฟังก์ชันเช็คสิทธิ์
    const checkPermission = (userId) => {
        if (CONFIG.mode === 'all') return true;
        return CONFIG.allowedUsers.includes(userId);
    };

    // ลงทะเบียน Slash Command
    client.once(Events.ClientReady, async () => {
        const command = new SlashCommandBuilder()
            .setName('edittag')
            .setDescription('แก้ไขแท็กคนในข้อความ')
            .addChannelOption(opt =>
                opt.setName('channel')
                   .setDescription('ช่องที่มีข้อความ')
                   .setRequired(true)
            );
        try {
            const existing = await client.application.commands.fetch();
            const oldCmd = existing.find(c => c.name === 'edittag');
            if (oldCmd) {
                await oldCmd.delete();
                console.log('🗑️ [EditTAG] ลบคำสั่งเก่า');
            }
            await client.application.commands.create(command);
            console.log('✅ [EditTAG] ลงทะเบียนคำสั่งใหม่');
        } catch (e) {
            console.error('❌ [EditTAG] ลงทะเบียนคำสั่งไม่สำเร็จ:', e);
        }
    });

    client.on('interactionCreate', async (i) => {
        const isEditTag =
            (i.isChatInputCommand() && i.commandName === 'edittag') ||
            (i.isStringSelectMenu() && i.customId.startsWith('editag_selectmsg_')) ||
            (i.isButton() && (i.customId.startsWith('editag_add_') || i.customId.startsWith('editag_rem_'))) ||
            (i.isStringSelectMenu() && i.customId.startsWith('editag_addsel_')) ||
            (i.isStringSelectMenu() && i.customId.startsWith('editag_remove_'));
        if (!isEditTag) return;

        // เช็คสิทธิ์ทันที
        if (!checkPermission(i.user.id)) {
            if (i.isChatInputCommand() || i.isButton() || i.isStringSelectMenu()) {
                return i.reply({
                    content: '❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
            return;
        }

        try {
            const fetchMessageSafe = async (channel, msgId) => {
                try {
                    return await channel.messages.fetch(msgId);
                } catch (error) {
                    return null;
                }
            };

            // 1. Slash Command: ดึง 5 โพสล่าสุด → กรองเฉพาะคดีของตัวเอง → เอาอันล่าสุด
            if (i.isChatInputCommand() && i.commandName === 'edittag') {
                await i.deferReply({ flags: MessageFlags.Ephemeral });
                const targetChannel = i.options.getChannel('channel');

                // ดึง 5 โพสล่าสุด
                const messages = await targetChannel.messages.fetch({ limit: 5 });
                let latestMsg = null;

                for (const [id, msg] of messages) {
                const mentionIds = Array.from(new Set(msg.content.match(/\d{17,19}/g) || []));
                    // เช็คว่า userID เป็นแท็กแรก (เจ้าของคดี) และมีแท็กคน
                    if (mentionIds.length > 0 && mentionIds[0] === i.user.id) {
                        latestMsg = msg;
                        break; // เจออันล่าสุดแล้ว หยุด
                }
                }

                if (!latestMsg) {
                    return i.editReply('❌ ไม่พบคดีของคุณใน 5 โพสล่าสุด');
                }

                const mentionIds = Array.from(new Set(latestMsg.content.match(/\d{17,19}/g) || []));

                const embed = new EmbedBuilder()
                    .setTitle('📋 จัดการแท็กคน')
                    .setDescription(`**ข้อความ:** ${latestMsg.content.substring(0, 100)}...\n**แท็กปัจจุบัน:** ${mentionIds.length} คน`)
                    .setColor(0x3b82f6);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`editag_add_${latestMsg.id}_${targetChannel.id}`)
                        .setLabel('➕ เพิ่มคน')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`editag_rem_${latestMsg.id}_${targetChannel.id}`)
                        .setLabel('➖ ลบคน')
                        .setStyle(ButtonStyle.Danger)
                );

                await i.editReply({ embeds: [embed], components: [row] });
                }

            // 2. เลือกข้อความแล้ว → แสดงปุ่ม ➕ ➖
            if (i.isStringSelectMenu() && i.customId.startsWith('editag_selectmsg_')) {
                await i.deferUpdate();
                const parts = i.customId.split('_');
                const channelId = parts[2];
                const msgId = i.values[0];

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return i.editReply({ content: '❌ ไม่พบช่องนี้', components: [] });

                const msg = await fetchMessageSafe(targetChannel, msgId);
                if (!msg) return i.editReply({ content: '❌ ไม่พบข้อความนี้', components: [] });

                const mentionIds = Array.from(new Set(msg.content.match(/\d{17,19}/g) || []));
                if (mentionIds.length === 0) {
                    return i.editReply({ content: '❌ ไม่พบแท็กคนในข้อความนี้', components: [] });
                }

                // เช็คเจ้าของ (แท็กแรก)
                if (i.user.id !== mentionIds[0]) {
                    return i.editReply({ content: '❌ มรึงไม่ไช้เจ้าของคดี อย่า ซี้ซั้ว แก้ดี้', components: [] });
                }
                const embed = new EmbedBuilder()
                    .setTitle('📋 จัดการแท็กคน')
                    .setDescription(`**ข้อความ:** ${msg.content.substring(0, 100)}...\n**แท็กปัจจุบัน:** ${mentionIds.length} คน`)
                    .setColor(0x3b82f6);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`editag_add_${msg.id}_${channelId}`)
                        .setLabel('➕ เพิ่มคน')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`editag_rem_${msg.id}_${channelId}`)
                        .setLabel('➖ ลบคน')
                        .setStyle(ButtonStyle.Danger)
                    );

                await i.editReply({ embeds: [embed], components: [row] });
                }

            // 3. กดปุ่ม เพิ่มคน
            if (i.isButton() && i.customId.startsWith('editag_add_')) {
                await i.deferUpdate();
                const parts = i.customId.split('_');
                const msgId = parts[2];
                const channelId = parts[3];

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return i.editReply({ content: '❌ ไม่พบช่องนี้', components: [] });

                // ดึงสมาชิกทั้งหมดในเซิร์ฟเวอร์เพื่อสร้าง options
                const members = await i.guild.members.fetch();
                const options = [];
                for (const [id, member] of members) {
                    if (member.user.bot) continue; // ข้ามบอท
                    options.push({
                        label: member.displayName,
                        value: id
                    });
                }

                if (options.length === 0) {
                    return i.editReply({ content: '❌ ไม่พบสมาชิกในเซิร์ฟเวอร์', components: [] });
                }

                const rows = [];
                for (let idx = 0; idx < options.length; idx += 25) {
                    const chunk = options.slice(idx, idx + 25);
                    rows.push(
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`editag_addsel_${msgId}_${channelId}_${idx}`)
                                .setPlaceholder(`เลือกคนที่จะเพิ่ม (ชุดที่ ${Math.floor(idx/25) + 1})`)
                                .setMinValues(1)
                                .setMaxValues(chunk.length)
                                .addOptions(chunk)
                        )
                    );
                }

                await i.editReply({ content: 'เลือกคนที่จะ **เพิ่ม** เข้าไป:', components: rows });
            }

            // 4. กดปุ่ม ลบคน
            if (i.isButton() && i.customId.startsWith('editag_rem_')) {
                await i.deferUpdate();
                const parts = i.customId.split('_');
                const msgId = parts[2];
                const channelId = parts[3];

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return i.editReply({ content: '❌ ไม่พบช่องนี้', components: [] });

                const msg = await fetchMessageSafe(targetChannel, msgId);
                if (!msg) return i.editReply({ content: '❌ ข้อความนี้ถูกลบไปแล้ว', components: [] });

                const ids = Array.from(new Set(msg.content.match(/\d{17,19}/g) || []));
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
                                .setPlaceholder(`เลือกคนที่จะลบ (ชุดที่ ${Math.floor(idx/25) + 1})`)
                                .setMinValues(1)
                                .setMaxValues(chunk.length)
                                .addOptions(chunk)
                        )
                    );
                }

                await i.editReply({ content: 'เลือกคนที่จะ **ลบ** ออก:', components: rows });
            }

            // 5. เลือกคนเพิ่ม
            if (i.isStringSelectMenu() && i.customId.startsWith('editag_addsel_')) {
                await i.deferUpdate();
                const parts = i.customId.split('_');
                const msgId = parts[2];
                const channelId = parts[3];

                const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) return i.editReply({ content: '❌ ไม่พบช่องนี้', components: [] });

                const msg = await fetchMessageSafe(targetChannel, msgId);
                if (!msg) return i.editReply({ content: '❌ ข้อความไม่อยู่แล้ว', components: [] });

                const newIds = i.values;
                let newContent = msg.content;
                for (const id of newIds) {
                    if (!newContent.includes(id)) {
                        newContent += ` <@${id}>`;
        }
                }
                await msg.edit(newContent);
                await i.editReply({ content: `✅ เพิ่ม ${newIds.length} คนสำเร็จ`, components: [] });
                setTimeout(() => i.deleteReply().catch(() => {}), 3000);
            }

            // 6. เลือกคนลบ
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

