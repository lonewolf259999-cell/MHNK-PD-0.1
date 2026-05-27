# MHNK-PD-0.1

## โครงสร้าง

```
mahanakorn-bot-PD-0.2
├── index.js                      ← จุดเริ่มต้น รันบอท
├── .env                          ← BOT_TOKEN, CLIENT_ID, GUILD_ID
├── credentials.json              ← Google Service Account
├── configManager.js              ← โหลด .env
├── .gitignore                    ← ป้องกันไฟล์ leak
├── README.md                     ← ไฟล์นี้
│
├── handlers/
│   └── featureHandler.js         ← โหลด features ทั้งหมดอัตโนมัติ (หา <folder>/<folder>.js)
│
├── features/
│   ├── CountAuto/                ← นับแต้มอัตโนมัติจากแท็ก (@mention → Google Sheet)
│   │   ├── CountAuto.js         ← Event handlers + Queue (เรียก logic/)
│   │   └── logic/               ← โค้ดย่อยของ CountAuto
│   │       ├── messageLog.js    ← จัดการ messageLog.json (cleanup ทุก 2 ชม.)
│   │       ├── tagParser.js     ← สกัดแท็ก @mention จากข้อความ
│   │       └── sheetUpdater.js  ← อัปเดต Google Sheet
│   │
│   ├── CountCase/                ← นับยอดข้อความเก่า (เรียกจาก configPanel)
│   │   └── CountCase.js
│   │
│   ├── EditTAG/                  ← แก้ไขแท็กคนในข้อความ (+เพิ่ม, -ลบ)
│   │   └── EditTAG.js
│   │
│   ├── get-tags/                 ← ดึงแท็กจากข้อความ BYPD (รับจากบอท + คน)
│   │   ├── get-tags.js          ← Event Listener messageCreate
│   │   ├── processAndSend.js    ← Logic ประมวลผล BYPD + ส่ง Embed
│   │   ├── logCase.js           ← จัดการ ID + Sheet + IDMissedLog + Cache
│   │   ├── resendMissed.js      ← ส่งย้อนหลัง + ลงชีต batch
│   │   └── IDMissedLog.json     ← ไฟล์ชั่วคราว (บอทตาย/หลับ)
│   │
│   ├── logtime/                  ← บันทึกเวลาเข้าเวร → NamePD
│   │   └── logtime.js
│   │
│   ├── reload/                   ← คำสั่งรีโหลด config (!reload)
│   │   └── reload.js
│   │
│   ├── testchat/                 ← ทดสอบส่ง embed (พิม c)
│   │   └── testchat.js
│   │
│   └── welcome/                  ← ระบบต้อนรับ + ลงทะเบียน
│       ├── welcome.js
│       └── sheetManager.js      ← จัดการ Google Sheet ลงทะเบียน
│
├── config/
│   ├── configPanel.js            ← ตัวหลักแผงควบคุม (ลงทะเบียน /recount)
│   ├── panelBuilder.js           ← สร้าง Embed + ปุ่ม 7 ปุ่ม
│   ├── modals.js                 ← สร้าง Modal 4 แบบ
│   ├── actions.js                ← Logic บันทึกตั้งค่า + handleResendBypd
│   └── resendState.js            ← Shared state สถานะ resend (Map guildId → state)
│
├── utils/
│   ├── logger.js                 ← ระบบ log (winston) → logs/
│   ├── sheetConfig.js            ← อ่าน/เขียน config จาก Google Sheet (แท็บ config)
│   ├── interactionSafe.js        ← ดัก error ของ interaction
│   ├── envValidator.js           ← ตรวจสอบ .env (เผื่ออนาคต)
│   ├── rateLimiter.js            ← จำกัดการใช้งานซ้ำ
│   └── validation.js             ← ตรวจสอบข้อมูล input (เผื่ออนาคต)
│
└── data/                         ← ไฟล์ที่สร้างขึ้นระหว่างรัน
    └── .gitkeep                  ← บังคับให้ git track โฟลเดอร์

# logs/ — สร้างเองโดย logger.js (อยู่ใน .gitignore)
# ├── combined.log
# └── error.log
```

---

## 🔥 ระบบ get-tags (BYPD) — อัปเดตล่าสุด

