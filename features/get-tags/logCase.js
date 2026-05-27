// =================================================================
// 📝 features/get-tags/logCase.js — เก็บ Message ID ที่แปลแล้ว + React ✅
// =================================================================

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const keys = require(path.join(__dirname, '../../credentials.json'));
const sheetConfig = require('../../utils/sheetConfig');

const LOG_SHEET_ID = sheetConfig.getLogSheetId();
const LOG_SHEET_NAME = sheetConfig.getLogSheetName();
const MISSED_LOG_FILE = path.join(__dirname, 'IDMissedLog.json');

// แคช ID ที่ส่งแล้วใน memory
const translatedIds = new Set();
let cacheLoaded = false;

// คิวสำหรับเขียน Sheet
let saveQueue = Promise.resolve();

function getAuth() {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: keys.client_email,
            private_key: keys.private_key
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
}

// ✅ อ่าน ID จากไฟล์ IDMissedLog.json
function loadMissedLogFile() {
    try {
        if (fs.existsSync(MISSED_LOG_FILE)) {
            const data = JSON.parse(fs.readFileSync(MISSED_LOG_FILE, 'utf8'));
            return new Set(Array.isArray(data) ? data : []);
        }
    } catch (err) {
        console.error('❌ [logCase] อ่าน IDMissedLog.json ล้มเหลว:', err.message);
    }
    return new Set();
}

// ✅ เขียน ID ลงไฟล์ IDMissedLog.json (atomic-ish)
function saveMissedLogFile(ids) {
    try {
        const tmpFile = MISSED_LOG_FILE + '.tmp';
        fs.writeFileSync(tmpFile, JSON.stringify(Array.from(ids), null, 2), 'utf8');
        fs.renameSync(tmpFile, MISSED_LOG_FILE);
    } catch (err) {
        console.error('❌ [logCase] เขียน IDMissedLog.json ล้มเหลว:', err.message);
    }
}

// ✅ เพิ่ม ID เข้า IDMissedLog.json
function addToMissedLog(messageId) {
    const ids = loadMissedLogFile();
    if (!ids.has(messageId)) {
        ids.add(messageId);
        saveMissedLogFile(ids);
    }
}

// ✅ ลบ ID ออกจาก IDMissedLog.json
function removeFromMissedLog(messageId) {
    const ids = loadMissedLogFile();
    ids.delete(messageId);
    saveMissedLogFile(ids);
}

// ✅ ล้าง IDMissedLog.json
function clearMissedLog() {
    saveMissedLogFile(new Set());
}

// ✅ ดึง ID ทั้งหมดจาก IDMissedLog.json (สำหรับ batch ขึ้น Sheet)
function getAllMissedLog() {
    return Array.from(loadMissedLogFile());
}

// ✅ นับจำนวน ID ใน IDMissedLog.json
function getMissedLogCount() {
    return loadMissedLogFile().size;
}

// ✅ โหลดแคชจากชีต + IDMissedLog.json
async function loadCache() {
    if (cacheLoaded) return;
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: LOG_SHEET_ID,
            range: `${LOG_SHEET_NAME}!A:A`
        });

        const rows = res.data.values || [];
        for (const row of rows) {
            if (row[0]) {
                translatedIds.add(row[0].trim());
            }
        }

        const missedIds = loadMissedLogFile();
        for (const id of missedIds) {
            translatedIds.add(id);
        }

        cacheLoaded = true;
        console.log(`✅ [logCase] โหลดแคชแล้ว: ${translatedIds.size} ID`);
    } catch (err) {
        console.error('❌ [logCase] โหลด cache ล้มเหลว:', err.message);
        cacheLoaded = true;
    }
}

// ✅ เช็คว่าส่งแล้วหรือยัง
function isAlreadyTranslated(messageId) {
    return translatedIds.has(messageId);
}

// ✅ React ✅ ในโพสต้นทาง
async function reactCheckmark(message) {
    await message.react('✅');
}

// ✅ บันทึก ID ลง Sheet ทีละตัว
async function saveToSheet(messageId) {
    return new Promise((resolve, reject) => {
        saveQueue = saveQueue.then(async () => {
            try {
                const auth = getAuth();
                const sheets = google.sheets({ version: 'v4', auth });

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: LOG_SHEET_ID,
                    range: `${LOG_SHEET_NAME}!A:A`
                });

                const rows = res.data.values || [];
                const nextRow = rows.length + 1;

                await sheets.spreadsheets.values.update({
                    spreadsheetId: LOG_SHEET_ID,
                    range: `${LOG_SHEET_NAME}!A${nextRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[messageId]] }
                });

                translatedIds.add(messageId);
                removeFromMissedLog(messageId);
                console.log(`✅ [logCase] บันทึก ID ${messageId} ลง Sheet (row ${nextRow})`);
                resolve();
            } catch (err) {
                console.error('❌ [logCase] บันทึกลง Sheet ล้มเหลว:', err.message);
                reject(err);
            }
        }).catch(err => {
            console.error('❌ [logCase] Save queue error:', err.message);
            reject(err);
        });
    });
}

// ✅ บันทึก ID พร้อมกันหลายตัว (batch)
async function saveBatchToSheet(messageIds) {
    if (!messageIds || messageIds.length === 0) return;

    return new Promise((resolve, reject) => {
        saveQueue = saveQueue.then(async () => {
            try {
                const auth = getAuth();
                const sheets = google.sheets({ version: 'v4', auth });

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: LOG_SHEET_ID,
                    range: `${LOG_SHEET_NAME}!A:A`
                });

                const rows = res.data.values || [];
                const nextRow = rows.length + 1;
                const values = messageIds.map(id => [id]);

                await sheets.spreadsheets.values.update({
                    spreadsheetId: LOG_SHEET_ID,
                    range: `${LOG_SHEET_NAME}!A${nextRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values }
                });

                for (const id of messageIds) {
                    translatedIds.add(id);
                }

                console.log(`✅ [logCase] บันทึก batch ${messageIds.length} ID ลง Sheet`);
                resolve();
            } catch (err) {
                console.error('❌ [logCase] บันทึก batch ลง Sheet ล้มเหลว:', err.message);
                reject(err);
            }
        }).catch(err => {
            console.error('❌ [logCase] SaveBatch queue error:', err.message);
            reject(err);
        });
    });
}

module.exports = {
    loadCache,
    isAlreadyTranslated,
    reactCheckmark,
    saveToSheet,
    saveBatchToSheet,
    addToMissedLog,
    removeFromMissedLog,
    clearMissedLog,
    getAllMissedLog,
    getMissedLogCount,
    loadMissedLogFile
};