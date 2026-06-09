# MHNK-PD-0.1 Project Overview

This document provides a detailed overview of the MHNK-PD-0.1 project structure, its components, and how they interact. The goal is to facilitate understanding, maintenance, and future development by clearly outlining each part of the codebase.

## Table of Contents
- [Project Structure](#project-structure)
- [Core Components](#core-components)
  - [index.js](#indexjs)
  - [configManager.js](#configmanagerjs)
- [Features](#features)
- [Configuration](#configuration)
- [Handlers](#handlers)
- [Utilities](#utilities)
- [Code Redundancy and Unused Code](#code-redundancy-and-unused-code)

## Project Structure

```
.gitignore
configManager.js
index.js
README.md
testchat-standalone.js
config/
├── actions.js
├── configPanel.js
├── modals.js
├── panelBuilder.js
└── resendState.js
data/
├── .gitkeep
features/
├── clear/
├── CountAuto/
├── CountCase/
├── EditTAG/
├── get-tags/
│   └── resendMissed.js
├── logtime/
├── proctor/
├── reload/
├── testchat/
├── thirtyday/
└── welcome/
handlers/
└── featureHandler.js
utils/
├── apiSafe.js
├── discordSafe.js
├── interactionSafe.js
├── logger.js
├── rateLimiter.js
└── sheetConfig.js
```

## Core Components

### index.js

This is the main entry point of the Discord bot application. It handles:
- **Safe Auto Restart + Anti Ban System:** Implements a mechanism to safely restart the bot up to 8 times a day in case of crashes, with a 15-second delay to prevent rapid reboots.
- **Heartbeat + Watchdog (Anti Freeze):** Monitors the bot's activity, restarting it if no heartbeat is detected for 15 minutes to prevent freezing.
- **HTTP Keep-Alive Server:** Runs a simple HTTP server (on port 3000 by default) for health checks (`/health`, `/health/apis`) and to keep the bot alive on hosting platforms.
- **Self-Ping:** Periodically pings the bot's own URL to prevent it from going idle.
- **Error Handling:** Catches unhandled rejections and uncaught exceptions to improve bot stability.
- **Discord Client Initialization:** Sets up the Discord.js client with necessary intents and partials.
- **Feature and Configuration Loading:** Dynamically loads features via `featureHandler.js` and configurations via `configPanel.js`.
- **Google Sheet Configuration Loading:** Attempts to load configuration from Google Sheets using `sheetConfig.loadSheetConfig()`.
- **Bot Login:** Logs the bot into Discord using the `BOT_TOKEN`.

### configManager.js

This file is responsible for managing environment variables. It:
- Loads environment variables from a `.env` file using `dotenv`.
- Checks for the presence of `BOT_TOKEN` and exits if it's missing.
- Exports `BOT_TOKEN`, `CLIENT_ID`, and `GUILD_ID` for use throughout the application.
│   ├── sheetConfig.js        ← Config จาก Google Sheet
│   ├── interactionSafe.js    ← Error handling interactions
│   ├── logger.js             ← Winston logger
│   └── rateLimiter.js        ← Rate limiter สำหรับคำสั่ง
│
└── data/                     ← ไฟล์ runtime (messageLog.json)
```

## ⚡ Performance Optimizations

### logtime (10x เร็วขึ้น)
- **ก่อน:** 3-5 API calls ต่อคน (อ่านทีละแถว + เขียนทีละอัน) → 100 คน = 1-2 นาที
- **หลัง:** อ่านชีตทั้งก้อน (1 call) → process ใน RAM → batch flush (1 call) → 100 คน = 3-5 วิ
- **ข้อมูลไม่ตกหล่น:** retry + queue mechanism

### CountAuto (3-5x เร็วขึ้น)
- **ก่อน:** Sequential queue (ทีละข้อความเรียงกัน)
- **หลัง:** Parallel queue (สูงสุด 3 ข้อความพร้อมกัน)
- **ยัง Real-time:** แต่ละข้อความเขียน Sheet ทันทีที่ process

## 🔌 Google Sheet Config

บอทอ่านค่าต่างๆ จาก Google Sheet ID `1YV_BIFiilxUM9XrW1cSYZTOgne1JnKoCXtRw7PUCCGs` แท็บ `config`

### Keys ที่ใช้

| Key | ใช้โดย | คำอธิบาย |
|-----|--------|---------|
| `LOGCASE_CHANNEL_ID` | BYPD + Proctor | ห้องรับ webhook ทั้ง BYPD และ Proctor |
| `BYPD_SEND_CHANNEL_ID` | BYPD | ส่ง Embed BYPD ไปที่ |
| `PROCTOR_CHANNEL_ID` | Proctor | ส่ง Embed Proctor ไปที่ |
| `WELCOME_CHANNEL_ID` | welcome | ห้องต้อนรับ |
| `LOG_CHANNEL_ID` | welcome | ห้อง log ลงทะเบียน |
| `LOGTIME_CHANNEL_ID` | logtime | ห้องรับรายงานเข้าเวร |
| `SPREADSHEET_ID` | CountAuto | ชีตสำหรับนับแต้ม |
| `SHEET_NAME` | CountAuto | ชื่อแท็บในชีตนับแต้ม |
| `CHANNEL_ID_1` ~ `5` | CountAuto | 5 ห้องสำหรับนับแต้ม |
| `REGISTRY_SPREADSHEET_ID` | logtime, 30Day | ชีตทะเบียน PD |
| `REGISTRY_SHEET_NAME` | logtime, 30Day | ชื่อแท็บ NamePD |
| `REGISTRY_OUT_SHEET_NAME` | 30Day | ชื่อแท็บ OutDC |
| `EDIT_TAG_MODE` | EditTAG | `All` = ทุกคนใช้ได้, หรือ `ID,ID` = เฉพาะ |

## 🛡️ ระบบป้องกัน (Safety Systems)

### Auto Restart + Anti Ban
- จำกัด restart ไม่เกิน 8 ครั้ง/วัน
- Watchdog เช็ค heartbeat ทุก 1 นาที (ถ้าเงียบ 15 นาที → restart)

### Google Sheets API Protection
- Rate limit: 90 requests / 100 seconds
- Retry 5 ครั้ง + Exponential backoff
- Auth refresh อัตโนมัติ

### Discord API Protection
- Global cooldown 100ms
- Per-route rate limit tracking
- Safe functions: safeSendMessage, safeReact, safeFetchMessages

### Data Safety
- messageLog.json (CountAuto) — cleanup ทุก 2 ชม.
- logtime queue — limit 100 + retry 1 ครั้ง

## 🚀 วิธีรัน

```bash
# ติดตั้ง dependencies
npm install

# ตั้งค่า .env
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id

# วาง credentials.json (Google Service Account)

# รันบอท
node index.js
```

## 🧪 Test Checklist

- [ ] Console เริ่มต้น: `[KEEP-ALIVE]` + `✅ [CONFIG]` + `🟢 [SYSTEM]` = 3-4 บรรทัด
- [ ] `/reload` — รีโหลด config (Admin)
- [ ] Proctor: ส่ง webhook embed ไป LogCase → ไป PROCTOR_CHANNEL + ✅
- [ ] BYPD: พิมพ์ `c` → embed ไป BYPD_SEND_CHANNEL + ✅
- [ ] ส่งย้อนหลัง: กดปุ่ม → สแกน + ส่ง BYPD + Proctor ที่ค้าง
- [ ] `/edittag` — ตามสิทธิ์ EDIT_TAG_MODE ใน Sheet
- [ ] Logtime: ส่งรายงานเข้าเวร → บันทึก Sheet
- [ ] `/30day` — ตรวจสอบสมาชิกครบ 30 วัน
- [ ] `/de 10` — ลบ 10 ข้อความ