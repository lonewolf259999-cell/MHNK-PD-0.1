// =================================================================
// ⚙️ utils/sheetConfig.js — โหลด config จาก Google Sheet แท็บ config (A:B)
// =================================================================

const path = require('path');
const { safeGetValues, safeUpdateValues } = require('./apiSafe');

const keys = require(path.join(__dirname, '../credentials.json'));

const CONFIG_SHEET_ID = '1YV_BIFiilxUM9XrW1cSYZTOgne1JnKoCXtRw7PUCCGs';
const CONFIG_SHEET_NAME = 'config';

const DEFAULTS = {
    WELCOME_CHANNEL_ID: '',
    LOG_CHANNEL_ID: '',
    LOGTIME_CHANNEL_ID: '',
    BYPD_SCAN_CHANNEL_ID: '',
    BYPD_SEND_CHANNEL_ID: '',
    BYPD_LOG_CHANNEL_ID: '',
    REGISTRY_SPREADSHEET_ID: '',
    REGISTRY_SHEET_NAME: '',
    REGISTRY_OUT_SHEET_NAME: ''
};

let rawData = {};
let loaded = false;


function parseCountChannels(data) {
    if (data.COUNT_CHANNEL_IDS && data.COUNT_CHANNEL_IDS.trim()) {
        const parts = data.COUNT_CHANNEL_IDS.split(',');
        return {
            CHANNEL_1: (parts[0] || '').trim(),
            CHANNEL_2: (parts[1] || '').trim(),
            CHANNEL_3: (parts[2] || '').trim(),
            CHANNEL_4: (parts[3] || '').trim(),
            CHANNEL_5: (parts[4] || '').trim()
        };
    }

    return {
        CHANNEL_1: data.CHANNEL_ID_1 || '',
        CHANNEL_2: data.CHANNEL_ID_2 || '',
        CHANNEL_3: data.CHANNEL_ID_3 || '',
        CHANNEL_4: data.CHANNEL_ID_4 || '',
        CHANNEL_5: data.CHANNEL_ID_5 || ''
    };
}

function buildViews(data) {
    const result = {
        count: {
            SPREADSHEET_ID: data.SPREADSHEET_ID || '',
            SHEET_NAME: data.SHEET_NAME || '',
            CHANNELS: parseCountChannels(data)
        },
        registry: {
            spreadsheetId: data.REGISTRY_SPREADSHEET_ID || DEFAULTS.REGISTRY_SPREADSHEET_ID,
            sheetName: data.REGISTRY_SHEET_NAME || DEFAULTS.REGISTRY_SHEET_NAME,
            outSheetName: data.REGISTRY_OUT_SHEET_NAME || DEFAULTS.REGISTRY_OUT_SHEET_NAME
        },
        welcomeChannelId: data.WELCOME_CHANNEL_ID || DEFAULTS.WELCOME_CHANNEL_ID,
        logChannelId: data.LOG_CHANNEL_ID || DEFAULTS.LOG_CHANNEL_ID,
        logtimeChannelId: data.LOGTIME_CHANNEL_ID || DEFAULTS.LOGTIME_CHANNEL_ID,
        bypdScanChannelId: data.BYPD_SCAN_CHANNEL_ID || DEFAULTS.BYPD_SCAN_CHANNEL_ID,
        bypdSendChannelId: data.BYPD_SEND_CHANNEL_ID || DEFAULTS.BYPD_SEND_CHANNEL_ID,
        bypdLogChannelId: data.BYPD_LOG_CHANNEL_ID || DEFAULTS.BYPD_LOG_CHANNEL_ID
    };

    return result;
}

function checkWarnings(result) {
    const warnings = [];

    const requiredFields = [
        ['welcomeChannelId', 'WELCOME_CHANNEL_ID'],
        ['logChannelId', 'LOG_CHANNEL_ID'],
        ['logtimeChannelId', 'LOGTIME_CHANNEL_ID'],
        ['bypdScanChannelId', 'BYPD_SCAN_CHANNEL_ID'],
        ['bypdSendChannelId', 'BYPD_SEND_CHANNEL_ID'],
        ['bypdLogChannelId', 'BYPD_LOG_CHANNEL_ID'],
        ['registry.spreadsheetId', 'REGISTRY_SPREADSHEET_ID'],
        ['registry.sheetName', 'REGISTRY_SHEET_NAME'],
        ['registry.outSheetName', 'REGISTRY_OUT_SHEET_NAME']
    ];

    for (const [field, configKey] of requiredFields) {
        let value;
        if (field.includes('.')) {
            const parts = field.split('.');
            value = result[parts[0]]?.[parts[1]];
        } else {
            value = result[field];
        }
        if (!value || !value.trim()) {
            warnings.push(`⚠️ [CONFIG WARNING] ${configKey} ยังไม่ได้ตั้งค่า — ไม่มีใน Sheet และ DEFAULTS`);
        }
    }

    return warnings;
}

let views = {};

