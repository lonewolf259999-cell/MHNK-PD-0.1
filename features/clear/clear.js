const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, Events } = require('discord.js');
const { handleInteractionError } = require('../../utils/interactionSafe');

module.exports = async (client) => {
    
    // ใช้ Events.ClientReady ตามที่ Discord.js v14+ แนะนำ
    client.once(Events.ClientReady, async () => {
        const command = new SlashCommandBuilder()
            .setName('de')
            .setDescription('ลบข้อความล่าสุดในแชนแนลนี้ (สูงสุด 500)')
            .addIntegerOption(option => 
                option.setName('amount')
                    .setDescription('จำนวนข้อความที่ต้องการลบ (1-500)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(500)
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

        try {
            const existing = await client.application.commands.fetch();
            const oldCmd = existing.find(c => c.name === 'de');
            if (oldCmd) {
                // มีคำสั่งเก่า → อัปเดต (แก้ max จาก 100 → 500)
                await client.application.commands.edit(oldCmd.id, command);
                console.log('✅ [CLEAR] อัปเดตคำสั่ง /de (max 500)');
            } else {
                await client.application.commands.create(command);
                console.log('✅ [CLEAR] ลงทะเบียนคำสั่ง /de');
            }
        } catch (e) {
            console.error('❌ [CLEAR] ลงทะเบียนคำสั่งไม่สำเร็จ:', e);
        }
    });

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName !== 'de') return;

        const amount = interaction.options.getInteger('amount');
        const BATCH_SIZE = 100;
        const DELAY_BASE_MS = 3000;    // base 3 วิ
        const DELAY_JITTER_MS = 1000;  // random ±1 วิ (delay จริง = 3-4 วิ)

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        let totalDeleted = 0;
        let stoppedEarly = false;

        try {
            // ส่ง progress เริ่มต้น
            await interaction.editReply({ content: `🗑️ กำลังลบ... 0/${amount}` });

            // วนลูปทีละ BATCH_SIZE (100)
            for (let i = 0; i < amount; i += BATCH_SIZE) {
                const remaining = amount - totalDeleted;
                const toDelete = Math.min(BATCH_SIZE, remaining);

                const deleted = await interaction.channel.bulkDelete(toDelete, true);
                totalDeleted += deleted.size;

                // อัปเดต progress
                await interaction.editReply({ content: `🗑️ กำลังลบ... ${totalDeleted}/${amount}` });

                // ถ้าลบครบแล้ว หรือลบได้น้อยกว่าที่ขอ (อาจเจอข้อความเก่า) → หยุด
                if (totalDeleted >= amount || deleted.size < toDelete) {
                    if (deleted.size < toDelete) {
                        stoppedEarly = true;
                    }
                    break;
                }

                // หน่วงเวลาแบบ random ป้องกัน rate limit
                if (totalDeleted < amount) {
                    const jitter = Math.floor(Math.random() * DELAY_JITTER_MS);
                    const delay = DELAY_BASE_MS + jitter; // 3000-4000 ms
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // สรุปผล
            let resultMsg;
            if (stoppedEarly) {
                resultMsg = `⚠️ ลบได้ ${totalDeleted}/${amount} ข้อความ (บางส่วนเก่าเกิน 14 วันไม่สามารถลบได้)`;
            } else {
                resultMsg = `✅ ลบข้อความแล้ว ${totalDeleted}/${amount} ข้อความ`;
            }

            await interaction.editReply({ content: resultMsg });

            // ลบ reply ทิ้งอัตโนมัติหลัง 5 วิ
            setTimeout(async () => {
                try {
                    await interaction.deleteReply();
                } catch (err) {
                    // ignore ถ้าลบ reply ไม่ได้
                }
            }, 5000);

        } catch (err) {
            console.error('❌ [CLEAR] ลบข้อความไม่สำเร็จ:', err);

            // ถ้าเจอ error และลบไปแล้วบางส่วน
            if (totalDeleted > 0) {
                try {
                    await interaction.editReply({
                        content: `⚠️ ลบได้ ${totalDeleted}/${amount} ข้อความ แล้วพบข้อผิดพลาด: ${err.message}`
                    });
                    return;
                } catch (_) {}
            }

            // ถ้ายัง reply ไม่ได้
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ ไม่สามารถลบข้อความได้ (อาจเป็นข้อความเก่าเกิน 14 วัน)',
                    flags: [MessageFlags.Ephemeral]
                }).catch(() => {});
            } else {
                await handleInteractionError(interaction, err, 'clear');
            }
        }
    });
};