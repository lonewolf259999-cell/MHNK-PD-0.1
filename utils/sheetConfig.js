// =================================================================
// ⚙️ utils/sheetConfig.js — โหลด config จาก Google Sheet แท็บ config (A:B)
// =================================================================

const { google } = require('googleapis');
const path = require('path');

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
    LOG_SHEET_ID: '',
    LOG_SHEET_NAME: '',
    REGISTRY_SPREADSHEET_ID: '',
    REGISTRY_SHEET_NAME: '',
    REGISTRY_OUT_SHEET_NAME: ''
};

let rawData = {};
let loaded = false;

function getAuth() {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: keys.client_email,
            private_key: keys.private_key
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
}

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
    const warnings = [];

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
        bypdLogChannelId: data.BYPD_LOG_CHANNEL_ID || DEFAULTS.BYPD_LOG_CHANNEL_ID,
        logSheetId: data.LOG_SHEET_ID || DEFAULTS.LOG_SHEET_ID,
        logSheetName: data.LOG_SHEET_NAME || DEFAULTS.LOG_SHEET_NAME
    };

    // ✅ เช็คค่าที่ยังว่าง แล้วเพิ่ม warning
    const requiredFields = [
        ['welcomeChannelId', 'WELCOME_CHANNEL_ID'],
        ['logChannelId', 'LOG_CHANNEL_ID'],
        ['logtimeChannelId', 'LOGTIME_CHANNEL_ID'],
        ['bypdScanChannelId', 'BYPD_SCAN_CHANNEL_ID'],
        ['bypdSendChannelId', 'BYPD_SEND_CHANNEL_ID'],
        ['bypdLogChannelId', 'BYPD_LOG_CHANNEL_ID'],
        ['logSheetId', 'LOG_SHEET_ID'],
        ['logSheetName', 'LOG_SHEET_NAME'],
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

    if (warnings.length > 0) {
        console.log('\n🔶 === Config Warnings ===');
        warnings.forEach(w => console.log(w));
        console.log('🔶 กรุณาตั้งค่าใน Google Sheet แท็บ config แล้วกดปุ่ม รีเฟรช config\n');
    }

    return result;
}

let views = buildViews({});

async function loadSheetConfig() {
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG_SHEET_ID,
            range: `${CONFIG_SHEET_NAME}!A:B`
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

        console.log('✅ [CONFIG] โหลด config จาก Google Sheet สำเร็จ');
        console.log(`📌 BYPD Log Channel: ${views.bypdLogChannelId || '(ยังไม่ตั้ง)'}`);
        console.log(`📌 Log Sheet ID: ${views.logSheetId || '(ยังไม่ตั้ง)'}`);
        console.log(`📌 Log Sheet Name: ${views.logSheetName || '(ยังไม่ตั้ง)'}`);
        console.log(`📌 ชีตนับเคส: ${views.count.SPREADSHEET_ID || '(ยังไม่ตั้ง)'}`);
        console.log(`📌 ชีตลงทะเบียน: ${views.registry.spreadsheetId}`);
        return views;
    } catch (error) {
        console.error('❌ [CONFIG] โหลด config ไม่สำเร็จ:', error);
        loaded = false;
        throw error;
    }
}

async function reloadSheetConfig() {
    return loadSheetConfig();
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

function getLogSheetId() {
    return views.logSheetId;
}

function getLogSheetName() {
    return views.logSheetName;
}

async function writeConfigKeys(updates) {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG_SHEET_ID,
        range: `${CONFIG_SHEET_NAME}!A:B`
    });

    const rows = res.data.values || [];
    const map = new Map();

    for (const row of rows) {
        if (row[0]) {
            map.set(row[0], row[1] !== undefined ? row[1] : '');
        }
    }

    for (const [key, value] of updates) {
        map.set(key, value);
    }

    const newRows = Array.from(map.entries()).map(([key, value]) => [key, value]);

    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId: CONFIG_SHEET_ID,
                range: `${CONFIG_SHEET_NAME}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: newRows }
            });
            break;
        } catch (err) {
            lastError = err;
            console.error(`❌ [CONFIG] writeConfigKeys attempt ${attempt} ล้มเหลว:`, err.message);
            if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000));
}
}
    }

    if (lastError) {
        throw lastError;
    }

    await reloadSheetConfig();
}

async function writeCountConfigRows(configValues) {
    return writeConfigKeys(configValues);
}

module.exports = {
    CONFIG_SHEET_ID,
    CONFIG_SHEET_NAME,
    loadSheetConfig,
    reloadSheetConfig,
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
    getLogSheetId,
    getLogSheetName,
    writeConfigKeys,
    writeCountConfigRows
};

