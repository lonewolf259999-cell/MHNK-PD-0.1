// =================================================================
// ⏱️ features/logtime/logtime.js — บันทึกเวลาเข้าเวร → NamePD
// คอลัมน์: หาแถว=D | เจอ→J,K,M | ไม่เจอ→X(ชื่อ),Y(Steam) แถว 3+
// =================================================================
// ✅ เพิ่มความเร็ว: อ่านชีตครั้งเดียว → process ใน RAM → batch update
//    - 1 คน: อัปเดททันที (2 API calls)
//    - 100 คน: batch ทุกครั้งที่ process (3-5 API calls total)
// ✅ ข้อมูลไม่ตกหล่น (retry + queue mechanism)
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const {
    safeGetValues,
    safeBatchUpdateValues
} = require('../../utils/apiSafe');

const NEW_ROW_MIN = 3;
const COL = {
    FIND_NAME: 'D',
    OUT_DATE: 'J',
    OUT_TIME: 'K',
    STEAM: 'M',
    NEW_NAME: 'X',
    NEW_STEAM: 'Y'
};

const LOG_QUEUE_MAX = 100;

const logQueue = [];
let isProcessing = false;

// ✅ Cache ชีตทั้งก้อน (D:Y) — refresh ทุกครั้งก่อน process batch
// ⚠️ Module-level mutable state: sheetCache ถูกแก้ไขโดย processQueue()
//    และ processSingleInRam() อ่านจาก cache นี้
//    ถ้ามี concurrent operation อาจ读到ข้อมูลเก่า — แต่ logtime ใช้ queue
//    ทำให้ทีละรายการ จึงปลอดภัยในทางปฏิบัติ
let sheetCache = {
    spreadsheetId: null,
    sheetName: null,
    rows: null,     // raw array ของชีต (D:Y)
    loaded: false
};

function getRegistryTarget() {
    return sheetConfig.getRegistryConfig();
}

function timeToMinutes(durationStr) {
    if (!durationStr) return 0;
    const [hrs, mins, secs] = durationStr.split(':').map(Number);
    return (hrs * 60) + mins + (secs / 60);
}

function minutesToHHmm(totalMinutes) {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function getColumnByDate(dateStr) {
    if (!dateStr) return null;
    const [d, m, y] = dateStr.split('/').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const day = dateObj.getDay();
    const map = { 1: 'O', 2: 'P', 3: 'Q', 4: 'R', 5: 'S', 6: 'T', 0: 'U' };
    return map[day] || null;
}

function normalizeName(str) {
    return (str || '').trim().toLowerCase();
}

/** ดึงชื่อ IC จาก D แบบ `001 [MHNK-PD] ชื่อ` */
function icNameFromD(cell) {
    if (!cell) return '';
    const bracket = String(cell).match(/\]\s*(.+)$/);
    if (bracket) return normalizeName(bracket[1]);
    return normalizeName(cell);
}

/** Forward match: เอา logName ไปหาใน dCell */
function matchForward(logName, dCell) {
    const log = normalizeName(logName);
    if (!log || !dCell) return false;
    const full = normalizeName(dCell);
    const ic = icNameFromD(dCell);
    return full.includes(log) || ic.includes(log);
}

/** Backward match: ถ้า log ยาวกว่าชื่อในชีต (โดนตัด) → ตัด log ให้เท่าแล้วเทียบ */
function matchBackward(logName, dCell) {
    const log = normalizeName(logName);
    if (!log || !dCell) return false;
    const full = normalizeName(dCell);
    const ic = icNameFromD(dCell);

    if (ic.length > 0 && ic.length < log.length) {
        const partialLog = log.slice(0, ic.length);
        if (partialLog === ic) return true;
    }
    if (full.length > 0 && full.length < log.length) {
        const partialLog = log.slice(0, full.length);
        if (partialLog === full) return true;
    }
    return false;
}

/**
 * ✅ หาแถวจาก cache (ไม่ต้องเรียก API)
 * @param {string} name
 * @returns {{ row: number, isNew: boolean }}
 */
