// =================================================================
// 🧹 features/CountCase/CountCase.js — logic นับข้อความเก่า (เรียกจาก configPanel)
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const { safeGetValues, safeUpdateValues, safeClearValues } = require('../../utils/apiSafe');
const { safeFetchMessages, safeFetchMessage } = require('../../utils/discordSafe');
const { MessageFlags } = require('discord.js');
const EPHEMERAL = MessageFlags.Ephemeral;

let recountQueue = Promise.resolve();
let currentAbortController = null;

function addRecountQueue(task) {
    recountQueue = recountQueue.then(task).catch(console.error);
    return recountQueue;
}

// ✅ อัปเดตสถานะ (แก้ไขข้อความเดิม)
async function updateStatus(interaction, content) {
    try {
        await interaction.editReply(content);
        return true;
    } catch (err) {
        console.error('[CountCase] updateStatus failed:', err.message);
        return false;
    }
}

function isAborted() {
    return currentAbortController?.signal?.aborted ?? false;
}

// ✅ Phase 1: Preview Scan
async function previewScan(client, interaction, channelMappings) {
    let totalMessages = 0;
    const uniqueUsers = new Set();
    const channelStats = [];

    for (const chObj of channelMappings) {
        if (!chObj.id) continue;

        const channel = await client.channels.fetch(chObj.id).catch(() => null);
        if (!channel) {
            channelStats.push({ name: chObj.name, id: chObj.id, count: 0, skipped: true });
            continue;
        }

        let msgCount = 0;
        let lastId = null;
        let hasMore = true;

        while (hasMore) {
            const messages = await safeFetchMessages(channel, { limit: 100, before: lastId || undefined });
            if (messages.size === 0) break;

            msgCount += messages.size;
            totalMessages += messages.size;

            for (const msg of messages.values()) {
                const mentions = msg.content.match(/<@!?(\d+)>/g);
                if (mentions) {
                    for (const m of mentions) {
                        const uId = m.match(/\d+/)[0];
                        uniqueUsers.add(uId);
                    }
                }
            }

            lastId = messages.last()?.id;
            if (messages.size < 100) hasMore = false;
        }

        channelStats.push({ name: chObj.name, id: chObj.id, count: msgCount, skipped: false });
    }

    // ✅ สรุป Preview
    let previewMsg =
        '📊 **สรุปข้อมูลก่อนเริ่มนับ**\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `📝 ข้อความทั้งหมด: **${totalMessages.toLocaleString()}** ข้อความ\n` +
        `👥 พบแท็ก (unique): **${uniqueUsers.size}** คน\n` +
        `📢 จำนวนห้อง: **${channelStats.filter(c => !c.skipped).length}** ห้อง\n\n` +
        '**รายละเอียดแต่ละห้อง:**\n';

    for (const ch of channelStats) {
        if (ch.skipped) {
            previewMsg += `  ⚠️ ${ch.name}: ไม่พบห้อง (ข้าม)\n`;
        } else {
            previewMsg += `  ✅ ${ch.name}: ${ch.count.toLocaleString()} ข้อความ\n`;
        }
    }

    previewMsg += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    previewMsg += '▶️ **เริ่มนับยอดจริง...**';

    await updateStatus(interaction, previewMsg);

    return { totalMessages, uniqueUserCount: uniqueUsers.size };
}