### การทำงานปกติ (โหมด 1)
```
messageCreate → เจอ "BYPD" → processAndSend()
    → สกัด tag เจ้าหน้าที่
    → แยกข้อมูล (ผู้ต้องหา, คดี, จำคุก, ค่าปรับ, เวลา)
    → ส่ง Embed ไปห้องปลายทาง
    → React ✅ ในโพสต้นทาง
    → เก็บ ID ลง Sheet + ลบจาก IDMissedLog
```

### โหมดส่งย้อนหลัง (โหมด 2) — สำหรับบอทหลับ/ตาย
```
กดปุ่ม "🔄 ส่งย้อนหลัง BYPD"
    → โหลดแคชจาก Sheet + IDMissedLog.json
    → สแกนห้อง Log ย้อนหลัง (สูงสุด 500 ข้อความ)
    → กรองเฉพาะ BYPD ที่ยังไม่อยู่ในแคช
    → ส่งข้อความ (เก็บ ID ลง IDMissedLog แทน Sheet)
    → ส่งหมด → batch IDMissedLog ขึ้น Sheet → ล้าง IDMissedLog
    → ปุ่มเปลี่ยนเป็น "⏹️ หยุดส่งย้อนหลัง" (กดอีกครั้งเพื่อหยุด)
```

### ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|------|--------|
| `get-tags.js` | Event Listener `messageCreate` เช็คคำว่า BYPD |
| `processAndSend.js` | Logic ประมวลผล + ส่ง Embed (รองรับ `isResendMode`) |
| `logCase.js` | จัดการ ID (cache, Sheet, IDMissedLog.json) + React ✅ |
| `resendMissed.js` | ส่งย้อนหลัง + batch ลง Sheet + ล้าง IDMissedLog |
| `config/actions.js` | `handleResendBypd` — toggle ส่ง/หยุด |
| `config/resendState.js` | Shared state (`Map`) เก็บสถานะ resend ของแต่ละ guild |
| `config/panelBuilder.js` | สร้างปุ่ม "ส่งย้อนหลัง BYPD" (เปลี่ยน label ตามสถานะ) |
| `config/configPanel.js` | Handler ปุ่ม `btn_resend_bypd` |

### ฟีเจอร์เด่น
- ✅ **ปุ่ม toggle**: กดครั้งแรกเริ่มส่ง → กดอีกครั้งหยุด
- ✅ **AbortController**: หยุดกลางทางได้ (ระหว่างสแกน + ส่ง)
- ✅ **Dual logging**: โหมดปกติเก็บลง Sheet / โหมด resend เก็บลง IDMissedLog แล้ว batch ขึ้นทีหลัง
- ✅ **Circular dependency free**: ใช้ `resendState.js` เป็น shared state
- ✅ **Retry + lock**: ป้องกันส่งซ้ำ + retry อัตโนมัติ 3 ครั้ง

---

## หลักการ

1. `featureHandler` หาแค่ `<folder>/<folder>.js` ใน `features/` — ข้างในแยกกี่ไฟล์ก็ไม่สน
2. `config/` แยกจาก `features/` — เป็นเครื่องมือ ไม่ใช่ฟีเจอร์
3. `configPanel` ลงทะเบียนคำสั่ง `/recount` เอง — ใช้ `loadConfig(client)` ใน `index.js`
4. `utils/` เครื่องมือทุก feature ใช้ร่วมกัน
5. `data/` เก็บไฟล์ที่สร้างขึ้นระหว่างรัน (เช่น `messageLog.json`)
6. `logs/` เก็บ log จาก winston (สร้างเอง ไม่ต้องสร้าง)
7. `index.js` เรียก `loadFeatures(client)` + `loadConfig(client)` ก็พอ
8. เพิ่ม feature ใหม่ = สร้างโฟลเดอร์ + ไฟล์ชื่อเดียวกันใน `features/`
9. `config/resendState.js` เป็น shared state — **ห้ามสร้าง Map ใหม่** ในไฟล์อื่น (import มาใช้แทน)

## วิธีรัน

```bash
node index.js
```

## สรุป Feature ทั้งหมด

