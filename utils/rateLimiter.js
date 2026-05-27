// =================================================================
// 📝 utils/rateLimiter.js - ระบบจำกัดการใช้งาน
// =================================================================

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} windowMs - ระยะเวลาหน้าต่าง (มิลลิวินาที)
 * @property {number} maxRequests - จำนวนคำขอสูงสุดในหน้าต่าง
 * @property {string} message - ข้อความเมื่อถูกจำกัด
 */

/** @type {Map<string, { count: number, resetTime: number }>} */
const rateLimitStore = new Map();

/** @type {Map<string, RateLimitConfig>} */
const configs = new Map();

/**
 * ตั้งค่า Rate Limit สำหรับ feature
 * @param {string} featureName - ชื่อ feature
 * @param {RateLimitConfig} config - การตั้งค่า
 */
function setConfig(featureName, config) {
    configs.set(featureName, {
        windowMs: config.windowMs || 60000, // ค่าเริ่มต้น 1 นาที
        maxRequests: config.maxRequests || 10,
        message: config.message || 'คุณใช้งานบ่อยเกินไป กรุณารอสักครู่'
    });
}

/**
 * ตรวจสอบว่าผ่าน rate limit หรือไม่
 * @param {string} identifier - ID ของผู้ใช้ หรือ feature
 * @param {string} [featureName] - ชื่อ feature (ถ้าไม่ใส่จะใช้ identifier เป็น key)
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
function check(identifier, featureName = identifier) {
    const config = configs.get(featureName);

    if (!config) {
        // ถ้าไม่มี config ให้ผ่านได้เลย
        return { allowed: true, remaining: Infinity, resetIn: 0 };
    }

    const key = `${featureName}:${identifier}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);

    // ถ้าไม่มี record หรือหมดอายุ
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

    // ถ้าครบจำนวนแล้ว
    if (record.count >= config.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: record.resetTime - now
        };
    }

    // เพิ่มจำนวน
    record.count++;

    return {
        allowed: true,
        remaining: config.maxRequests - record.count,
        resetIn: record.resetTime - now
    };
}

/**
 * สร้าง middleware สำหรับใช้กับ interactions
 * @param {string} featureName - ชื่อ feature
 * @returns {Function}
 */
function createMiddleware(featureName) {
    return async (interaction, next) => {
        const userId = interaction.user?.id || interaction.author?.id;

        if (!userId) {
            return next();
        }

        const result = check(userId, featureName);

        if (!result.allowed) {
            const seconds = Math.ceil(result.resetIn / 1000);
            await interaction.reply({
                content: `⏰ ${configs.get(featureName)?.message || 'คุณใช้งานบ่อยเกินไป กรุณารอ ' + seconds + ' วินาที'}`,
                flags: ['Ephemeral']
            });
            return false;
        }

        await next();
        return true;
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

module.exports = {
    setConfig,
    check,
    createMiddleware,
    cleanup
};
