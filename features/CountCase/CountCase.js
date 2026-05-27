// =================================================================
// 🧹 features/CountCase/CountCase.js — logic นับข้อความเก่า (เรียกจาก configPanel)
// =================================================================

const { google } = require('googleapis');
const path = require('path');
const sheetConfig = require('../../utils/sheetConfig');
const keys = require(path.join(__dirname, '../../credentials.json'));

let recountQueue = Promise.resolve();

function addRecountQueue(task) {
    recountQueue = recountQueue.then(task).catch(console.error);
    return recountQueue;
}

async function runManualRecount(client, interaction) {
    const liveConfig = sheetConfig.getCountConfig();

    return addRecountQueue(async () => {
        console.log('-----------------------------------');
        console.log('🧹 เริ่มประมวลผล Manual Recount แบบ 5 ช่องแชนแนลเรียงลำดับ...');

        try {
            const auth = new google.auth.GoogleAuth({
                credentials: { client_email: keys.client_email, private_key: keys.private_key },
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            const sheets = google.sheets({ version: 'v4', auth });

            const spreadsheetId = liveConfig.SPREADSHEET_ID;
            const sheetName = liveConfig.SHEET_NAME;

            if (!spreadsheetId || !sheetName) {
                return await interaction.editReply('❌ ยังไม่ได้ตั้งค่า SPREADSHEET_ID หรือ SHEET_NAME');
            }

            await sheets.spreadsheets.values.clear({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!C4:G`,
            });

            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A:G`,
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

            for (const chObj of channelMappings) {
                if (!chObj.id) continue;
                const channel = await client.channels.fetch(chObj.id).catch(() => null);
                if (!channel) continue;

                let lastId = null;
                let hasMore = true;

                while (hasMore) {
                    const messages = await channel.messages.fetch({ limit: 100, before: lastId || undefined });
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

                    if (totalMsgCount % 1000 === 0) {
                        await interaction.editReply(`⏳ **กำลังนับยอด...** (อ่านไปแล้ว ${totalMsgCount.toLocaleString()} ข้อความ)`)
                            .catch(() => null);
                        console.log(`[CH: ${chObj.name}] ประมวลผลไปแล้ว: ${totalMsgCount.toLocaleString()} ข้อความ`);
                    }

                    lastId = messages.last()?.id;
                    if (messages.size < 100) hasMore = false;
                }
            }

            await sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: rows }
            });

            await interaction.editReply(`✅ **นับยอดเสร็จสิ้น!** ทั้งหมด ${totalMsgCount.toLocaleString()} ข้อความ`);

            setTimeout(async () => {
                try { await interaction.deleteReply(); } catch (e) { }
            }, 5000);

            console.log(`✅ สำเร็จ: ประมวลผล 5 ห้องรวมทั้งสิ้น ${totalMsgCount} ข้อความ`);
        } catch (error) {
            console.error('❌ Error ใน Manual Recount:', error);
            await interaction.editReply("❌ **เกิดข้อผิดพลาด** บอททำงานหนักเกินไป โปรดลองใหม่อีกครั้ง");
        }
    });
}

async function init() {
    // logic นับย้อนหลังถูกเรียกจาก configPanel
}

init.runManualRecount = runManualRecount;
module.exports = init;
