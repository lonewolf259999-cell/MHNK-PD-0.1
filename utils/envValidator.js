// =================================================================
// 📝 utils/envValidator.js - ตรวจสอบ Environment Variables
// =================================================================
require('dotenv').config();

/** @type {Array<{key: string, required: boolean, default?: string, validate?: (value: string) => boolean, error: string}>} */
const envConfig = [
    {
        key: 'BOT_TOKEN',
        required: true,
        validate: (value) => value && value.length > 20,
        error: 'BOT_TOKEN ไม่ถูกต้อง (ต้องมีความยาวมากกว่า 20 ตัวอักษร)'
    },
    {
        key: 'NODE_ENV',
        required: false,
        default: 'development',
        validate: (value) => ['development', 'production', 'test'].includes(value),
        error: 'NODE_ENV ต้องเป็น development, production หรือ test'
    },
    {
        key: 'LOG_LEVEL',
        required: false,
        default: 'info',
        validate: (value) => ['error', 'warn', 'info', 'http', 'debug'].includes(value),
        error: 'LOG_LEVEL ต้องเป็น error, warn, info, http หรือ debug'
    },
    {
        key: 'MAX_LOG_SIZE',
        required: false,
        default: '5242880',
        validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
        error: 'MAX_LOG_SIZE ต้องเป็นตัวเลขที่มากกว่า 0'
    }
];

/**
 * ตรวจสอบ Environment Variables ทั้งหมด
 * @returns {{ valid: boolean, errors: string[], env: Object }}
 */
function validateEnvironment() {
    const errors = [];
    const validated = {};

    for (const config of envConfig) {
        const value = process.env[config.key];

        // ถ้าไม่มีค่าและไม่ required
        if (value === undefined) {
            if (config.required) {
                errors.push(`❌ ขาด ${config.key} - จำเป็นต้องมีใน .env`);
            } else if (config.default !== undefined) {
                validated[config.key] = config.default;
                console.log(`ℹ️  ใช้ค่าเริ่มต้น: ${config.key}=${config.default}`);
            }
            continue;
        }

        // ถ้ามีค่า ตรวจสอบความถูกต้อง
        if (config.validate && !config.validate(value)) {
            errors.push(`❌ ${config.key}: ${config.error}`);
        } else {
            validated[config.key] = value;
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        env: validated
    };
}

/**
 * ตรวจสอบและโหลด Environment
 * @throws {Error} ถ้าตรวจสอบไม่ผ่าน
 */
function loadAndValidateEnv() {
    const result = validateEnvironment();

    if (!result.valid) {
        console.error('========================================');
        console.error('🚨 การตรวจสอบ Environment Variables ล้มเหลว');
        console.error('========================================');
        result.errors.forEach(err => console.error(err));
        console.error('========================================');
        console.error('กรุณาตรวจสอบไฟล์ .env ของคุณ');
        console.error('========================================');
        throw new Error('Environment validation failed');
    }

    // ตั้งค่า NODE_ENV จริงๆ
    process.env.NODE_ENV = result.env.NODE_ENV;

    console.log('✅ Environment validation passed');
    return result.env;
}

/**
 * สร้างไฟล์ .env.example จาก config
 */
function generateEnvExample() {
    let example = `# ========================================
# mahanakorn-bot Environment Variables
# ========================================

# Bot Configuration (Required)
BOT_TOKEN=your_discord_bot_token_here

# Environment (Optional)
NODE_ENV=development
LOG_LEVEL=info
MAX_LOG_SIZE=5242880

`;

    console.log(example);
    return example;
}

module.exports = {
    validateEnvironment,
    loadAndValidateEnv,
    generateEnvExample,
    envConfig
};
