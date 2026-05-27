const { Events, EmbedBuilder } = require('discord.js');

module.exports = async (client) => {
    const PREFIX = 'c';

    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        // ตัด prefix แล้วเช็คว่ามีอะไรต่อไปไหม
        const afterPrefix = message.content.slice(PREFIX.length).trim();
        if (afterPrefix !== '') return; // พิม c!xxx → ไม่ตอบ

        const embed = new EmbedBuilder()
            .setTitle('ประชาชนถูกจับโดยเจ้าหน้าที่')
            .setColor(0xff0000)
            .setDescription(
                '**ผู้ต้องหา** Baigapow Mookrob [ ID: 6 ] ถูกจับโดยเจ้าหน้าที่ Tuff Dev [ ID: 3 ]\n' +
                '**คดี :** ปูน น้ำมัน\n' +
                '**จำคุก :** 1 นาที\n' +
                '**ค่าปรับ :** 500 $\n' +
                'BYPD 00 01\n\n' +
                '**Name:** Tuff Dev\n' +
                '**Discord:** <@484012084577828875>\n' +
                '**Identifier:** steam:11000010c891be6\n' +
                '**Coords:** -284.1, -1026.1, 30.4\n' +
                '**Unique:** POLICECASE2_11000010c891be6\n' +
                '**IP:** 223.206.186.162'
            )
            .setFooter({
                text: 'NC Developer • 25/05/2026 - 18:25:23',
                iconURL: 'https://cdn.discordapp.com/attachments/1023732697052483737/1023732924954185730/128.png'
            });

        try {
            await message.channel.send({ embeds: [embed] });
            await message.delete();
        } catch (err) {
            console.error('[TESTCHAT] Error:', err);
        }
    });

    console.log('✅ [TESTCHAT] โหลดโมดูลเรียบร้อย');
};
