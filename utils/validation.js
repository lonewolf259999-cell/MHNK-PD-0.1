// =================================================================
// 📝 utils/validation.js - ระบบตรวจสอบข้อมูล Input
// =================================================================

/**
 * ตรวจสอบว่าค่าว่างหรือไม่
 * @param {any} value - ค่าที่ต้องการตรวจสอบ
 * @returns {boolean}
 */
function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/**
 * ตรวจสอบว่าเป็นตัวเลขที่ถูกต้องหรือไม่
 * @param {any} value - ค่าที่ต้องการตรวจสอบ
 * @param {Object} options - ตัวเลือกเพิ่มเติม
 * @param {number} [options.min] - ค่าต่ำสุด
 * @param {number} [options.max] - ค่าสูงสุด
 * @param {boolean} [options.integerOnly] - ต้องเป็นจำนวนเต็มเท่านั้น
 * @returns {{ valid: boolean, error?: string }}
 */
function validateNumber(value, options = {}) {
    if (isEmpty(value)) {
        return { valid: false, error: 'ค่าห้ามว่าง' };
    }

    const num = Number(value);

    if (isNaN(num)) {
        return { valid: false, error: 'ต้องเป็นตัวเลขเท่านั้น' };
    }

    if (options.integerOnly && !Number.isInteger(num)) {
        return { valid: false, error: 'ต้องเป็นจำนวนเต็มเท่านั้น' };
    }

    if (options.min !== undefined && num < options.min) {
        return { valid: false, error: `ค่าต้องไม่ต่ำกว่า ${options.min}` };
    }

    if (options.max !== undefined && num > options.max) {
        return { valid: false, error: `ค่าต้องไม่เกิน ${options.max}` };
    }

    return { valid: true };
}

/**
 * ตรวจสอบว่าเป็นข้อความที่ถูกต้องหรือไม่
 * @param {any} value - ค่าที่ต้องการตรวจสอบ
 * @param {Object} options - ตัวเลือกเพิ่มเติม
 * @param {number} [options.minLength] - ความยาวขั้นต่ำ
 * @param {number} [options.maxLength] - ความยาวสูงสุด
 * @param {RegExp} [options.pattern] - Pattern ที่ต้องตรง
 * @returns {{ valid: boolean, error?: string }}
 */
function validateString(value, options = {}) {
    if (!value || typeof value !== 'string') {
        return { valid: false, error: 'ต้องเป็นข้อความเท่านั้น' };
    }

    const trimmed = value.trim();

    if (options.required && isEmpty(trimmed)) {
        return { valid: false, error: 'ห้ามว่าง' };
    }

    if (options.minLength && trimmed.length < options.minLength) {
        return { valid: false, error: `ต้องมีความยาวอย่างน้อย ${options.minLength} ตัวอักษร` };
    }

    if (options.maxLength && trimmed.length > options.maxLength) {
        return { valid: false, error: `ต้องมีความยาวไม่เกิน ${options.maxLength} ตัวอักษร` };
    }

    if (options.pattern && !options.pattern.test(trimmed)) {
        return { valid: false, error: options.patternError || 'รูปแบบไม่ถูกต้อง' };
    }

    return { valid: true };
}

/**
 * ตรวจสอบข้อมูล Tag
 * @param {string} tagName - ชื่อแท็ก
 * @param {string} tagValue - ค่าของแท็ก
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTag(tagName, tagValue) {
    const nameResult = validateString(tagName, {
        required: true,
        maxLength: 100
    });
    if (!nameResult.valid) return nameResult;

    const valueResult = validateString(tagValue, {
        maxLength: 500
    });
    if (!valueResult.valid) return valueResult;

    return { valid: true };
}

/**
 * ตรวจสอบข้อมูล Log Time
 * @param {Object} data - ข้อมูลเวลาทำงาน
 * @param {string} data.userId - ID ผู้ใช้
 * @param {string} data.date - วันที่
 * @param {string} data.time - เวลา
 * @param {string} data.task - งานที่ทำ
 * @returns {{ valid: boolean, error?: string }}
 */
function validateLogTime(data) {
    if (!data.userId || typeof data.userId !== 'string') {
        return { valid: false, error: 'userId ไม่ถูกต้อง' };
    }

    const dateResult = validateString(data.date, {
        required: true,
        pattern: /^\d{4}-\d{2}-\d{2}$/,
        patternError: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'
    });
    if (!dateResult.valid) return dateResult;

    const timeResult = validateString(data.time, {
        required: true,
        pattern: /^\d{2}:\d{2}$/,
        patternError: 'รูปแบบเวลาต้องเป็น HH:MM'
    });
    if (!timeResult.valid) return timeResult;

    return { valid: true };
}

/**
 * ทำความสะอาดข้อมูลขาเข้า (Sanitization)
 * @param {string} input - ข้อความที่ต้องการทำความสะอาด
 * @returns {string}
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';

    return input
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, '') // ลบ control characters
        .replace(/<script>/gi, '') // ป้องกัน XSS
        .replace(/javascript:/gi, '')
        .substring(0, 5000); // จำกัดความยาว
}

/**
 * ตรวจสอบว่าข้อความถูกต้องสำหรับ Discord หรือไม่
 * @param {any} messageContent - ข้อความที่ต้องการตรวจสอบ
 * @returns {boolean}
 */
function validateMessageContent(messageContent) {
    if (messageContent === null || messageContent === undefined) return false;
    if (typeof messageContent !== 'string') return false;
    if (messageContent.trim() === '') return false;
    if (messageContent.length > 2000) return false;
    return true;
}

module.exports = {
    isEmpty,
    validateNumber,
    validateString,
    validateTag,
    validateLogTime,
    sanitizeInput,
    validateMessageContent
};

