// =================================================================
// 🧠 mahanakorn-bot-PD-0.2 \ handlers \ featureHandler.js
// =================================================================

const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    // ชี้ไปที่โฟลเดอร์ features ที่อยู่ด้านนอกชั้นเดียวกับ handlers
    const featuresPath = path.join(__dirname, '../features');
    const featureFolders = fs.readdirSync(featuresPath);

    console.log('🔄 [SYSTEM] กำลังเริ่มโหลดฟีเจอร์ย่อย...');

    for (const folder of featureFolders) {
        const featureFilePath = path.join(featuresPath, folder, `${folder}.js`);

        if (fs.existsSync(featureFilePath)) {
            try {
                const feature = require(featureFilePath);
                feature(client); 
                console.log(`✅ [LOAD] ฟีเจอร์: ${folder}`);
            } catch (error) {
                console.error(`❌ [ERROR] โหลดฟีเจอร์ ${folder} ไม่สำเร็จ:`, error);
            }
        }
    }
};