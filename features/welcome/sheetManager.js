// =================================================================
// 📊 features/welcome/sheetManager.js (ฉบับอัปเกรดระบบจัดคิว Queue)
// =================================================================

const { google } = require('googleapis');
const path = require('path');
const sheetConfig = require('../../utils/sheetConfig');
const keys = require(path.join(__dirname, '../../credentials.json'));

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: keys.client_email,
        private_key: keys.private_key
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

function getRegistry() {
    return sheetConfig.getRegistryConfig();
}

// 🔥 สร้างตัวจัดคิวงาน (Queue System) เพื่อป้องกันบอททำงานทับถมกันเมื่อคนใช้งานพร้อมกันเยอะ ๆ
let sheetQueue = Promise.resolve();
function addSheetQueue(task) {
    sheetQueue = sheetQueue.then(task).catch(console.error);
    return sheetQueue;
}

/**
 * ฟังก์ชันหลัก (ภายใน) สำหรับค้นหาแถวว่างและบันทึกข้อมูลสมัครใหม่
 */
async function _executeRegister(icName, userId) {
    try {
        const { spreadsheetId, sheetName } = getRegistry();
        const sheets = google.sheets({ version: 'v4', auth });

        // ✅ เช็คซ้ำอีกครั้ง ตอนถึงคิวนี้จริง — ป้องกันกดติดๆ กัน
        const already = await isAlreadyRegistered(userId);
        if (already) {
            console.log(`⚠️ [SHEET] ${userId} สมัครซ้ำ (ตรวจพบใน Queue) — ข้าม`);
            return null;
        }

        // 1. ดึงข้อมูลในคอลัมน์ C และ D เพื่อหาแถวที่ว่าง
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!C:D`,
        });

        const rows = response.data.values || [];
        let targetRowIndex = -1;
        let codeNumber = '';

        for (let i = 2; i < rows.length; i++) {
            const colC = rows[i][0];
            const colD = rows[i][1];

            if (colC && (!colD || colD.trim() === "")) {
                targetRowIndex = i + 1;
                codeNumber = colC.trim();
                break;
            }
        }

        if (targetRowIndex === -1) {
            let nextCheckIndex = rows.length;
            const dynamicCheck = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!C${nextCheckIndex + 1}:C${nextCheckIndex + 20}`,
            });
            const dynamicRows = dynamicCheck.data.values || [];

            for (let j = 0; j < dynamicRows.length; j++) {
                if (dynamicRows[j][0]) {
                    targetRowIndex = nextCheckIndex + j + 1;
                    codeNumber = dynamicRows[j][0].trim();
                    break;
                }
            }
        }

        if (targetRowIndex === -1) {
            console.log('⚠️ [SHEET] ไม่พบแถวว่างที่มีเลขรหัสคอลัมน์ C หรือตารางเต็มแล้ว');
            return null;
        }

        const finalNickname = `${codeNumber} [MHNK-PD] ${icName}`;
        const today = new Date();
        const formattedDate = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
        const mentionFormat = `'<@${userId}>`;

        // บันทึกข้อมูลลงในแถวเป้าหมาย (คอลัมน์ D: ชื่อใหม่ | คอลัมน์ E: Discord ID | คอลัมน์ F: "นักเรียนตำรวจ")
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!D${targetRowIndex}:F${targetRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[finalNickname, mentionFormat, 'นักเรียนตำรวจ']]
            }
        });

        // คอลัมน์ H: วันที่กรอกข้อมูล
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!H${targetRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[formattedDate]]
            }
        });

        console.log(`✅ [SHEET] บันทึกข้อมูลแถวที่ ${targetRowIndex} เรียบร้อย: ${finalNickname}`);
        return finalNickname;

    } catch (error) {
        console.error('❌ [SHEET ERROR] เกิดข้อผิดพลาดในระบบ Google Sheets:', error);
        return null;
    }
}

