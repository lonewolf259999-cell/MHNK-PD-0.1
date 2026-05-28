// =================================================================
// ⏱️ features/logtime/logtime.js — บันทึกเวลาเข้าเวร → NamePD
// คอลัมน์: หาแถว=D | ไม่เจอ→ลงชื่อที่ D แถว 300+ | ออกงาน=J,K | Steam=M | สะสม=O–U
// =================================================================

const sheetConfig = require('../../utils/sheetConfig');
const {
    safeGetValues,
    safeUpdateValues,
    safeBatchUpdateValues,
    createSheetsClient
} = require('../../utils/apiSafe');

const NEW_ROW_MIN = 300;
const COL = {
    FIND_NAME: 'D',
    OUT_DATE: 'J',
    OUT_TIME: 'K',
    STEAM: 'M'
};

const LOG_QUEUE_DELAY_MS = 800;
const LOG_QUEUE_ESTIMATE_SEC = 1.5; // API + delay โดยประมาณต่อรายการ

const logQueue = [];
let isProcessing = false;

function getSheets() {
    return createSheetsClient();
}

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

function rowNameMatches(logName, dCell) {
    const log = normalizeName(logName);
    if (!log || !dCell) return false;
    const full = normalizeName(dCell);
    const ic = icNameFromD(dCell);
    return full.includes(log) || ic.includes(log) || full === log || ic === log;
}

