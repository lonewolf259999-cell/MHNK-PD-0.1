# mahanakorn-bot-PD-0.2

## โครงสร้าง

# mahanakorn-bot-PD-0.2

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
│   ├── configPanel/              ← ❌ ย้ายไป config/ แล้ว (ไม่มีแล้ว)
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
│   │   └── get-tags.js
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
│   ├── panelBuilder.js           ← สร้าง Embed + ปุ่ม 6 ปุ่ม
│   ├── modals.js                 ← สร้าง Modal ตั้งค่า
│   └── actions.js                ← Logic บันทึกตั้งค่าลง Sheet
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

## หลักการ

1. `featureHandler` หาแค่ `<folder>/<folder>.js` ใน `features/` — ข้างในแยกกี่ไฟล์ก็ไม่สน
2. `config/` แยกจาก `features/` — เป็นเครื่องมือ ไม่ใช่ฟีเจอร์
3. `configPanel` ลงทะเบียนคำสั่ง `/recount` เอง — ใช้ `loadConfig(client)` ใน `index.js`
4. `utils/` เครื่องมือทุก feature ใช้ร่วมกัน
5. `data/` เก็บไฟล์ที่สร้างขึ้นระหว่างรัน (เช่น `messageLog.json`)
6. `logs/` เก็บ log จาก winston (สร้างเอง ไม่ต้องสร้าง)
7. `index.js` เรียก `loadFeatures(client)` + `loadConfig(client)` ก็พอ
8. เพิ่ม feature ใหม่ = สร้างโฟลเดอร์ + ไฟล์ชื่อเดียวกันใน `features/`

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
| get-tags | ดึงแท็กจากข้อความ BYPD → ส่ง Embed | `features/get-tags/get-tags.js` |
| logtime | บันทึกเวลาเข้าเวร → NamePD | `features/logtime/logtime.js` |
| reload | คำสั่งรีโหลด config (!reload) | `features/reload/reload.js` |
| testchat | ทดสอบส่ง embed (พิม c) | `features/testchat/testchat.js` |
| welcome | ต้อนรับสมาชิกใหม่ + ลงทะเบียน PD | `features/welcome/welcome.js` |

## สรุป Config Panel

| ไฟล์ | หน้าที่ |
|------|--------|
| `config/configPanel.js` | รับ interaction, ลงทะเบียน /recount |
| `config/panelBuilder.js` | สร้าง Embed + ปุ่ม 6 ปุ่ม |
| `config/modals.js` | สร้าง Modal 4 แบบ |
| `config/actions.js` | Logic บันทึกตั้งค่าลง Sheet |

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