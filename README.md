# MHNK-PD-0.1 Project Overview

โปรเจกต์ Discord Bot สำหรับเซิร์ฟเวอร์ Mahanakorn Police Department ที่เชื่อมต่อกับ Google Sheets เพื่อจัดการข้อมูลสมาชิก นับแต้ม บันทึกเวลาเข้าเวร และอื่นๆ

## ตารางเนื้อหา
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [ส่วนประกอบหลัก](#ส่วนประกอบหลัก)
- [ฟีเจอร์ทั้งหมด](#ฟีเจอร์ทั้งหมด)
- [ระบบจัดการ Config](#ระบบจัดการ-config)
- [ระบบป้องกัน (Safety Systems)](#ระบบป้องกัน-safety-systems)
- [การเชื่อมต่อ Google Sheets](#การเชื่อมต่อ-google-sheets)
- [วิธีการรัน](#วิธีการรัน)
- [โค้ดที่ซ้ำซ้อน/ไม่ได้ใช้งาน](#โค้ดที่ซ้ำซ้อนไม่ได้ใช้งาน)

---

## โครงสร้างโปรเจกต์

```
MHNK-PD-0.1/
├── index.js                    ← จุดเริ่มต้นหลักของบอท
├── configManager.js            ← จัดการ environment variables (.env)
├── testchat-standalone.js      ← รันเฉพาะฟีเจอร์ testchat (อาจไม่ได้ใช้)
├── package.json                ← รายการ dependencies
├── .gitignore                  ← ไฟล์ git ignore
│
├── config/                     ← ระบบแผงควบคุม (Control Panel)
│   ├── actions.js              ← ฟังก์ชัน xử lý ต่างๆ ของแผงควบคุม
│   ├── configPanel.js          ← Slash commands /recount, /editphone + event handlers
│   ├── modals.js               ← สร้าง Modal ต่างๆ สำหรับตั้งค่า
│   ├── panelBuilder.js         ← สร้าง Embed + ปุ่มของแผงควบคุม
│   └── resendState.js          ← Map เก็บสถานะการส่งย้อนหลัง
│
├── features/                   ← ฟีเจอร์ต่างๆ ของบอท
│   ├── clear/
│   │   └── clear.js            ← คำสั่ง /de สำหรับลบข้อความ
│   │
│   ├── CountAuto/
│   │   ├── CountAuto.js        ← Event handlers นับแต้มอัตโนมัติ
│   │   └── logic/
│   │       ├── messageLog.js   ← จัดการ messageLog.json
│   │       ├── tagParser.js    ← สกัด tag จากข้อความ
│   │       └── sheetUpdater.js ← อัปเดต Google Sheet
│   │
│   ├── CountCase/
│   │   └── CountCase.js        ← นับแต้มย้อนหลัง (เรียกจากแผงควบคุม)
│   │
│   ├── EditTAG/
│   │   └── EditTAG.js          ← คำสั่ง /edittag แก้ไขแท็กคน
│   │
│   ├── get-tags/
│   │   ├── resendMissed.js     ← ส่งย้อนหลัง BYPD + Proctor
│   │   └── processAndSend.js   ← Logic ประมวลผลและส่ง Embed BYPD
│   │
│   ├── logtime/
│   │   └── logtime.js          ← บันทึกเวลาเข้าเวร
│   │
│   ├── proctor/
│   │   └── proctor.js          ← ส่งต่อ Proctor Embed
│   │
│   ├── reload/
│   │   └── reload.js           ← คำสั่ง /reload รีโหลด config
│   │
│   ├── testchat/
│   │   └── testchat.js         ← ทดสอบ embed (พิมพ์ "c" เพื่อทดสอบ)
│   │
│   └── thirtyday/
│       └── thirtyday.js        ← คำสั่ง /30day จัดการสมาชิกครบ 30 วัน
│
├── handlers/
│   └── featureHandler.js       ← โหลดฟีเจอร์อัตโนมัติจากโฟลเดอร์ features/
│
├── utils/                      ← ฟังก์ชันช่วยเหลือ
│   ├── apiSafe.js              ← Google Sheets API พร้อม retry + rate limit
│   ├── discordSafe.js          ← Discord API พร้อม rate limit protection
│   ├── interactionSafe.js      ← Error handling สำหรับ interactions
│   ├── logger.js               ← Winston logger
│   ├── rateLimiter.js          ← Rate limiter สำหรับคำสั่ง
│   └── sheetConfig.js          ← จัดการ config จาก Google Sheet
│
└── data/
    └── .gitkeep               ← โฟลเดอร์เก็บไฟล์ runtime (messageLog.json)
```

---

## ส่วนประกอบหลัก

### index.js
จุดเริ่มต้นหลักของ Discord bot ที่ทำงาน:
- **Safe Auto Restart + Anti Ban System:** รีสตาร์ทอัตโนมัติสูงสุด 8 ครั้ง/วัน เมื่อเกิดข้อผิดพลาด
- **Heartbeat + Watchdog (Anti Freeze):** ตรวจสอบการทำงานทุก 1 นาที หากเงียบ 15 นาทีจะรีสตาร์ท
- **HTTP Keep-Alive Server:** ให้บริการที่ port 3000 สำหรับ health checks (`/health`, `/health/apis`)
- **Self-Ping:** ป้องกันบอทหยุดทำงานบน platforms เช่น Render
- **Error Handling:** จับ unhandled rejections และ uncaught exceptions
- **Discord Client Initialization:** ตั้งค่า intents และ partials ที่จำเป็น
- **Feature Loading:** โหลดฟีเจอร์ผ่าน `featureHandler.js`

### configManager.js
จัดการ environment variables:
- โหลดค่าจากไฟล์ `.env` ด้วย `dotenv`
- ตรวจสอบ `BOT_TOKEN` และออกถ้าไม่มี
- ส่งออก `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`

---

## ฟีเจอร์ทั้งหมด

### 1. clear (ลบข้อความ)
**ไฟล์:** `features/clear/clear.js`
- คำสั่ง `/de <amount>` สำหรับลบข้อความ (สูงสุด 500)
- แบ่งเป็น batch ละ 100 ข้อความ เพื่อป้องกัน rate limit
- ต้องการสิทธิ์ `ManageMessages`

### 2. CountAuto (นับแต้มอัตโนมัติ)
**ไฟล์:** `features/CountAuto/CountAuto.js` + `logic/`
- นับแต้มอัตโนมัติเมื่อมีการแท็กใน 5 ห้องที่กำหนด
- ใช้ parallel queue (สูงสุด 3 ข้อความพร้อมกัน)
- รองรับ message create, delete, update
- เก็บ log ไว้ใน `data/messageLog.json`

### 3. CountCase (นับแต้มย้อนหลัง)
**ไฟล์:** `features/CountCase/CountCase.js`
- นับแต้มย้อนหลังทุกข้อความใน 5 ห้อง
- เรียกจากปุ่ม "เริ่มนับข้อความเก่า" ในแผงควบคุม
- แสดงสถานะความคืบหน้าแบบ real-time

### 4. EditTAG (แก้ไขแท็ก)
**ไฟล์:** `features/EditTAG/EditTAG.js`
- คำสั่ง `/edittag` สำหรับแก้ไขแท็กคนในข้อความ
- เช็คสิทธิ์จาก `EDIT_TAG_MODE` ใน Google Sheet
- รองรับเพิ่ม/ลบแท็กผ่าน Modal

### 5. get-tags (ส่งย้อนหลัง BYPD + Proctor)
**ไฟล์:** `features/get-tags/resendMissed.js`, `processAndSend.js`
- สแกนย้อนหลังข้อความใน LogCase channel
- ส่ง BYPD และ Proctor ที่ยังไม่มี reaction ✅
- แสดงสถานะความคืบหน้าแบบ real-time
- รองรับการหยุด (abort signal)

### 6. logtime (บันทึกเวลาเข้าเวร)
**ไฟล์:** `features/logtime/logtime.js`
- รับ webhook จากระบบเข้าเวร
- อ่านชีต D:U ทั้งก้อน → process ใน RAM → batch update
- คอลัมน์ O-U สำหรับสะสมเวลาตามวัน
- ใช้ queue ป้องกัน race condition

### 7. proctor (ส่งต่อ Proctor)
**ไฟล์:** `features/proctor/proctor.js`
- ฟัง webhook ใน LogCase channel
- ส่งต่อ Proctor Embed ไปยัง PROCTOR_CHANNEL
- ติ๊ก reaction ✅ หลังส่งสำเร็จ

### 8. reload (รีโหลด config)
**ไฟล์:** `features/reload/reload.js`
- คำสั่ง `/reload` สำหรับรีโหลด config จาก Google Sheet
- แสดงสถานะ config ที่โหลดสำเร็จ/ไม่สำเร็จ

### 9. testchat (ทดสอบ)
**ไฟล์:** `features/testchat/testchat.js`
- พิมพ์ "c" ในแชทเพื่อสร้าง embed ทดสอบ
- ใช้สำหรับทดสอบการทำงานของบอท

### 10. thirtyday (จัดการสมาชิก 30 วัน)
**ไฟล์:** `features/thirtyday/thirtyday.js`
- คำสั่ง `/30day` สำหรับตรวจสอบสมาชิกครบ 30 วัน
- ย้ายข้อมูลไป OutDC และเปลี่ยนบทบาท
- ต้องการสิทธิ์ Administrator

### 11. welcome (ต้อนรับและลงทะเบียน)
**ไฟล์:** `features/welcome/welcome.js`, `sheetManager.js`
- ส่งข้อความต้อนรับเมื่อมีสมาชิกใหม่เข้า
- ระบบลงทะเบียนผ่าน Modal (ชื่อ IC, เบอร์โทร, อายุ)
- เปลี่ยนชื่อ Discord ให้ตรงกับระบบ
- ย้ายข้อมูลไป OutDC เมื่อสมาชิกออก

---

## ระบบจัดการ Config

### configPanel.js
ระบบแผงควบคุมหลัก:
- Slash command `/recount` - เปิดแผงควบคุม (เฉพาะ Admin)
- Slash command `/editphone` - แก้ไขเบอร์โทร (ทุกคนใช้ได้)
- ปุ่ม 7 ปุ่มในแผงควบคุม:
  1. เริ่มนับข้อความเก่า
  2. ตั้งค่า - นับเคส
  3. ตั้งค่า - ต้อนรับ
  4. ตั้งค่า - ระบบคดี
  5. ตั้งค่า - ชีต PD
  6. รีเฟรช config
  7. ส่งย้อนหลัง BYPD

### modals.js
สร้าง Modal สำหรับตั้งค่า:
- `buildCountModal()` - ตั้งค่า SPREADSHEET_ID, SHEET_NAME, ห้องนับเคส
- `buildWelcomeModal()` - ตั้งค่าห้องต้อนรับ, ห้อง log, ห้อง logtime
- `buildBypdModal()` - ตั้งค่า LogCase, BYPD ส่งไปที่, Proctor ส่งไปที่
- `buildRegistryModal()` - ตั้งค่าชีต PD (NamePD, OutDC)

### actions.js
ฟังก์ชัน xử lý หลัก:
- `handleRefreshConfig()` - รีเฟรช config จาก Google Sheet
- `handleManualCount()` - เริ่มนับข้อความเก่า
- `handleCountSave()` - บันทึกการตั้งค่านับเคส
- `handleWelcomeSave()` - บันทึกการตั้งค่าต้อนรับ
- `handleBypdSave()` - บันทึกการตั้งค่า BYPD + Proctor
- `handleRegistrySave()` - บันทึกการตั้งค่าชีต PD
- `handleResendBypd()` - ส่งย้อนหลัง BYPD + Proctor

### panelBuilder.js
สร้าง Embed และปุ่มของแผงควบคุม:
- แสดงข้อมูล config ปัจจุบัน
- ปุ่มส่งย้อนหลังเปลี่ยนเป็นปุ่มหยุดเมื่อกำลังทำงาน

---

## ระบบป้องกัน (Safety Systems)

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

---

## การเชื่อมต่อ Google Sheets

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

---

## วิธีการรัน

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

---

## โค้ดที่ซ้ำซ้อน/ไม่ได้ใช้งาน

### 1. testchat-standalone.js
**สถานะ:** อาจไม่ได้ใช้งาน
- ไฟล์นี้ใช้สำหรับรันเฉพาะฟีเจอร์ testchat
- มีฟีเจอร์ testchat อยู่แล้วใน `features/testchat/testchat.js`
- แนะนำให้ลบหรือย้ายไปที่ `/scripts/testchat-standalone.js` ถ้ายังใช้

### 2. google-spreadsheet (ใน package.json)
**สถานะ:** ไม่ได้ใช้งาน
- มีการติดตั้งแต่ไม่มีการ import ในโค้ด
- โค้ดใช้ `googleapis` แทน
- แนะนำให้ลบออกจาก dependencies

### 3. google-auth-library (ใน package.json)
**สถานะ:** ไม่ได้ใช้งานโดยตรง
- มีการติดตั้งแต่ไม่มีการ import ในโค้ด
- `googleapis` จัดการการ authenticate อยู่แล้ว
- แนะนำให้ลบออกจาก dependencies

### 4. โค้ดซ้ำซ้อนใน welcome.js
**สถานะ:** มีโค้ดซ้ำซ้อน
- ฟังก์ชัน `moveMemberToOutSheet` ถูกเรียกจาก `guildMemberRemove`
- แต่ยังมีการ import และเรียกใช้ใน `guildMemberRemove` ที่อาจทำงานซ้ำ
- ควรตรวจสอบว่า `moveMemberToOutSheet` ทำงานถูกต้องหรือไม่

### 5. ฟังก์ชัน `load()` ใน CountCase.js
**สถานะ:** ไม่ได้ใช้งาน
- มีการส่งออกฟังก์ชัน `load()` แต่ไม่มีการเรียกใช้
- ควรลบออกหรือใช้งานจริง

---

## สรุปความสัมพันธ์ระหว่างไฟล์

```
index.js
    ├── configManager.js (BOT_TOKEN)
    ├── utils/sheetConfig.js (โหลด config จาก Google Sheet)
    ├── handlers/featureHandler.js (โหลดฟีเจอร์)
    │       └── features/*/โฟลเดอร์.js (ทุกฟีเจอร์)
    └── config/configPanel.js (แผงควบคุม)
            ├── config/modals.js
            ├── config/panelBuilder.js
            ├── config/actions.js
            └── config/resendState.js
```

---

## คำสั่งที่ใช้ได้

| คำสั่ง | คำอธิบาย | สิทธิ์ |
|--------|----------|-------|
| `/recount` | เปิดแผงควบคุม | Admin |
| `/editphone` | แก้ไขเบอร์โทร | ทุกคน |
| `/de <amount>` | ลบข้อความ | ManageMessages |
| `/edittag` | แก้ไขแท็กคน | ดู config `EDIT_TAG_MODE` |
| `/reload` | รีโหลด config | Admin |
| `/30day` | จัดการสมาชิก 30 วัน | Admin |
| `c` | ทดสอบ embed (ในแชท) | ทุกคน |
