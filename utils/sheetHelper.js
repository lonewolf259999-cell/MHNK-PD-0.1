// =================================================================
// 🛠️ utils/sheetHelper.js — Shared Google Sheets helper utilities
// =================================================================

/**
 * แปลง letter column name เป็น index (A=0, B=1, ..., Z=25, AA=26, ...)
 * @param {string} col - Column letter (e.g., 'A', 'D', 'AA')
 * @returns {number} Column index (0-based)
 */
function colToIndex(col) {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
        index = index * 26 + (col.charCodeAt(i) - 64);
    }
    return index - 1;
}

/**
 * แปลง index เป็น letter column name (0=A, 1=B, ...)
 * @param {number} index - Column index (0-based)
 * @returns {string} Column letter
 */
function indexToCol(index) {
    let col = '';
    let n = index + 1;
    while (n > 0) {
        n--;
        col = String.fromCharCode(65 + (n % 26)) + col;
        n = Math.floor(n / 26);
    }
    return col;
}

/**
 * สร้าง batchUpdate requests สำหรับ clear หลายคอลัมน์ในแถวเดียวกัน
 * @param {number} rowIndex - 1-based row index
 * @param {string[]} columnsToClear - Array of column letters
 * @returns {Object[]} Array of batchUpdate requests
 */
function buildClearCellRequests(rowIndex, columnsToClear) {
    return columnsToClear.map(col => ({
        updateCells: {
            range: {
                sheetId: null,
                startRowIndex: rowIndex - 1,
                endRowIndex: rowIndex,
                startColumnIndex: colToIndex(col),
                endColumnIndex: colToIndex(col) + 1
            },
            fields: 'userEnteredValue'
        }
    }));
}

/**
 * คอลัมน์มาตรฐานที่ต้อง clear ใน NamePD (B, D, E, F, G, H, J, K, M, O, P, Q, R, S, T, U)
 */
const STANDARD_CLEAR_COLUMNS = ['B', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U'];

module.exports = {
    colToIndex,
    indexToCol,
    buildClearCellRequests,
    STANDARD_CLEAR_COLUMNS
};