function findRowFromCache(name, steamId) {
    const rows = sheetCache.rows;
    if (!rows) return { row: NEW_ROW_MIN, isNew: true };
    const normalizedName = normalizeName(name);

    // Pass 0: Steam ID match — priority สูงสุด
    // ถ้า log มี steam ID → หาแถวที่ column M ตรงกัน
    if (steamId) {
        const steamNormalized = normalizeName(steamId);
        for (let idx = 2; idx < rows.length; idx++) {
            const mCell = rows[idx]?.[9]; // D:Y → M = index 9 (D=0, E=1, ... M=9, X=20, Y=21)
            if (mCell && normalizeName(mCell) === steamNormalized) {
                // เจอ steam ID ตรง → เช็ค column D ซ้ำเพื่อยืนยัน (กันกรณี steam ID ซ้ำ)
                const dCell = rows[idx]?.[0];
                if (dCell && (matchForward(name, dCell) || matchBackward(name, dCell))) {
                    return { row: idx + 1, isNew: false };
                }
            }
        }
    }

    // Pass 1: Forward match เท่านั้น (exact + substring) — priority สูงสุด
    // ป้องกันไม่ให้ backward match แถวผิดที่มีชื่อคล้ายกัน
    for (let idx = 2; idx < rows.length; idx++) {
        const dCell = rows[idx]?.[0];
        if (dCell && matchForward(name, dCell)) {
            return { row: idx + 1, isNew: false };
        }
    }

    // Pass 2: Backward match (fallback สำหรับชื่อที่ถูกตัด)
    // เลือกแถวที่ match prefix ยาวที่สุด เพื่อป้องกัน match แถวที่มีชื่อสั้นกว่าผิด
    let bestRow = null;
    let bestLen = 0;
    for (let idx = 2; idx < rows.length; idx++) {
        const dCell = rows[idx]?.[0];
        if (!dCell) continue;
        const full = normalizeName(dCell);
        const ic = icNameFromD(dCell);

        // เช็ค ic part ก่อน (ชื่อหลัง ] )
        if (ic.length > 0 && ic.length < normalizedName.length) {
            const partial = normalizedName.slice(0, ic.length);
            if (partial === ic && ic.length > bestLen) {
                bestRow = idx + 1;
                bestLen = ic.length;
            }
        }
        // เช็ค full cell ถ้ายาวกว่า ic (อาจมี prefix ที่ยาวผิดปกติ)
        if (full.length > 0 && full.length < normalizedName.length && full.length > bestLen) {
            const partial = normalizedName.slice(0, full.length);
            if (partial === full) {
                bestRow = idx + 1;
                bestLen = full.length;
            }
        }
    }
    if (bestRow) return { row: bestRow, isNew: false };

    // Pass 3: Forward match ใน X column (สำหรับคนที่เคยถูก log ไว้แล้ว)
    for (let idx = NEW_ROW_MIN - 1; idx < rows.length; idx++) {
        const xCell = rows[idx]?.[20]; // D:Y → X = index 20
        if (xCell && normalizeName(xCell).includes(normalizedName)) {
            return { row: idx + 1, isNew: false };
        }
    }

    // ไม่เจอเลย → หาแถวว่าง X (index 20)
    for (let row = NEW_ROW_MIN; row <= rows.length; row++) {
        const xCell = rows[row - 1]?.[20]; // D:Y → D=0, E=1, ..., X=20, Y=21
        if (!xCell || !String(xCell).trim()) {
            return { row, isNew: true };
        }
    }

    // แถวสุดท้าย → ใช้แถวถัดไป
    return { row: rows.length + 1, isNew: true };
}

/**
 * ✅ อ่านแถวล่าสุดของคนๆ นั้นจาก cache (แถว O-U สำหรับ accumulate)
 */
function getAccumulatedMinutes(col, row) {
    if (!sheetCache.rows) return 0;
    const rowData = sheetCache.rows[row - 1];
    if (!rowData) return 0;

    // col index จาก range D:Y → D=0, E=1, O=11, P=12, Q=13, R=14, S=15, T=16, U=17
    const colIndex = col.charCodeAt(0) - 68; // D=0, E=1, ...
    const cellVal = rowData[colIndex] || '00:00';
    if (!cellVal.includes(':')) return 0;

    const [h, m] = cellVal.split(':').map(Number);
    return (h * 60) + m;
}

/**
 * ✅ process 1 คนใน RAM (ไม่เรียก API)
 * @returns {Array} updates — รายการ changes ที่ต้อง flush ไป Sheet
 */