| Feature | ทำอะไร | ไฟล์หลัก |
|---------|--------|----------|
| CountAuto | นับแต้มอัตโนมัติจากแท็ก @mention → Google Sheet | `features/CountAuto/CountAuto.js` + `logic/` |
| CountCase | นับยอดข้อความเก่า (เรียกจาก /recount) | `features/CountCase/CountCase.js` |
| EditTAG | แก้ไขแท็กคนในข้อความ (+เพิ่ม, -ลบ) | `features/EditTAG/EditTAG.js` |
| get-tags | ดึงแท็กจากข้อความ BYPD → ส่ง Embed + ส่งย้อนหลัง | `features/get-tags/get-tags.js` + ไฟล์ใน `get-tags/` |
| logtime | บันทึกเวลาเข้าเวร → NamePD | `features/logtime/logtime.js` |
| reload | คำสั่งรีโหลด config (!reload) | `features/reload/reload.js` |
| testchat | ทดสอบส่ง embed (พิม c) | `features/testchat/testchat.js` |
| welcome | ต้อนรับสมาชิกใหม่ + ลงทะเบียน PD | `features/welcome/welcome.js` |

## สรุป Config Panel

| ไฟล์ | หน้าที่ |
|------|--------|
| `config/configPanel.js` | รับ interaction, ลงทะเบียน /recount, handler ปุ่มทั้งหมด |
| `config/panelBuilder.js` | สร้าง Embed + ปุ่ม 7 ปุ่ม (รวมปุ่มส่งย้อนหลัง BYPD) |
| `config/modals.js` | สร้าง Modal 4 แบบ (นับเคส, ต้อนรับ, BYPD, ชีต PD) |
| `config/actions.js` | Logic บันทึกตั้งค่าลง Sheet + `handleResendBypd` |
| `config/resendState.js` | Shared state (`Map`) เก็บสถานะ resend ของแต่ละ guild |

## สรุป CountAuto Logic

| ไฟล์ | หน้าที่ |
|------|--------|
| `CountAuto.js` | Event handlers (messageCreate/Delete/Update) + Queue |
| `logic/messageLog.js` | loadLog, saveLog, cleanup (ทุก 2 ชม.) |
| `logic/tagParser.js` | สกัดแท็ก @mention จากข้อความ |
| `logic/sheetUpdater.js` | อัปเดต Google Sheet |

## สรุป Utils

| ไฟล์ | หน้าที่ | ใครใช้ |
|------|--------|----------|
| `logger.js` | ระบบ log → logs/ | reload.js |
| `sheetConfig.js` | อ่าน/เขียน config จาก Sheet | หลาย feature |
| `interactionSafe.js` | ดัก error interaction | clear, configPanel, welcome, EditTAG |
| `envValidator.js` | ตรวจสอบ .env | เผื่ออนาคต |
| `rateLimiter.js` | จำกัดการใช้งานซ้ำ | reload.js |
| `validation.js` | ตรวจสอบ input | เผื่ออนาคต |

## หมายเหตุ

- `.gitignore` ป้องกัน `.env`, `credentials.json`, `node_modules/`, `logs/`, `data/`, `*.log`
- `CountAuto` ใช้ `data/messageLog.json` เก็บ log ข้อความ (cleanup ทุก 2 ชม.)
- `get-tags` รับข้อความจาก **บอท + คน** (ไม่กรอง bot)
- `registerCommands.js` **ถูกลบแล้ว** — configPanel ลงทะเบียนเอง
- `features/configPanel/` **ถูกลบแล้ว** — ย้ายไป `config/` แล้ว
- `tests/` **ถูกลบแล้ว** — ไม่จำเป็น
- `config/resendState.js` **ใหม่** — shared state สำหรับ resend BYPD (ห้ามสร้าง Map ใหม่)
- `features/get-tags/resendMissed.js` **ใหม่** — ส่งย้อนหลัง + batch ลง Sheet

## 🔄 สถานะโปรเจกต์

### เสร็จสมบูรณ์
- ✅ ระบบ get-tags (BYPD) ครบทุกฟีเจอร์
- ✅ ปุ่มส่งย้อนหลัง BYPD (toggle ส่ง/หยุด)
- ✅ ระบบ Config Panel ครบ 7 ปุ่ม
- ✅ ระบบลงทะเบียน + ต้อนรับ
- ✅ ระบบนับเคสอัตโนมัติ (CountAuto)
- ✅ ระบบนับยอดข้อความเก่า (CountCase)
- ✅ ระบบแก้ไขแท็ก (EditTAG)
- ✅ ระบบบันทึกเวลาเข้าเวร (logtime)
- ✅ ระบบ reload config (!reload)
- ✅ Keep-alive + Watchdog + Safe restart

### รอดำเนินการ
- ⏳ ไม่มี (ทุกอย่างเสร็จแล้ว!)
