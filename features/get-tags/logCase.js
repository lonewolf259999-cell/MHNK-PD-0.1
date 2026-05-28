// =================================================================
// 📝 features/get-tags/logCase.js — เก็บ Message ID ที่แปลแล้ว + React ✅
// =================================================================

const path = require('path');
const fs = require('fs');
const sheetConfig = require('../../utils/sheetConfig');
const {
    safeGetValues,
    safeUpdateValues,
    safeBatchUpdateValues
} = require('../../utils/apiSafe');

// ✅ ใช้ getter เพื่อให้ค่าอ่าน ณ เวลาเรียกใช้ (ไม่ใช่ตอน require)
function getLogSheetId() { return sheetConfig.getLogSheetId(); }
function getLogSheetName() { return sheetConfig.getLogSheetName(); }
const MISSED_LOG_FILE = path.join(__dirname, 'IDMissedLog.json');

// แคช ID ที่ส่งแล้วใน memory
const translatedIds = new Set();
let cacheLoaded = false;

// คิวสำหรับเขียน Sheet
let saveQueue = Promise.resolve();

// ✅ ตัวแปรเก็บ ID ที่ยังไม่ได้ sync (กันข้อมูลหายถ้าไฟล์เสีย)
const unsyncedIds = new Set();

// ✅ อ่าน ID จากไฟล์ IDMissedLog.json
function loadMissedLogFile() {
    try {
        if (fs.existsSync(MISSED_LOG_FILE)) {
            const data = JSON.parse(fs.readFileSync(MISSED_LOG_FILE, 'utf8'));
            const ids = new Set(Array.isArray(data) ? data : []);
            // Merge กับ unsyncedIds (กันข้อมูลหาย)
            for (const id of unsyncedIds) {
                ids.add(id);
            }
            return ids;
        }
    } catch (err) {
        console.error('❌ [logCase] อ่าน IDMissedLog.json ล้มเหลว:', err.message);
        // ถ้าไฟล์เสีย คืนค่าจาก unsyncedIds แทน
        return new Set(unsyncedIds);
    }
    return new Set(unsyncedIds);
}

