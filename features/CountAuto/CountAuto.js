// =================================================================
// 🔢 features/CountAuto/CountAuto.js — Event handlers + Queue
// =================================================================

const { Events } = require('discord.js');
const path = require('path');
const sheetConfig = require('../../utils/sheetConfig');
const { loadLog, saveLog } = require('./logic/messageLog');
const { getTagsFromContent } = require('./logic/tagParser');
const { processSheetBatch } = require('./logic/sheetUpdater');

const LOG_FILE = path.join(__dirname, '../../data/messageLog.json');

let queue = Promise.resolve();
function addQueue(task) {
    queue = queue.then(task).catch(console.error);
    return queue;
}

module.exports = async (client) => {

    client.once(Events.ClientReady, async () => {
        try {
            const config = sheetConfig.getCountConfig();
            if (!sheetConfig.isLoaded() || !config.CHANNELS) {
                console.error('❌ เริ่มต้นระบบ CountAuto ไม่สำเร็จ — config ยังไม่พร้อม');
                return;
            }
            console.log('✅ ระบบ CountAuto ออนไลน์และพร้อมดักจับแต้ม!');
            for (const guild of client.guilds.cache.values()) {
                await guild.members.fetch().catch(() => {});
            }
        } catch (error) {
            console.error('❌ เกิดข้อผิดพลาดใน ClientReady:', error);
        }
    });

    // ─── MESSAGE CREATE ───
    client.on('messageCreate', async (message) => {
        try {
            const config = sheetConfig.getCountConfig();
            if (!sheetConfig.isLoaded() || !config.CHANNELS) return;

            const allowed = [
                config.CHANNELS.CHANNEL_1,
                config.CHANNELS.CHANNEL_2,
                config.CHANNELS.CHANNEL_3,
                config.CHANNELS.CHANNEL_4,
                config.CHANNELS.CHANNEL_5
            ].filter(id => id !== '');

            if (!message.guild || !allowed.includes(message.channel.id)) return;
            const tagList = getTagsFromContent(message);
            if (tagList.length === 0) return;

            await message.react('✅').catch(() => {});

            const log = loadLog(LOG_FILE);
            if (log[message.id]) return;

            log[message.id] = tagList;
            saveLog(LOG_FILE, log);

            await addQueue(() => processSheetBatch(tagList, message, config, false));
        } catch (e) {
            console.error('❌ Error ใน messageCreate:', e);
        }
    });

    // ─── MESSAGE DELETE ───
    client.on('messageDelete', async (message) => {
        try {
            const config = sheetConfig.getCountConfig();
            if (!sheetConfig.isLoaded() || !config.CHANNELS) return;

            if (message.partial) {
                try { await message.fetch(); }
                catch (fetchErr) {
                    console.error('❌ [CountAuto] ไม่สามารถ fetch ข้อความที่ถูกลบ:', fetchErr.message);
                    return;
                }
            }
            const log = loadLog(LOG_FILE);
            const tagList = log[message.id];
            if (!tagList) return;

            delete log[message.id];
            saveLog(LOG_FILE, log);

            await addQueue(() => processSheetBatch(tagList, message, config, true));
        } catch (e) {
            console.error('❌ Error ใน messageDelete:', e);
        }
    });

    // ─── MESSAGE UPDATE ───
    client.on('messageUpdate', async (oldM, newM) => {
        try {
            const config = sheetConfig.getCountConfig();
            if (!sheetConfig.isLoaded() || !config.CHANNELS) return;

            if (newM.partial) {
                try { await newM.fetch(); }
                catch (fetchErr) {
                    console.error('❌ [CountAuto] ไม่สามารถ fetch ข้อความที่ถูกแก้ไข:', fetchErr.message);
                    return;
                }
            }
            if (!newM.guild || !newM.channel) return;
            const log = loadLog(LOG_FILE);
            const oldList = log[newM.id] || [];
            const newList = getTagsFromContent(newM);

            const oldIds = oldList.map(x => x.username);
            const newIds = newList.map(x => x.username);

            const added = newList.filter(x => !oldIds.includes(x.username));
            const removed = oldList.filter(x => !newIds.includes(x.username));

            if (added.length === 0 && removed.length === 0) return;
            if (removed.length > 0) {
                await addQueue(() => processSheetBatch(removed, newM, config, true));
            }
            if (added.length > 0) {
                await addQueue(() => processSheetBatch(added, newM, config, false));
            }

            log[newM.id] = newList;
            saveLog(LOG_FILE, log);
        } catch (e) {
            console.error('❌ Error ใน messageUpdate:', e);
        }
    });
};

