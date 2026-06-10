// =================================================================
// ✂️ utils/nicknameHelper.js — รวม logic การตัดชื่อ Discord nickname
// =================================================================

const MAX_DISCORD_NICKNAME = 32;

/**
 * ตัดชื่อให้สั้นลงไม่เกิน 32 ตัว (Discord limit)
 * @param {string} fullName - ชื่อเต็ม เช่น "001 [MHNK-PD] Darin Giotto"
 * @returns {string} ชื่อที่ตัดแล้ว
 */
function truncateNickname(fullName) {
    if (fullName.length <= MAX_DISCORD_NICKNAME) return fullName;

    const prefixMatch = fullName.match(/^(.+? \[MHNK-PD\] )/);
    if (prefixMatch) {
        const prefix = prefixMatch[1];
        const icPart = fullName.slice(prefix.length);
        const availableForIC = MAX_DISCORD_NICKNAME - prefix.length;
        if (availableForIC > 0) {
            return prefix + icPart.slice(0, availableForIC);
        }
        return fullName.slice(0, MAX_DISCORD_NICKNAME);
    }

    return fullName.slice(0, MAX_DISCORD_NICKNAME);
}

module.exports = { truncateNickname, MAX_DISCORD_NICKNAME };