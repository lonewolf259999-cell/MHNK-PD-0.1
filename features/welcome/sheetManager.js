// =================================================================
// 📊 features/welcome/sheetManager.js — ใช้ apiSafe.js แทน googleapis โดยตรง
// =================================================================

const path = require('path');
const sheetConfig = require('../../utils/sheetConfig');
const {
    safeGetValues,
    safeUpdateValues,
    safeClearValues
} = require('../../utils/apiSafe');

function getRegistry() {
    return sheetConfig.getRegistryConfig();
}

// 🔥 Queue System ป้องกัน race condition
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

        // ✅ เช็คซ้ำอีกครั้ง ตอนถึงคิวนี้จริง — ป้องกันกดติดๆ กัน
        const already = await isAlreadyRegistered(userId);
        if (already) {
            console.log(`⚠️ [SHEET] ${userId} สมัครซ้ำ (ตรวจพบใน Queue) — ข้าม`);
            return null;
        }

        // 1. ดึงข้อมูลในคอลัมน์ C และ D เพื่อหาแถวที่ว่าง
        const response = await safeGetValues(spreadsheetId, `${sheetName}!C:D`, {
            operation: 'sheetManager-register-findRow'
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
            const dynamicCheck = await safeGetValues(spreadsheetId, `${sheetName}!C${nextCheckIndex + 1}:C${nextCheckIndex + 20}`, {
                operation: 'sheetManager-register-dynamic'
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
        await safeUpdateValues(spreadsheetId, `${sheetName}!D${targetRowIndex}:F${targetRowIndex}`, [[finalNickname, mentionFormat, 'นักเรียนตำรวจ']], {
            operation: 'sheetManager-register-write'
        });

        // คอลัมน์ H: วันที่กรอกข้อมูล
        await safeUpdateValues(spreadsheetId, `${sheetName}!H${targetRowIndex}`, [[formattedDate]], {
            operation: 'sheetManager-register-date'
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

        const responsePD = await safeGetValues(spreadsheetId, `${sheetName}!B:M`, {
            operation: 'sheetManager-move-get'
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
            const responseOut = await safeGetValues(spreadsheetId, `${outSheetName}!B:B`, {
                operation: 'sheetManager-move-getOut'
            });

            const rowsOut = responseOut.data.values || [];

            let nextRowIndex = rowsOut.length + 1;
            if (nextRowIndex < 3) {
                nextRowIndex = 3;
            }

            await safeUpdateValues(spreadsheetId, `${outSheetName}!B${nextRowIndex}:M${nextRowIndex}`, [memberDataArray], {
                operation: 'sheetManager-move-writeOut'
            });
            console.log(`📌 [SHEET] ย้ายข้อมูลคนออก (B-M) ไปหน้า OutDC แถวที่ ${nextRowIndex} สำเร็จ`);

            // ✅ แก้ไข: ใช้ batch clear แทน loop ทีละคอลัมน์
            const columnsToClear = ['B', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U'];
            const clearRanges = columnsToClear.map(col => ({
                range: `${sheetName}!${col}${foundRowIndexInPD}`
            }));

            // ใช้ API request เดียวด้วย batchUpdate (clear ทุกคอลัมน์พร้อมกัน)
            const { google } = require('googleapis');
            const keys = require(path.join(__dirname, '../../credentials.json'));
            const auth = new google.auth.GoogleAuth({
                credentials: {
                    client_email: keys.client_email,
                    private_key: keys.private_key
                },
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            const sheets = google.sheets({ version: 'v4', auth });

            // ใช้ batchUpdate (spreadsheets.batchUpdate) เพื่อ clear หลายช่วงพร้อมกัน
            const requests = columnsToClear.map(col => ({
                updateCells: {
                    range: {
                        sheetId: null, // จะหา sheet id จากชื่อในขั้นตอนถัดไป
                        startRowIndex: foundRowIndexInPD - 1,
                        endRowIndex: foundRowIndexInPD,
                        startColumnIndex: getColumnIndex(col),
                        endColumnIndex: getColumnIndex(col) + 1
                    },
                    fields: 'userEnteredValue'
                }
            }));

            try {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: { requests }
                });
                console.log(`🗑️ [SHEET] ลบข้อมูลแถวที่ ${foundRowIndexInPD} หน้า ${sheetName} เรียบร้อย (ใช้ batchUpdate)`);
            } catch (batchErr) {
                // fallback: ใช้ safeClearValues ทีละคอลัมน์
                console.warn(`⚠️ [SHEET] batchUpdate ล้มเหลว ใช้ fallback clear ทีละคอลัมน์:`, batchErr.message);
                for (const range of clearRanges) {
                    await safeClearValues(spreadsheetId, range.range, {
                        operation: 'sheetManager-move-clear-fallback'
                    });
                }
                console.log(`🗑️ [SHEET] ลบข้อมูลแถวที่ ${foundRowIndexInPD} หน้า ${sheetName} เรียบร้อย (fallback ทีละคอลัมน์)`);
            }

        } else {
            console.log(`⚠️ [SHEET] ไม่พบข้อมูลเก่าของ <@${userId}> ในช่วง B:M ของหน้า ${sheetName}`);
        }

    } catch (error) {
        console.error('❌ [SHEET ERROR] เกิดข้อผิดพลาดในระบบ:', error);
    }
}

// ✅ Helper: แปลง letter column name เป็น index (A=0, B=1, ...)
function getColumnIndex(col) {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
        index = index * 26 + (col.charCodeAt(i) - 64);
    }
    return index - 1;
}

// =================================================================
// EXPORT FUNCTIONS (ครอบด้วยระบบจัดคิว)
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
        const response = await safeGetValues(spreadsheetId, `${sheetName}!E:E`, {
            operation: 'sheetManager-isRegistered'
        });
        const rows = response.data.values || [];
        // วนลูปเช็กว่ามี userId นี้อยู่ในคอลัมน์ E หรือยัง
        return rows.some(row => row[0] && row[0].toString().includes(userId));
    } catch (err) {
        console.error("❌ [SHEET ERROR] ตรวจสอบสถานะลงทะเบียนไม่สำเร็จ:", err);
        return false;
    }
}


module.exports = {
    registerMemberToSheet,
    moveMemberToOutSheet,
    isAlreadyRegistered
};