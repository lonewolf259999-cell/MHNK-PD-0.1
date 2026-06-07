# 🚔 MHNK-PD-0.1 — Mahanakorn Police Department Discord Bot

Discord Bot สำหรับ **Mahanakorn Police Department (MHNK)** — ระบบจัดการคดี, แต้ม, เวร, ทะเบียนตำรวจ และอื่นๆ

## 📋 คุณสมบัติ (Features)

### 🎯 ระบบคดี (Case System) — BYPD + Proctor

| ระบบ | คำอธิบาย |
|------|---------|
| **BYPD Auto Forward** | ตรวจจับข้อความ BYPD ใน LogCase channel → สกัด tag (00, 01, ...) → ส่ง Embed ไป BYPD_SEND_CHANNEL + ✅ |
| **Proctor Forward** | ตรวจจับ Webhook embed "📋 บันทึกการคุมสอบ Proctor" ใน LogCase channel → Forward ไป PROCTOR_CHANNEL_ID + ✅ |
| **ส่งย้อนหลัง (Resend)** | สแกน LogCase channel ย้อนหลังสูงสุด 500 ข้อความ → กรอง BYPD + Proctor ที่ยังไม่มี ✅ → ส่งใหม่เรียงเก่าไปใหม่ + Abortable |

### 📊 ระบบนับแต้ม (Count System) — Real-time

| ระบบ | คำอธิบาย |
|------|---------|
| **CountAuto (Real-time)** | ตรวจจับ @mention ใน 5 ห้อง → +1 แต้มใน Google Sheet ทันที |
| **CountCase (ย้อนหลัง)** | สแกนข้อความเก่าใน 5 ห้อง → จับ tag → บันทึกย้อนหลังลง Sheet (Preview + Progress) |

### 🚪 ระบบสมาชิก (Member System)

| ระบบ | คำอธิบาย |
|------|---------|
| **Welcome + Register** | embed ต้อนรับเมื่อเข้าเซิร์ฟ → ปุ่มลงทะเบียน → Modal กรอกข้อมูล → บันทึกชีต + เปลี่ยนชื่อ |
| **Logtime** | ส่งรายงานเข้าเวร → แกะข้อมูล (regex) → queue → batch บันทึกลง NamePD (O-U สะสมเวลา) |
| **30 Day Check** | `/30day` — สแกน NamePD → ย้ายคนที่ครบ 30 วันไป OutDC + ลบบทบาท + เปลี่ยนชื่อ |

### ⚙️ ระบบจัดการ (Management Tools)

| ระบบ | คำอธิบาย |
|------|---------|
| **Config Panel** | `/recount` — แผงควบคุม 6 ปุ่ม (ตั้งค่าห้อง, นับย้อนหลัง, รีเฟรช, ส่งย้อนหลัง) |
| **EditTAG** | `/edittag` — แก้ไขแท็กคนในข้อความ (+เพิ่ม, -ลบ) — สิทธิ์อ่านจาก Sheet |
| **Clear Messages** | `/de จำนวน` — ลบข้อความ (batch 100 + random delay, สูงสุด 500) |
| **Reload Config** | `/reload` — รีโหลด config จาก Google Sheet (Admin only) |

## 🏗️ โครงสร้างโปรเจกต์

```
MHNK-PD-0.1/
├── index.js                  ← Entry point (restart, watchdog, HTTP server, self-ping)
├── configManager.js          ← โหลด .env (BOT_TOKEN, CLIENT_ID, GUILD_ID)
├── credentials.json          ← Google Service Account
├── .env                      ← BOT_TOKEN, CLIENT_ID, GUILD_ID
├── .gitignore
├── README.md
│
├── handlers/
│   └── featureHandler.js     ← Auto-load features/ (หา <folder>/<folder>.js)
│
├── features/
│   ├── clear/                ← /de (ลบข้อความ batch + delay)
│   ├── CountAuto/            ← นับแต้ม real-time (messageCreate/Delete/Update)
│   │   └── logic/            ← messageLog, tagParser, sheetUpdater
│   ├── CountCase/            ← นับย้อนหลัง (preview + progress)
│   ├── EditTAG/              ← /edittag (แก้แท็กคน)
│   ├── get-tags/             ← BYPD forward + resendMissed (ส่งย้อนหลัง)
│   ├── logtime/              ← บันทึกเวลาเข้าเวร (optimized: cache + batch)
│   ├── proctor/              ← Proctor forward (webhook → PROCTOR_CHANNEL)
│   ├── reload/               ← /reload (Slash Command)
│   ├── testchat/             ← ทดสอบ BYPD (พิมพ์ c)
│   ├── thirtyday/            ← /30day (ครบ 30 วัน)
│   └── welcome/              ← ลงทะเบียน + ต้อนรับ
│
├── config/
│   ├── configPanel.js        ← /recount handler
│   ├── panelBuilder.js       ← สร้าง Embed + ปุ่ม
│   ├── modals.js             ← Modal ตั้งค่า
│   ├── actions.js            ← Logic บันทึก
│   └── resendState.js        ← Shared state สำหรับ resend
│
├── utils/
│   ├── apiSafe.js            ← Google Sheets API (retry + rate limit)
│   ├── discordSafe.js        ← Discord API (rate limit + safe functions)
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