async function runManualRecount(client, interaction) {
    const liveConfig = sheetConfig.getCountConfig();

    // ✅ Defer ทันทีเพื่อบอก Discord ว่าบอทรับรู้แล้ว (ป้องกัน Unknown interaction)
    await interaction.deferReply({ flags: EPHEMERAL }).catch(() => {});

    return addRecountQueue(async () => {
        console.log('-----------------------------------');
        console.log('🧹 เริ่มประมวลผล Manual Recount แบบ 5 ช่องแชนแนลเรียงลำดับ...');

        try {
            const spreadsheetId = liveConfig.SPREADSHEET_ID;
            const sheetName = liveConfig.SHEET_NAME;

            if (!spreadsheetId || !sheetName) {
                await interaction.editReply({ content: '❌ ยังไม่ได้ตั้งค่า SPREADSHEET_ID หรือ SHEET_NAME' });
                setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
                return;
            }

            // ✅ อัปเดตสถานะผ่าน editReply (reply แล้ว)
            await interaction.editReply({
                content: '🔍 **กำลังสแกนข้อมูล...**\nกำลังนับจำนวนข้อความและแท็กทั้งหมด กรุณารอสักครู่...'
            });

            await safeClearValues(spreadsheetId, `${sheetName}!C4:G`, {
                operation: 'CountCase-clear'
            });

            const response = await safeGetValues(spreadsheetId, `${sheetName}!A:G`, {
                operation: 'CountCase-get'
            });

            let rows = response.data.values || [];
            const userCache = new Map();
            let totalMsgCount = 0;

            for (let i = 3; i < rows.length; i++) {
                if (rows[i]) {
                    for (let col = 2; col <= 6; col++) {
                        if (rows[i].length > col) rows[i][col] = "";
                    }
                }
            }

            const channelIds = liveConfig.CHANNELS;
            const channelMappings = [
                { id: channelIds.CHANNEL_1, colIdx: 2, name: 'ID_1' },
                { id: channelIds.CHANNEL_2, colIdx: 3, name: 'ID_2' },
                { id: channelIds.CHANNEL_3, colIdx: 4, name: 'ID_3' },
                { id: channelIds.CHANNEL_4, colIdx: 5, name: 'ID_4' },
                { id: channelIds.CHANNEL_5, colIdx: 6, name: 'ID_5' }
            ];

            // ✅ Phase 1: Preview Scan
            const { totalMessages: previewTotal } = await previewScan(
                client, interaction, channelMappings
            );

            // ✅ Phase 2: เริ่มประมวลผลจริง
            let lastStatusUpdate = 0;

            for (const chObj of channelMappings) {
                if (!chObj.id) continue;
                const channel = await client.channels.fetch(chObj.id).catch(() => null);
                if (!channel) continue;

                let lastId = null;
                let hasMore = true;

                while (hasMore) {
                    const messages = await safeFetchMessages(channel, { limit: 100, before: lastId || undefined });
                    if (messages.size === 0) break;

                    for (const msg of messages.values()) {
                        const tagList = [];
                        const mentions = msg.content.match(/<@!?(\d+)>/g);

                        if (mentions) {
                            for (const m of mentions) {
                                const uId = m.match(/\d+/)[0];
                                let userData = userCache.get(uId);
                                if (!userData) {
                                    try {
                                        const user = await client.users.fetch(uId);
                                        const memberInGuild = await interaction.guild.members.fetch(uId).catch(() => null);
                                        userData = {
                                            id: uId,
                                            nickname: memberInGuild ? (memberInGuild.nickname || user.displayName) : user.username,
                                            username: user.username
                                        };
                                        userCache.set(uId, userData);
                                    } catch (e) { continue; }
                                }
                                if (userData && !tagList.some(p => p.id === userData.id)) {
                                    tagList.push(userData);
                                }
                            }
                        }

                        if (tagList.length > 0) {
                            tagList.forEach((person) => {
                                const rowIndex = rows.findIndex((r, idx) => {
                                    if (idx < 3 || !r[0]) return false;
                                    const sName = r[0].toString().trim().toLowerCase();
                                    const dNick = (person.nickname || "").toLowerCase();
                                    const dUser = (person.username || "").toLowerCase();
                                    return dNick === sName || dNick.includes(sName) || dUser === sName || dUser.includes(sName) || sName.includes(dUser);
                                });

                                if (rowIndex !== -1) {
                                    const currentVal = parseInt(rows[rowIndex][chObj.colIdx]) || 0;
                                    rows[rowIndex][chObj.colIdx] = (currentVal + 1).toString();
                                } else {
                                    const finalName = person.nickname || person.username;
                                    const newRow = [finalName, person.username, "", "", "", "", ""];
                                    newRow[chObj.colIdx] = "1";
                                    rows.push(newRow);
                                }
                            });
                        }
                    }

                    totalMsgCount += messages.size;
                    lastStatusUpdate += messages.size;

                    if (lastStatusUpdate >= 500) {
                        const cachedCount = userCache.size;
                        const progress = previewTotal > 0
                            ? Math.min(100, Math.round((totalMsgCount / previewTotal) * 100))
                            : 0;

                        await updateStatus(interaction,
                            `⏳ **กำลังนับยอด...**\n` +
                            `📝 อ่านแล้ว: **${totalMsgCount.toLocaleString()}** / ${previewTotal.toLocaleString()} ข้อความ (${progress}%)\n` +
                            `👥 พบแท็ก: **${cachedCount}** คน\n` +
                            `📢 ห้อง: ${chObj.name}`
                        );

                        console.log(`[CH: ${chObj.name}] ประมวลผลไปแล้ว: ${totalMsgCount.toLocaleString()} ข้อความ`);
                        lastStatusUpdate = 0;
                    }

                    lastId = messages.last()?.id;
                    if (messages.size < 100) hasMore = false;
                }
            }

            await safeUpdateValues(spreadsheetId, `${sheetName}!A1`, rows, {
                operation: 'CountCase-update'
            });

            const finalUserCount = userCache.size;
            await updateStatus(interaction,
                `✅ **นับยอดเสร็จสิ้น!**\n` +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                `📝 ข้อความทั้งหมด: **${totalMsgCount.toLocaleString()}** ข้อความ\n` +
                `👥 พบแท็ก: **${finalUserCount}** คน\n` +
                `💾 บันทึกลง Google Sheet แล้ว`
            );

            setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);

            console.log(`✅ สำเร็จ: ประมวลผล 5 ห้องรวมทั้งสิ้น ${totalMsgCount} ข้อความ`);
        } catch (error) {
            console.error('❌ Error ใน Manual Recount:', error);
            await updateStatus(interaction, "❌ **เกิดข้อผิดพลาด** บอททำงานหนักเกินไป โปรดลองใหม่อีกครั้ง");
            setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        }
    });
}

// ✅ ส่งออก function หลักให้ featureHandler เรียก
function load() {
    // CountCase ไม่ต้องลง event listener ในตัวเอง
}

module.exports = load;
module.exports.runManualRecount = runManualRecount;