// ✅ เขียน ID ลงไฟล์ IDMissedLog.json (atomic-ish) + backup
function saveMissedLogFile(ids) {
    try {
        const tmpFile = MISSED_LOG_FILE + '.tmp';
        const backupFile = MISSED_LOG_FILE + '.bak';
        
        // Create backup if original exists
        if (fs.existsSync(MISSED_LOG_FILE)) {
            try {
                fs.copyFileSync(MISSED_LOG_FILE, backupFile);
            } catch (backupErr) {
                // Silently continue if backup fails
            }
        }
        
        fs.writeFileSync(tmpFile, JSON.stringify(Array.from(ids), null, 2), 'utf8');
        fs.renameSync(tmpFile, MISSED_LOG_FILE);
        
        // อัปเดต unsyncedIds ด้วย
        unsyncedIds.clear();
        for (const id of ids) {
            unsyncedIds.add(id);
        }
    } catch (err) {
        console.error('❌ [logCase] เขียน IDMissedLog.json ล้มเหลว:', err.message);
        // ถ้าเขียนไม่ได้ เก็บไว้ใน memory ไว้ก่อน
        for (const id of ids) {
            unsyncedIds.add(id);
        }
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
    unsyncedIds.delete(messageId);
    saveMissedLogFile(ids);
}

// ✅ ล้าง IDMissedLog.json (พร้อมลบ .bak ด้วย)
function clearMissedLog() {
    try {
        saveMissedLogFile(new Set());
        unsyncedIds.clear();
        // ลบ .bak ทิ้งด้วย เพราะข้อมูลอัปโหลดสำเร็จแล้ว
        const bakFile = MISSED_LOG_FILE + '.bak';
        if (fs.existsSync(bakFile)) {
            try {
                fs.unlinkSync(bakFile);
            } catch (e) {
                // ignore
            }
        }
    } catch (e) {
        console.error('❌ [logCase] clearMissedLog error:', e.message);
    }
}

// ✅ ดึง ID ทั้งหมดจาก IDMissedLog.json (สำหรับ batch ขึ้น Sheet)
function getAllMissedLog() {
    const ids = loadMissedLogFile();
    return Array.from(ids);
}

// ✅ นับจำนวน ID ใน IDMissedLog.json
function getMissedLogCount() {
    return loadMissedLogFile().size;
}

// ✅ กู้คืนจาก backup file ถ้า main file เสีย
function recoverFromBackup() {
    try {
        const backupFile = MISSED_LOG_FILE + '.bak';
        if (fs.existsSync(backupFile)) {
            const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            if (Array.isArray(data)) {
                const ids = new Set(data);
                saveMissedLogFile(ids);
                console.log(`✅ [logCase] กู้คืน IDMissedLog.json จาก backup แล้ว (${ids.size} IDs)`);
                return ids;
            }
        }
    } catch (err) {
        console.error('❌ [logCase] กู้คืนจาก backup ล้มเหลว:', err.message);
    }
    return null;
}

// ✅ โหลดแคชจากชีต + IDMissedLog.json
async function loadCache() {
    const logSheetId = getLogSheetId();
    const logSheetName = getLogSheetName();
    
    // ถ้ายังไม่มีค่าใน config → ข้ามไปก่อน (เดี๋ยวโหลดใหม่รอบหน้า)
    if (!logSheetId || !logSheetName) {
        console.warn('⚠️ [logCase] ยังไม่ได้ตั้งค่า LOG_SHEET_ID/NAME — ข้ามโหลดแคช');
        // ยังไม่ cacheLoaded เพื่อให้ลองใหม่รอบหน้า
        return;
    }
    
    if (cacheLoaded) return;
    try {
        const res = await safeGetValues(logSheetId, `${logSheetName}!A:A`, {
            operation: 'logCase-loadCache'
        });

        const rows = res.data.values || [];
        for (const row of rows) {
            if (row[0]) {
                translatedIds.add(row[0].trim());
            }
        }

        // โหลด ID จาก IDMissedLog.json มาใส่ cache ด้วย
        const missedIds = loadMissedLogFile();
        for (const id of missedIds) {
            translatedIds.add(id);
        }

        cacheLoaded = true;
        console.log(`✅ [logCase] โหลดแคชแล้ว: ${translatedIds.size} ID`);
    } catch (err) {
        console.error('❌ [logCase] โหลด cache ล้มเหลว:', err.message);
        // ยังคงใช้ IDMissedLog.json ที่มีอยู่ โดยไม่ set cacheLoaded = true
        // เพื่อให้ลองโหลดใหม่ในครั้งถัดไป
        cacheLoaded = false;
    }
}

// ✅ เช็คว่าส่งแล้วหรือยัง
function isAlreadyTranslated(messageId) {
    return translatedIds.has(messageId);
}

// ✅ React ✅ ในโพสต้นทาง (ใช้ discordSafe)
async function reactCheckmark(message) {
    const { safeReact } = require('../../utils/discordSafe');
    await safeReact(message, '✅');
}

// ✅ บันทึก ID ลง Sheet ทีละตัว
async function saveToSheet(messageId) {
    const logSheetId = getLogSheetId();
    const logSheetName = getLogSheetName();
    
    if (!logSheetId || !logSheetName) {
        // ยังไม่มีค่า → เก็บ IDMissedLog แทน
        addToMissedLog(messageId);
        console.warn(`⚠️ [logCase] ข้ามบันทึก Sheet (ไม่มี config) — เก็บ ID ${messageId} ลง IDMissedLog`);
        return;
    }

    return new Promise((resolve, reject) => {
        saveQueue = saveQueue.then(async () => {
            try {
                const res = await safeGetValues(logSheetId, `${logSheetName}!A:A`, {
                    operation: 'saveToSheet-getRow'
                });

                const rows = res.data.values || [];
                const nextRow = rows.length + 1;

                await safeUpdateValues(logSheetId, `${logSheetName}!A${nextRow}`, [[messageId]], {
                    operation: 'saveToSheet-write'
                });

                translatedIds.add(messageId);
                removeFromMissedLog(messageId);
                console.log(`✅ [logCase] บันทึก ID ${messageId} ลง Sheet (row ${nextRow})`);
                resolve();
            } catch (err) {
                console.error('❌ [logCase] บันทึกลง Sheet ล้มเหลว:', err.message);
                // ถ้า error ให้เก็บใน IDMissedLog เผื่อไว้ส่งทีหลัง
                addToMissedLog(messageId);
                resolve(); // resolve แทน reject เพื่อไม่ให้ chain พัง
            }
        }).catch(err => {
            console.error('❌ [logCase] Save queue error:', err.message);
            reject(err);
        });
    });
}

// ✅ บันทึก ID พร้อมกันหลายตัว (batch)
async function saveBatchToSheet(messageIds) {
    if (!messageIds || messageIds.length === 0) return true;

    const logSheetId = getLogSheetId();
    const logSheetName = getLogSheetName();
    
    if (!logSheetId || !logSheetName) {
        throw new Error('LOG_SHEET_ID หรือ LOG_SHEET_NAME ยังไม่ได้ตั้งค่าใน config');
    }

    return new Promise((resolve, reject) => {
        saveQueue = saveQueue.then(async () => {
            try {
                const res = await safeGetValues(logSheetId, `${logSheetName}!A:A`, {
                    operation: 'saveBatchToSheet-getRow'
                });

                const rows = res.data.values || [];
                const nextRow = rows.length + 1;
                const values = messageIds.map(id => [id]);

                await safeUpdateValues(logSheetId, `${logSheetName}!A${nextRow}`, values, {
                    operation: 'saveBatchToSheet-write'
                });

                for (const id of messageIds) {
                    translatedIds.add(id);
                }

                console.log(`✅ [logCase] บันทึก batch ${messageIds.length} ID ลง Sheet`);
                resolve(true);
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
    loadMissedLogFile,
    recoverFromBackup,
    unsyncedIds // export for emergency recovery
};