function processSingleInRam(info) {
    const { name, inDate, inTime, date, time, id, duration } = info;
    const { row, isNew } = findRowFromCache(name, id);
    const updates = [];

    // 1. ถ้าเจอคนเดิม → เขียน J:K (เวลาออก) + M (Steam ID)
    //    ถ้าเป็นคนใหม่ → เขียน X (ชื่อ) + Y (Steam ID)
    if (isNew) {
        updates.push({ range: `${sheetCache.sheetName}!${COL.NEW_NAME}${row}`, values: [[name]] });
        if (id) {
            updates.push({ range: `${sheetCache.sheetName}!${COL.NEW_STEAM}${row}`, values: [[id]] });
        }
    } else {
        updates.push({
            range: `${sheetCache.sheetName}!${COL.OUT_DATE}${row}:${COL.OUT_TIME}${row}`,
            values: [[date, time]]
        });
        if (id) {
            updates.push({ range: `${sheetCache.sheetName}!${COL.STEAM}${row}`, values: [[id]] });
        }
    }

    // 4. accumulate เวลา (O-U) — สำหรับคนที่เจอเท่านั้น
    if (!isNew) {
        const totalMinutes = timeToMinutes(duration);
        let logDayMsg = '';

        if (inDate && date && inDate !== date && inTime) {
            const [inH, inM, inS] = inTime.split(':').map(Number);
            const minutesInFirstDay = 1440 - ((inH * 60) + inM + (inS / 60));
            const minutesInSecondDay = Math.max(0, totalMinutes - minutesInFirstDay);

            const colStart = getColumnByDate(inDate);
            const colEnd = getColumnByDate(date);

            if (colStart) {
                const oldMin = getAccumulatedMinutes(colStart, row);
                const newTotal = oldMin + minutesInFirstDay;
                updates.push({ range: `${sheetCache.sheetName}!${colStart}${row}`, values: [[minutesToHHmm(newTotal)]] });
            }
            if (colEnd) {
                const oldMin = getAccumulatedMinutes(colEnd, row);
                const newTotal = oldMin + minutesInSecondDay;
                updates.push({ range: `${sheetCache.sheetName}!${colEnd}${row}`, values: [[minutesToHHmm(newTotal)]] });
            }
            logDayMsg = `(แยก: ${inDate}=${Math.round(minutesInFirstDay)}น., ${date}=${Math.round(minutesInSecondDay)}น.)`;
        } else {
            const targetCol = getColumnByDate(date);
            if (targetCol) {
                const oldMin = getAccumulatedMinutes(targetCol, row);
                const newTotal = oldMin + totalMinutes;
                updates.push({ range: `${sheetCache.sheetName}!${targetCol}${row}`, values: [[minutesToHHmm(newTotal)]] });
                logDayMsg = `(คอลัมน์ ${targetCol})`;
            }
        }

        const rowNote = `แถว ${row}`;
        return { updates, logMsg: `${name} [${duration || '-'}] ${rowNote} ${logDayMsg}` };
    }

    const rowNote = isNew ? `แถว ${row} (ใหม่ที่ X:Y)` : `แถว ${row}`;
    return { updates, logMsg: `${name} [${duration || '-'}] ${rowNote}` };
}

/**
 * ✅ Flush updates ทั้งหมดไป Sheet (1 batch API call)
 */
async function flushUpdates(updates) {
    if (updates.length === 0) return;
    
    const { spreadsheetId } = getRegistryTarget();
    await safeBatchUpdateValues(spreadsheetId, updates, {
        operation: `logtime-flush-${updates.length}items`
    });
}

/**
 * ✅ อ่านชีต D:Y ทั้งก้อน → cache (ครอบคลุม X, Y)
 */
async function refreshSheetCache() {
    const { spreadsheetId, sheetName } = getRegistryTarget();
    if (!spreadsheetId || !sheetName) {
        throw new Error('REGISTRY_SPREADSHEET_ID หรือ REGISTRY_SHEET_NAME ยังไม่ตั้งค่า');
    }

    const resp = await safeGetValues(spreadsheetId, `${sheetName}!D:Y`, {
        operation: 'logtime-refreshCache'
    });
    
    sheetCache = {
        spreadsheetId,
        sheetName,
        rows: resp.data.values || [],
        loaded: true
    };
}

