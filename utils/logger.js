// =================================================================
// 📝 utils/logger.js - ระบบ Logging ที่เป็นระบบ
// =================================================================
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// สร้างโฟลเดอร์ logs ถ้ายังไม่มี
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// กำหนดระดับ Log และ Format
const logLevel = process.env.LOG_LEVEL || 'info';

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }
        if (stack) {
            log += `\n${stack}`;
        }
        return log;
    })
);

// สร้าง Logger instance
const logger = winston.createLogger({
    level: logLevel,
    format: logFormat,
    transports: [
        // Console - แสดงผลใน terminal
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        // File - เก็บ log ทุกระดับ
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // File - เก็บเฉพาะ error
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

module.exports = logger;