/**
 * ฟังก์ชันหลัก (ภายใน) สำหรับดึงข้อมูลย้ายคนออก
 */
async function _executeMoveMember(userId) {
    try {
        const { spreadsheetId, sheetName, outSheetName } = getRegistry();
        const sheets = google.sheets({ version: 'v4', auth });

        const responsePD = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!B:M`,
        });

        const rowsPD = responsePD.data.values || [];
        let memberDataArray = null;
        let foundRowIndexInPD = -1;

        for (let i = 2; i < rowsPD.length; i++) {
            if (rowsPD[i] && rowsPD[i].length > 3 && rowsPD[i][3]) {
                const cellMention = rowsPD[i][3].trim();
                if (cellMention.includes(`<@${userId}>`)) {

                    foundRowIndexInPD = i + 1;
                    memberDataArray = new Array(12).fill('');

                    for (let colIdx = 0; colIdx < 12; colIdx++) {
                        if (rowsPD[i][colIdx] !== undefined) {
                            memberDataArray[colIdx] = rowsPD[i][colIdx].trim();
                        }
                    }
                    break;
                }
            }
        }

        if (memberDataArray && foundRowIndexInPD !== -1) {
            const responseOut = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${outSheetName}!B:B`,
            });

            const rowsOut = responseOut.data.values || [];

            let nextRowIndex = rowsOut.length + 1;
            if (nextRowIndex < 3) {
                nextRowIndex = 3;
            }

            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${outSheetName}!B${nextRowIndex}:M${nextRowIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [memberDataArray]
                }
            });
            console.log(`📌 [SHEET] ย้ายข้อมูลคนออก (B-M) ไปหน้า OutDC แถวที่ ${nextRowIndex} สำเร็จ`);

            const columnsToDelete = ['B', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U'];

            for (const col of columnsToDelete) {
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range: `${sheetName}!${col}${foundRowIndexInPD}`,
                });
            }
            console.log(`🗑️ [SHEET] ลบข้อมูลแถวที่ ${foundRowIndexInPD} หน้า ${sheetName} เรียบร้อย (เว้นคอลัมน์ C, I, L — รวมลบ O–U เวลาเวร)`);

        } else {
            console.log(`⚠️ [SHEET] ไม่พบข้อมูลเก่าของ <@${userId}> ในช่วง B:M ของหน้า ${sheetName}`);
        }

    } catch (error) {
        console.error('❌ [SHEET ERROR] เกิดข้อผิดพลาดในระบบ:', error);
    }
}

// =================================================================
// EXPORT FUNCTIONS (ครอบด้วยระบบจัดคิวเพื่อให้บอทรันทีละคนอย่างปลอดภัย)
// =================================================================

function registerMemberToSheet(icName, userId) {
    return addSheetQueue(() => _executeRegister(icName, userId));
}

function moveMemberToOutSheet(userId) {
    return addSheetQueue(() => _executeMoveMember(userId));
}

/**
 * ฟังก์ชันเช็กว่า Discord ID นี้เคยลงทะเบียนไปแล้วหรือไม่ (เช็กจากคอลัมน์ E)
 */
async function isAlreadyRegistered(userId) {
    try {
        const { spreadsheetId, sheetName } = getRegistry();
        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!E:E`, // คอลัมน์ E คือที่เก็บ Discord ID
        });
        const rows = response.data.values || [];
        // วนลูปเช็กว่ามี userId นี้อยู่ในคอลัมน์ E หรือยัง
        return rows.some(row => row[0] && row[0].toString().includes(userId));
    } catch (err) {
        console.error("❌ [SHEET ERROR] ตรวจสอบสถานะลงทะเบียนไม่สำเร็จ:", err);
        return false; // ถ้ามีปัญหา ให้มองว่ายังไม่ลงทะเบียน (ป้องกันบอทพัง)
    }
}


module.exports = {
    registerMemberToSheet,
    moveMemberToOutSheet,
    isAlreadyRegistered
};