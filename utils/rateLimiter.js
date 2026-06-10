// =================================================================
// 📝 utils/rateLimiter.js - ระบบจำกัดการใช้งาน
// =================================================================

/** @type {Map<string, { count: number, resetTime: number }>} */
const rateLimitStore = new Map();

/** @type {Map<string, { windowMs: number, maxRequests: number, message: string }>} */
const configs = new Map();

/**
 * ตั้งค่า Rate Limit สำหรับ feature
 * @param {string} featureName - ชื่อ feature
 * @param {Object} config - การตั้งค่า
 */
function setConfig(featureName, config) {
    configs.set(featureName, {
        windowMs: config.windowMs || 60000,
        maxRequests: config.maxRequests || 10,
        message: config.message || 'คุณใช้งานบ่อยเกินไป กรุณารอสักครู่'
    });
}

/**
 * ตรวจสอบว่าผ่าน rate limit หรือไม่
 * @param {string} identifier - ID ของผู้ใช้ หรือ feature
 * @param {string} [featureName] - ชื่อ feature
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
function check(identifier, featureName = identifier) {
    const config = configs.get(featureName);
    if (!config) {
        return { allowed: true, remaining: Infinity, resetIn: 0 };
    }

    const key = `${featureName}:${identifier}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
        rateLimitStore.set(key, {
            count: 1,
            resetTime: now + config.windowMs
        });
        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetIn: config.windowMs
        };
    }

    if (record.count >= config.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: record.resetTime - now,
            message: config.message
        };
    }

    record.count++;
    return {
        allowed: true,
        remaining: config.maxRequests - record.count,
        resetIn: record.resetTime - now
    };
}

/**
 * ล้างข้อมูล rate limit ที่หมดอายุ
 */
function cleanup() {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
        if (now > record.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}

// ทำความสะอาดทุก 5 นาที
setInterval(cleanup, 5 * 60 * 1000);

// ตั้งค่า default configs
setConfig('global', {
    windowMs: 60000,
    maxRequests: 20,
    message: 'คุณใช้งานบ่อยเกินไป กรุณารอสักครู่'
});

setConfig('logtime', {
    windowMs: 300000, // 5 นาที
    maxRequests: 10,
    message: 'บันทึกเวลาบ่อยเกินไป กรุณารอ 5 นาที'
});

setConfig('register', {
    windowMs: 60000,
    maxRequests: 3,
    message: 'ลงทะเบียนบ่อยเกินไป กรุณารอ 1 นาที'
});

setConfig('edittag', {
    windowMs: 10000,
    maxRequests: 5,
    message: 'แก้ไขแท็กบ่อยเกินไป กรุณารอ 10 วินาที'
});

module.exports = {
    setConfig,
    check,
    cleanup
};
