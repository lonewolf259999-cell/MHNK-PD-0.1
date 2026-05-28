// =================================================================
// 📊 features/CountAuto/logic/sheetUpdater.js — อัปเดต Google Sheet
// =================================================================

const { safeGetValues, safeUpdateValues } = require('../../../utils/apiSafe');

function findUserRow(rows, person) {
    return rows.findIndex(
        (r, idx) =>
            idx >= 1 &&
            r[1] &&
            r[1] === person.username
    );
}

async function processSheetBatch(list, msg, configData, isDel = false) {
    try {
        const res = await safeGetValues(configData.SPREADSHEET_ID, `${configData.SHEET_NAME}!A:G`, {
            operation: 'processSheetBatch'
        });

        let rows = res.data.values || [];

        const chMap = {
            [configData.CHANNELS.CHANNEL_1]: { idx: 2, name: 'CHANNEL_1' },
            [configData.CHANNELS.CHANNEL_2]: { idx: 3, name: 'CHANNEL_2' },
            [configData.CHANNELS.CHANNEL_3]: { idx: 4, name: 'CHANNEL_3' },
            [configData.CHANNELS.CHANNEL_4]: { idx: 5, name: 'CHANNEL_4' },
            [configData.CHANNELS.CHANNEL_5]: { idx: 6, name: 'CHANNEL_5' }
        };

        const chInfo = chMap[msg.channel.id];
        if (!chInfo) return;

        const amt = isDel ? -1 : 1;
        console.log(`\n📊 ${isDel ? 'ลดแต้ม' : 'เพิ่มแต้ม'} (${list.length} คน)`);

        for (const p of list) {
            let rIdx = findUserRow(rows, p);

            if (rIdx !== -1) {
                let oldVal = parseInt(rows[rIdx][chInfo.idx] || '0');
                let newVal = Math.max(0, oldVal + amt);
                rows[rIdx][chInfo.idx] = newVal.toString();
                console.log(`[${isDel ? '-' : '+'}] ${p.nickname} | ${chInfo.name}: ${oldVal} → ${newVal}`);
            } else if (!isDel) {
                const newR = [p.nickname, p.username, '0', '0', '0', '0', '0'];
                newR[chInfo.idx] = '1';
                rows.push(newR);
                console.log(`[+] ${p.nickname} (คนใหม่) | ${chInfo.name}: 0 → 1`);
            }
        }

        await safeUpdateValues(configData.SPREADSHEET_ID, `${configData.SHEET_NAME}!A1`, rows, {
            operation: 'processSheetBatch-update'
        });

    } catch (e) {
        console.error('❌ Google Sheet API Error:', e);
    }
}

module.exports = { findUserRow, processSheetBatch };
