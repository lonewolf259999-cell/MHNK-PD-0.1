const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, Events } = require('discord.js');
const { handleInteractionError } = require('../../utils/interactionSafe');

module.exports = async (client) => {
    
    // ใช้ Events.ClientReady ตามที่ Discord.js v14+ แนะนำ
    client.once(Events.ClientReady, async () => {
        const command = new SlashCommandBuilder()
            .setName('de')
            .setDescription('ลบข้อความล่าสุดในแชนแนลนี้')
            .addIntegerOption(option => 
                option.setName('amount')
                    .setDescription('จำนวนข้อความที่ต้องการลบ (1-100)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100)
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

        try {
            const existing = await client.application.commands.fetch();
            if (existing.some(c => c.name === 'de')) {
                console.log('✅ [CLEAR] คำสั่ง /de มีอยู่แล้ว — ข้ามการลงทะเบียนซ้ำ');
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

        try {
            const deleted = await interaction.channel.bulkDelete(amount, true);
            
            const reply = await interaction.reply({ 
                content: `🗑️ ลบข้อความไปแล้ว ${deleted.size} ข้อความ`, 
                flags: [MessageFlags.Ephemeral] 
            });

            // ลบข้อความตอบกลับเองใน 3 วินาที
            setTimeout(async () => {
                try {
                    await interaction.deleteReply();
                } catch (err) {
                    console.error('❌ ไม่สามารถลบข้อความตอบกลับได้:', err);
                }
            }, 3000);

        } catch (err) {
            console.error('❌ ลบข้อความไม่สำเร็จ:', err);
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