function extractInfo(text) {
    text = text.replace(/`/g, '').replace(/\*/g, '').replace(/\u200B/g, '');
    const name = (text.match(/รายงานเข้าเวรของ\s*[-–—]\s*(.+)/i) || [])[1]?.trim() || null;
    const inMatch = text.match(/เวลาเข้างาน[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/i);
    const outMatch = text.match(/เวลาออกงาน[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/i);
    const duration = (text.match(/ระยะเวลาที่เข้าเวร\s*\n?\s*(\d{2}:\d{2}:\d{2})/i) || [])[1] || null;
    const id = (text.match(/(steam:\w+)/i) || [])[1] || null;

    return {
        name,
        inDate: inMatch ? inMatch[1] : null,
        inTime: inMatch ? inMatch[2] : null,
        date: outMatch ? outMatch[1] : null,
        time: outMatch ? outMatch[2] : null,
        id,
        duration
    };
}

function buildMessageText(message) {
    const lines = [];
    if (message.content) lines.push(message.content);
    if (message.embeds) {
        message.embeds.forEach((e) => {
            lines.push(e.title, e.description);
            e.fields?.forEach((f) => lines.push(f.name, f.value));
        });
    }
    return lines.filter(Boolean).join('\n');
}

/**
 * ✅ processQueue ใหม่ — batch real-time
 * - refresh cache → process ทุกคนในคิว → flush updates ทันที
 * - 1 คน → flush ทันที
 * - 100 คน → flush ทันที
 */
async function processQueue() {
    if (isProcessing || logQueue.length === 0) return;

    isProcessing = true;
    const batchItems = logQueue.splice(0); // ดึงทั้งหมดจากคิว

    try {
        // ✅ refresh cache (1 API call) — เพื่อให้ data ล่าสุด
        await refreshSheetCache();
        
        // ✅ process ทุกคนใน RAM (0 API calls)
        const allUpdates = [];
        const logMessages = [];

        for (const info of batchItems) {
            const { updates, logMsg } = processSingleInRam(info);
            allUpdates.push(...updates);
            logMessages.push(logMsg);
        }

        // ✅ flush ทั้งหมด (1 API call)
        if (allUpdates.length > 0) {
            await flushUpdates(allUpdates);
        }

        // ✅ log ผลลัพธ์
        for (const msg of logMessages) {
            console.log(`✔ [logtime] บันทึกสำเร็จ: ${msg}`);
        }
        if (batchItems.length > 1) {
            console.log(`📊 [logtime] batch ${batchItems.length} คน → ${allUpdates.length} cells updated`);
        }

    } catch (err) {
        console.error(`❌ [logtime] Batch Error (${batchItems.length} คน):`, err.message);

        // retry: push กลับเข้า queue (แต่ละรายการ)
        for (const info of batchItems) {
            if ((info._retry || 0) < 1) {
                info._retry = (info._retry || 0) + 1;
                logQueue.unshift(info);
            } else {
                console.error(`❌ [logtime] ข้อมูลหาย: ${info.name} — retry ไม่สำเร็จหลังจาก 1 ครั้ง`);
                console.error(`   ข้อมูล: ชื่อ=${info.name}, วันที่=${info.date}, เวลา=${info.time}, duration=${info.duration}`);
            }
        }
    } finally {
        isProcessing = false;
        if (logQueue.length > 0) {
            processQueue();
        }
    }
}

module.exports = (client) => {

    client.on('messageCreate', (message) => {
        if (!sheetConfig.isLoaded()) return;

        const logtimeChannelId = sheetConfig.getLogtimeChannelId();
        if (!logtimeChannelId || message.channel.id !== logtimeChannelId) return;

        const text = buildMessageText(message);
        const info = extractInfo(text);

        if (info.name && info.date) {
            // ✅ เช็ค queue limit (แต่ไม่ discard — ใส่กลับให้ retry)
            if (logQueue.length >= LOG_QUEUE_MAX) {
                console.warn(`⚠️ [logtime] คิวเต็ม (${LOG_QUEUE_MAX}) — discard: ${info.name}`);
                return;
            }
            logQueue.push(info);
            console.log(`📥 [logtime] ${info.name} (คิว: ${logQueue.length})`);
            processQueue();
            return;
        }

        if (text.trim()) {
            console.log(`⚠️ [logtime] แกะข้อมูลไม่ครบ: ${info.name} / ${info.date}`);
        }
    });

    // ✅ Logtime listener active
};