async function findRowSmart(sheets, spreadsheetId, sheetName, name) {
    const range = `${sheetName}!${COL.FIND_NAME}:${COL.FIND_NAME}`;
    // Use safeGetValues for consistency, but also accept passed sheets client
    // We call apiSafe directly regardless
    const resp = await safeGetValues(spreadsheetId, range, {
        operation: `logtime-findRow-${name}`
    });
    const rowData = resp.data.values || [];

    // 1) เจอชื่อใน D แล้ว (แถว 3 ขึ้นไป รวมโซน 300+)
    for (let idx = 2; idx < rowData.length; idx++) {
        const dCell = rowData[idx]?.[0];
        if (dCell && rowNameMatches(name, dCell)) {
            return { row: idx + 1, isNew: false };
        }
    }

    // 2) ไม่เจอ → หาแถวว่าง D ตั้งแต่ 300
    for (let row = NEW_ROW_MIN; row <= rowData.length; row++) {
        const dCell = rowData[row - 1]?.[0];
        if (!dCell || !String(dCell).trim()) {
            return { row, isNew: true };
        }
    }

    // 3) โซน 300+ เต็ม → แถวถัดไป
    return { row: Math.max(rowData.length + 1, NEW_ROW_MIN), isNew: true };
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

async function accumulateTime(sheets, spreadsheetId, sheetName, col, row, newMinutes) {
    const range = `${sheetName}!${col}${row}`;
    const resp = await safeGetValues(spreadsheetId, range, {
        operation: `logtime-accumulate-${col}${row}`
    });
    let currentVal = resp.data.values?.[0]?.[0] || '00:00';

    let oldMinutes = 0;
    if (currentVal.includes(':')) {
        const [h, m] = currentVal.split(':').map(Number);
        oldMinutes = (h * 60) + m;
    }

    const totalMinutes = oldMinutes + newMinutes;
    const timeString = minutesToHHmm(totalMinutes);

    await safeUpdateValues(spreadsheetId, range, [[timeString]], {
        operation: `logtime-accumulate-update-${col}${row}`
    });
    return timeString;
}

async function saveLog(info) {
    const { name, inDate, inTime, date, time, id, duration } = info;
    const { spreadsheetId, sheetName } = getRegistryTarget();

    if (!spreadsheetId || !sheetName) {
        throw new Error('REGISTRY_SPREADSHEET_ID หรือ REGISTRY_SHEET_NAME ยังไม่ตั้งค่า');
    }

    const sheets = getSheets();
    const { row, isNew } = await findRowSmart(sheets, spreadsheetId, sheetName, name);

    const updateData = [];
    if (isNew) {
        updateData.push({ range: `${sheetName}!${COL.FIND_NAME}${row}`, values: [[name]] });
    }
    updateData.push(
        { range: `${sheetName}!${COL.OUT_DATE}${row}:${COL.OUT_TIME}${row}`, values: [[date, time]] }
    );
    if (id) updateData.push({ range: `${sheetName}!${COL.STEAM}${row}`, values: [[id]] });

    await safeBatchUpdateValues(spreadsheetId, updateData, {
        operation: `logtime-save-${name}`
    });

    const totalMinutes = timeToMinutes(duration);
    let logDayMsg = '';

    if (inDate && date && inDate !== date && inTime) {
        const [inH, inM, inS] = inTime.split(':').map(Number);
        const minutesInFirstDay = 1440 - ((inH * 60) + inM + (inS / 60));
        const minutesInSecondDay = Math.max(0, totalMinutes - minutesInFirstDay);

        const colStart = getColumnByDate(inDate);
        const colEnd = getColumnByDate(date);

        if (colStart) await accumulateTime(sheets, spreadsheetId, sheetName, colStart, row, minutesInFirstDay);
        if (colEnd) await accumulateTime(sheets, spreadsheetId, sheetName, colEnd, row, minutesInSecondDay);
        logDayMsg = `(แยกจริง: ${inDate}=${Math.round(minutesInFirstDay)}น., ${date}=${Math.round(minutesInSecondDay)}น.)`;
    } else {
        const targetCol = getColumnByDate(date);
        if (targetCol) {
            const newTotal = await accumulateTime(sheets, spreadsheetId, sheetName, targetCol, row, totalMinutes);
            logDayMsg = `(คอลัมน์ ${targetCol}, รวมใหม่: ${newTotal})`;
        }
    }

    const rowNote = isNew ? `แถว ${row} (ใหม่→D)` : `แถว ${row}`;
    console.log(`✔ [logtime] บันทึกสำเร็จ: ${name} [${duration || '-'}] ${rowNote} ${logDayMsg}`);
}

async function processQueue() {
    if (isProcessing || logQueue.length === 0) return;

    isProcessing = true;
    const info = logQueue.shift();

    try {
        await saveLog(info);
        await new Promise((resolve) => setTimeout(resolve, LOG_QUEUE_DELAY_MS));
    } catch (err) {
        console.error('❌ [logtime] Queue Error:', err.message);
        if ((info._retry || 0) < 1) {
            info._retry = (info._retry || 0) + 1;
            logQueue.unshift(info);
            console.log(`🔄 [logtime] Retry รายการ ${info.name} (ครั้งที่ ${info._retry})`);
        } else {
            console.error(`❌ [logtime] ข้อมูลหาย: ${info.name} — retry ไม่สำเร็จหลังจาก 1 ครั้ง`);
            console.error(`   ข้อมูลที่หาย: ชื่อ=${info.name}, วันที่=${info.date}, เวลา=${info.time}, duration=${info.duration}`);
        }
    } finally {
        isProcessing = false;
            processQueue();
        }
        }

module.exports = (client) => {
    const { spreadsheetId, sheetName } = getRegistryTarget();

    client.on('messageCreate', (message) => {
        if (!sheetConfig.isLoaded()) return;

        const logtimeChannelId = sheetConfig.getLogtimeChannelId();
        if (!logtimeChannelId || message.channel.id !== logtimeChannelId) return;

        const text = buildMessageText(message);
        const info = extractInfo(text);

        if (info.name && info.date) {
            logQueue.push(info);
            const queueSize = logQueue.length;
            console.log(`📥 [logtime] เพิ่มคิว: ${info.name} (คิว: ${queueSize})`);
            if (queueSize >= 5) {
                const estSec = Math.ceil(queueSize * LOG_QUEUE_ESTIMATE_SEC);
                console.log(`⏳ [logtime] คิวสะสม ${queueSize} รายการ — ประมาณ ${estSec} วิ จึงจะครบ (ทีละรายการ)`);
            }
            processQueue();
            return;
        }

        if (text.trim()) {
            console.log('⚠️ [logtime] ข้อความในช่อง Log เวร แต่แกะข้อมูลไม่ครบ (ต้องมีชื่อ + วันออกงาน)');
        }
    });

    console.log(`✅ [logtime] ฟังช่อง Log เวร (${sheetConfig.getLogtimeChannelId()}) → ${sheetName} (${spreadsheetId})`);
};

