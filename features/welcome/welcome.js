// =================================================================
// 🚪 features/welcome/welcome.js
// =================================================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
const { registerMemberToSheet, moveMemberToOutSheet, isAlreadyRegistered } = require('./sheetManager');
const sheetConfig = require('../../utils/sheetConfig');
const { handleInteractionError } = require('../../utils/interactionSafe');

module.exports = async (client) => {

    client.on('guildMemberAdd', async (member) => {
        const channel = member.guild.channels.cache.get(sheetConfig.getWelcomeChannelId());
        if (!channel) return;

        const memberCount = member.guild.memberCount;

        const welcomeEmbed = new EmbedBuilder()
            .setColor('#3aca1d')
            .setTitle('🎉 ยินดีต้อนรับสู่ Mahanakorn Diwa!')
            .setDescription(`ยินดีต้อนรับ <@${member.user.id}> สู่ Mahanakorn Diwa!\n กดลงทะเบียนก่อนนะ 🎉`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 สมาชิกใหม่', value: `<@${member.user.id}>`, inline: true },
                { name: '👥 สมาชิกรวม', value: `${memberCount} คน`, inline: true }
            )
            .setFooter({ text: `${client.user.username} • วันนี้` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_register_pd')
                .setLabel('กรอกชื่อ IC ตามบัตรในเมือง')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝')
        );

        await channel.send({ embeds: [welcomeEmbed], components: [row] });
    });


    client.on('guildMemberRemove', async (member) => {
        try {
            await moveMemberToOutSheet(member.user.id);
                } catch (err) {
            console.error('❌ [welcome] ย้ายข้อมูลคนออกไม่สำเร็จ:', err);
                }

        const channel = member.guild.channels.cache.get(sheetConfig.getWelcomeChannelId());
        if (!channel) return;

        const memberCount = member.guild.memberCount;

        const leaveEmbed = new EmbedBuilder()
            .setColor('#db0042')
            .setTitle('😭 บ๊ายบาย แล้วพบกันใหม่')
            .setDescription(`สมาชิก <@${member.user.id}> ได้ออกจากเซิร์ฟเวอร์`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 ผู้จากไป', value: `<@${member.user.id}>`, inline: true },
                { name: '👥 สมาชิกที่เหลือ', value: `${memberCount} คน`, inline: true }
            )
            .setFooter({ text: `${client.user.username} • วันนี้` })
                        .setTimestamp();

        await channel.send({ embeds: [leaveEmbed] });
    });

    // 3. ระบบตรวจจับการกดปุ่มและการส่งข้อมูลผ่านหน้าต่าง Modal
    client.on('interactionCreate', async (interaction) => {
        const isRegister = (interaction.isButton() && interaction.customId === 'btn_register_pd')
            || (interaction.isModalSubmit() && interaction.customId === 'modal_register_pd');
        if (!isRegister) return;
        try {

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_register_pd') {

                const registered = await isAlreadyRegistered(interaction.user.id);
                if (registered) {
                    return await interaction.reply({
                        content: '❌ คุณลงทะเบียนไปแล้ว ไม่สามารถลงทะเบียนซ้ำได้ครับ!',
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId('modal_register_pd')
                    .setTitle('ฟอร์มลงทะเบียนข้อมูลตำรวจ');

                // ช่องที่ 1: ชื่อ IC
                const icNameInput = new TextInputBuilder()
                    .setCustomId('input_ic_name')
                    .setLabel("ชื่อ IC ตามบัตรประชาชนในประเทศ ")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('กรุณากรอกชื่อในเกมของคุณเป็นภาษาอังกฤษ')
                    .setRequired(true);

                // ช่องที่ 2: เบอร์โทร IC (ส่งไปเฉพาะห้อง Log ไม่ลงชีต)
                const icPhoneInput = new TextInputBuilder()
                    .setCustomId('input_ic_phone')
                    .setLabel("เบอร์โทร IC")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('กรุณากรอกเบอร์โทรศัพท์ในเกม')
                    .setRequired(true);

                // ช่องที่ 3: อายุ OOC (ส่งไปเฉพาะห้อง Log ไม่ลงชีต)
                const oocAgeInput = new TextInputBuilder()
                    .setCustomId('input_ooc_age')
                    .setLabel("อายุ OOC (ชีวิตจริง)")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('กรุณากรอกอายุจริงของคุณ')
                    .setRequired(true);

                // รวมชิ้นส่วนเข้าหน้าต่างป๊อปอัพ
                const firstRow = new ActionRowBuilder().addComponents(icNameInput);
                const secondRow = new ActionRowBuilder().addComponents(icPhoneInput);
                const thirdRow = new ActionRowBuilder().addComponents(oocAgeInput);

                modal.addComponents(firstRow, secondRow, thirdRow);

                try {
                    await interaction.showModal(modal);
        } catch (err) {
                    if (err.code !== 'InteractionAlreadyReplied') throw err;
        }
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_register_pd') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

                // ดึงค่าจากทั้ง 3 ช่องที่ผู้ใช้กรอกมา
                const icName = interaction.fields.getTextInputValue('input_ic_name').trim();
                const icPhone = interaction.fields.getTextInputValue('input_ic_phone').trim();
                const oocAge = interaction.fields.getTextInputValue('input_ooc_age').trim();
                const userId = interaction.user.id;

                // ส่งเฉพาะ icName และ userId ไปจัดการที่ Sheet (เบอร์และอายุไม่ถูกส่งไปบันทึกใน Excel)
                const finalNickname = await registerMemberToSheet(icName, userId);

                if (!finalNickname) {
                    return await interaction.editReply({
                        content: '❌ เกิดข้อผิดพลาด: ไม่พบแถวว่างในตาราง Google Sheets หรือเกิดปัญหาในระบบ โปรดแจ้งเจ้าหน้าที่'
    });
                }

                let nicknameChanged = true;
                try {
                    await interaction.member.setNickname(finalNickname);
                } catch (error) {
                    console.error(`⚠️ ไม่สามารถเปลี่ยนชื่อให้ยูสเซอร์ได้เนื่องจากสิทธิ์ของบอทไม่เพียงพอ: ${interaction.user.tag}`);
                    nicknameChanged = false;
                }

                // 4. ส่งประวัติข้อมูลทั้งหมด (รวมถึงเบอร์โทรและอายุ) ไปที่ห้องเก็บ Log
                const logChannel = interaction.guild.channels.cache.get(sheetConfig.getLogChannelId());
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#a0c400')
                        .setTitle('📝 มีการลงทะเบียนใหม่ผ่านระบบสำเร็จ')
                        .setDescription(`ผู้ใช้งาน <@${userId}> ลงทะเบียนเข้าสู่ระบบสำเร็จแล้ว`)
                        .addFields(
                            { name: '🆔 Discord ID', value: `\`${userId}\``, inline: true },
                            { name: '📛 ชื่อ IC', value: `${icName}`, inline: true },
                            { name: '⚙️ ชื่อในระบบ', value: `\`${finalNickname}\``, inline: false },
                            { name: '📞 เบอร์โทร IC', value: `${icPhone}`, inline: true },
                            { name: '🎂 อายุ OOC', value: `${oocAge} ปี`, inline: true },
                            { name: '🏷️ ตำแหน่ง', value: `นักเรียนตำรวจ`, inline: true },
                            { name: '📱 สถานะการเปลี่ยนชื่อดิส', value: nicknameChanged ? '✅ สำเร็จ' : '❌ ล้มเหลว (สิทธิ์บอทน้อยกว่ายศคุณ)', inline: true }
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }

                let successMessage = `✅ ลงทะเบียนเรียบร้อยแล้ว!\n📝 ชื่อใหม่ของคุณคือ: **${finalNickname}**\n📊 ระบบทำการบันทึกข้อมูลและตั้งค่าให้คุณเป็น **นักเรียนตำรวจ** เรียบร้อยแล้วครับ`;
                if (!nicknameChanged) {
                    successMessage += `\n⚠️ *(หมายเหตุ: บอทไม่มีสิทธิ์เปลี่ยนชื่อเล่นให้คุณ โปรดเปลี่ยนชื่อเล่นเองให้ตรงกับระบบนะครับ)*`;
                }

                await interaction.editReply({ content: successMessage });
            }
        }

        } catch (err) {
            await handleInteractionError(interaction, err, 'welcome');
        }
    });
};