async function loadSheetConfig() {
    try {
        const res = await safeGetValues(CONFIG_SHEET_ID, `${CONFIG_SHEET_NAME}!A:B`, {
            operation: 'loadSheetConfig'
        });

        const rows = res.data.values || [];
        const data = {};

        for (const row of rows) {
            if (row[0]) {
                data[row[0]] = row[1] ? row[1].trim() : '';
            }
        }

        rawData = data;
        views = buildViews(data);
        loaded = true;

        // แสดง warnings เฉพาะเมื่อโหลดข้อมูลจาก Sheet จริงแล้ว
        const warnings = checkWarnings(views);
        if (warnings.length > 0) {
            console.log('\n🔶 === Config Warnings ===');
            warnings.forEach(w => console.log(w));
            console.log('🔶 กรุณาตั้งค่าใน Google Sheet แท็บ config แล้วกดปุ่ม รีเฟรช config\n');
        }

        console.log('✅ [CONFIG] โหลด config จาก Google Sheet สำเร็จ');
        console.log(`📌 BYPD Log Channel: ${views.bypdLogChannelId || '(ยังไม่ตั้ง)'}`);
        console.log(`📌 ชีตนับเคส: ${views.count.SPREADSHEET_ID || '(ยังไม่ตั้ง)'}`);
        console.log(`📌 ชีตลงทะเบียน: ${views.registry.spreadsheetId}`);
        return views;
    } catch (error) {
        console.error('❌ [CONFIG] โหลด config ไม่สำเร็จ:', error);
        loaded = false;
        throw error;
    }
}

// ✅ ใช้ cached rawData แทนการ GET Sheet ใหม่ทุกครั้ง
async function writeConfigKeys(updates) {
    // ✅ ใช้ rawData ที่ cache ไว้ + อ่าน Sheet เฉพาะเมื่อยังไม่ loaded
    const map = new Map();
    
    if (loaded && Object.keys(rawData).length > 0) {
        // ใช้ cached data
        for (const [key, value] of Object.entries(rawData)) {
            map.set(key, value);
        }
    } else {
        // fallback: อ่านจาก Sheet (ใช้ safe API)
        try {
            const res = await safeGetValues(CONFIG_SHEET_ID, `${CONFIG_SHEET_NAME}!A:B`, {
                operation: 'writeConfigKeys-fallback'
            });
            const rows = res.data.values || [];
            for (const row of rows) {
                if (row[0]) {
                    map.set(row[0], row[1] !== undefined ? row[1] : '');
                }
            }
        } catch (fetchErr) {
            console.error('❌ [CONFIG] fallback fetch failed:', fetchErr.message);
            // Continue with empty map
        }
    }

    // Apply updates
    for (const [key, value] of updates) {
        map.set(key, value);
    }

    const newRows = Array.from(map.entries()).map(([key, value]) => [key, value]);

    await safeUpdateValues(CONFIG_SHEET_ID, `${CONFIG_SHEET_NAME}!A1`, newRows, {
        operation: 'writeConfigKeys',
        maxRetries: 3
    });

    // ✅ อัปเดต cache แทนการ reload ทั้งหมด
    for (const [key, value] of updates) {
        rawData[key] = value;
    }
    views = buildViews(rawData);
    
    // เช็ค warnings อีกครั้งหลังอัปเดต
    const warnings = checkWarnings(views);
    if (warnings.length > 0) {
        console.log('\n🔶 === Config Warnings (หลังอัปเดต) ===');
        warnings.forEach(w => console.log(w));
        console.log('🔶 กรุณาตั้งค่าใน Google Sheet แท็บ config แล้วกดปุ่ม รีเฟรช config\n');
    }
}

function isLoaded() {
    return loaded;
}

function get(key) {
    if (rawData[key] !== undefined && rawData[key] !== '') {
        return rawData[key];
    }
    return DEFAULTS[key] || '';
}

function getCountConfig() {
    return views.count;
}

function getRegistryConfig() {
    return views.registry;
}

function getWelcomeChannelId() {
    return views.welcomeChannelId;
}

function getLogChannelId() {
    return views.logChannelId;
}

function getLogtimeChannelId() {
    return views.logtimeChannelId;
}

function getBypdScanChannelId() {
    return views.bypdScanChannelId;
}

function getBypdSendChannelId() {
    return views.bypdSendChannelId;
}

function getBypdLogChannelId() {
    return views.bypdLogChannelId;
}

async function writeCountConfigRows(configValues) {
    return writeConfigKeys(configValues);
}

module.exports = {
    CONFIG_SHEET_ID,
    CONFIG_SHEET_NAME,
    loadSheetConfig,
    reloadSheetConfig: loadSheetConfig,
    isLoaded,
    get,
    getCountConfig,
    getRegistryConfig,
    getWelcomeChannelId,
    getLogChannelId,
    getLogtimeChannelId,
    getBypdScanChannelId,
    getBypdSendChannelId,
    getBypdLogChannelId,
    writeConfigKeys,
    writeCountConfigRows
};