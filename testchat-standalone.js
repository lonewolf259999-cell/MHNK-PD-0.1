// =================================================================
// 🧪 testchat-standalone.js — รันเฉพาะฟีเจอร์ testchat โดยไม่ต้องโหลดอย่างอื่น
// =================================================================
// รันด้วย: node testchat-standalone.js

const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { BOT_TOKEN } = require('./configManager');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Message,
        Partials.Channel
    ]
});

client.on('error', (err) => {
    console.error('❌ [TESTCHAT-STANDALONE] Discord client error:', err);
});

client.once(Events.ClientReady, () => {
    console.log(`🟢 [TESTCHAT-STANDALONE] ${client.user.tag} ออนไลน์ (โหลดเฉพาะ testchat)`);
    console.log('📝 พิมพ์ "c" ในแชทเพื่อทดสอบ embed');
});

// โหลดเฉพาะฟีเจอร์ testchat
require('./features/testchat/testchat')(client);

client.login(BOT_TOKEN).catch((error) => {
    console.error('❌ [TESTCHAT-STANDALONE] Login ไม่สำเร็จ:', error);
    process.exit(1);
});