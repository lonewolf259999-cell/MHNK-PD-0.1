// configManager.js
require('dotenv').config();

if (!process.env.BOT_TOKEN) {
    console.error('❌ [ERROR] ไม่พบ BOT_TOKEN ในไฟล์ .env');
    process.exit(1);
}

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN
};
