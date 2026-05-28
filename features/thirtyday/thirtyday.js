// =================================================================
// ⏳ features/thirtyday/thirtyday.js — ตรวจสอบครบ 30 วัน → ย้ายออก + ลบบทบาท
// =================================================================

const { SlashCommandBuilder, Events, MessageFlags } = require('discord.js');
const sheetConfig = require('../../utils/sheetConfig');
const { safeGetValues, safeUpdateValues, safeClearValues, safeBatchUpdate } = require('../../utils/apiSafe');
const { handleInteractionError } = require('../../utils/interactionSafe');

// =====================================================
// ⚙️ ตั้งค่า在这里 — แก้ได้เลย
// =====================================================
const CONFIG = {
    // Role ID ของ "30 day" — ใส่ให้คนที่ครบ 30 วัน
    THIRTY_DAY_ROLE_ID: '1509659434681635096',

    // บทบาทที่ครบ 30 วันแล้วต้องจัดการ (ถ้ามีบทบาทนี้ → ดำเนินการ)
    TRIGGER_ROLES: [
        '1507114435033038929',
        '1507569367792091137'
    ],

    // บทบาทที่ไม่ต้องลบ ไม่ต้องย้ายออก ไม่จัดการใดๆ
    EXEMPT_ROLES: [
        '1507105753461424198',
        '1507570062649983027',
        '1507107833890738347'
    ],

    // จำนวนวันที่ถึงแล้วจัดการ
    DAY_THRESHOLD: 30,

    // คอลัมน์ที่เช็คจำนวนวันใน NamePD
    DAY_COLUMN: 'L',

    // คอลัมน์ที่ลงเหตุผลใน OutDC
    REASON_COLUMN: 'N'
};
// =====================================================

// ✅ แปลงคอลัมน์ letter เป็น index (A=0, B=1, ...)
function colToIndex(col) {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
        index = index * 26 + (col.charCodeAt(i) - 64);
    }
    return index - 1;
}

// ✅ ดึง Discord ID จากคอลัมน์ E
function extractUserIdFromCell(cell) {
    if (!cell) return null;
    const match = String(cell).match(/\d{17,19}/);
    return match ? match[0] : null;
}

// ✅ ตรวจสอบว่าสมาชิกมีบทบาท EXEMPT หรือไม่
function hasExemptRole(member) {
    return CONFIG.EXEMPT_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// ✅ ตรวจสอบว่าสมาชิกมี TRIGGER_ROLES หรือไม่
function hasTriggerRole(member) {
    return CONFIG.TRIGGER_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// ✅ ลบ prefix จากชื่อ (เช่น "01 [MHNK-PD] Darin Giotto" → "Darin Giotto")
function stripPrefix(name) {
    if (!name) return name;
    return String(name).replace(/^\d+\s*\[MHNK-PD\]\s*/i, '').trim();
}

// ✅ ย้ายข้อมูลจาก NamePD → OutDC (อ่าน B:M เขียน B:M เหมือน sheetManager.js)
async function moveToOutDC(guild, spreadsheetId, sheetName, outSheetName, rowData, reason) {
    // 1. ดึงข้อมูล OutDC ปัจจุบัน
    const responseOut = await safeGetValues(spreadsheetId, `${outSheetName}!B:B`, {
        operation: 'thirtyday-move-getOut'
    });
    const rowsOut = responseOut.data.values || [];
    let nextRowIndex = rowsOut.length + 1;
    if (nextRowIndex < 3) nextRowIndex = 3;

    // 2. เตรียมข้อมูล (คอลัมน์ B:M = 12 คอลัมน์)
    // rowData มาจาก A:M → map เป็น B:M (skip index 0 = column A)
    const memberDataArray = new Array(12).fill('');
    for (let colIdx = 0; colIdx < 12; colIdx++) {
        const srcIdx = colIdx + 1; // skip column A, เริ่มจาก B
        if (rowData[srcIdx] !== undefined) {
            memberDataArray[colIdx] = String(rowData[srcIdx]).trim();
        }
    }

    // 3. เขียนข้อมูลลง OutDC (เก็บชื่อเต็มไว้ในชีตเหมือนเดิม)
    await safeUpdateValues(spreadsheetId, `${outSheetName}!B${nextRowIndex}:M${nextRowIndex}`, [memberDataArray], {
        operation: 'thirtyday-move-writeOut'
    });

    // 5. ลงเหตุผลในคอลัมน์ N
    await safeUpdateValues(spreadsheetId, `${outSheetName}!${CONFIG.REASON_COLUMN}${nextRowIndex}`, [[reason]], {
        operation: 'thirtyday-move-reason'
    });

    console.log(`📌 [30Day] ย้ายข้อมูลไป OutDC แถวที่ ${nextRowIndex} (เหตุผล: ${reason})`);
}

// ✅ ลบข้อมูลจาก NamePD
async function clearNamePDRow(spreadsheetId, sheetName, rowIndex) {
    const columnsToClear = ['B', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U'];
    const requests = columnsToClear.map(col => ({
        updateCells: {
            range: {
                sheetId: null,
                startRowIndex: rowIndex - 1,
                endRowIndex: rowIndex,
                startColumnIndex: colToIndex(col),
                endColumnIndex: colToIndex(col) + 1
            },
            fields: 'userEnteredValue'
        }
    }));

    try {
        await safeBatchUpdate(spreadsheetId, requests, {
            operation: 'thirtyday-clear-batchUpdate'
        });
    } catch (batchErr) {
        // fallback: ใช้ safeClearValues ทีละคอลัมน์
        for (const col of columnsToClear) {
            await safeClearValues(spreadsheetId, `${sheetName}!${col}${rowIndex}`, {
                operation: 'thirtyday-clear-fallback'
            }).catch(() => {});
        }
    }
}

// ✅ ลบบทบาททั้งหมดExcept @everyone + EXEMPT_ROLES
async function removeAllRolesExcept(member) {
    const rolesToRemove = member.roles.cache.filter(role =>
        role.id !== member.guild.id && // ไม่ลบ @everyone
        !CONFIG.EXEMPT_ROLES.includes(role.id) && // ไม่ลบ EXEMPT_ROLES
        role.id !== CONFIG.THIRTY_DAY_ROLE_ID // ไม่ลบ 30 day (เดี๋ยวใส่ใหม่)
    );

    if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove).catch(err => {
            console.error(`❌ [30Day] ลบบทบาทไม่สำเร็จ ${member.user.tag}:`, err.message);
        });
    }
}

// ✅ ฟังก์ชันหลัก: ตรวจสอบและจัดการครบ 30 วัน
async function checkAndProcess(client, interaction) {
    const { spreadsheetId, sheetName, outSheetName } = sheetConfig.getRegistryConfig();

    if (!spreadsheetId || !sheetName) {
        return { success: false, message: '❌ ยังไม่ได้ตั้งค่า REGISTRY_SPREADSHEET_ID หรือ REGISTRY_SHEET_NAME' };
    }

    // 1. ดึงข้อมูล NamePD (A:M เพื่อดึงข้อมูลครบถ้วน)
    const response = await safeGetValues(spreadsheetId, `${sheetName}!A:M`, {
        operation: 'thirtyday-check-getData'
    });
    const rows = response.data.values || [];

    // 2. หาคอลัมน์ L index
    const dayColIdx = colToIndex(CONFIG.DAY_COLUMN);

    const processed = [];
    const skipped = [];
    const notFound = [];

    // 3. วนลูปจากแถว 3 ลงไป
    for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;

        // เช็คคอลัมน์ L (จำนวนวัน)
        const dayValue = parseInt(row[dayColIdx]) || 0;
        if (dayValue <= CONFIG.DAY_THRESHOLD || !row[dayColIdx]) continue;

        // ดึง Discord ID จากคอลัมน์ E
        const userId = extractUserIdFromCell(row[4]); // E = index 4
        if (!userId) {
            skipped.push({ row: i + 1, reason: 'ไม่พบ Discord ID' });
            continue;
        }

        // ดึงสมาชิกจาก Discord
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) {
            notFound.push({ row: i + 1, userId, reason: 'ไม่พบสมาชิกใน Discord' });
            // ยังคงย้ายข้อมูลไป OutDC แม้ไม่พบสมาชิก
            await moveToOutDC(interaction.guild, spreadsheetId, sheetName, outSheetName, row, '30Day (ไม่พบใน DC)');
            await clearNamePDRow(spreadsheetId, sheetName, i + 1);
            processed.push({ row: i + 1, userId, reason: '30Day (ไม่พบใน DC)' });
            continue;
        }

        // เช็ค EXEMPT_ROLES
        if (hasExemptRole(member)) {
            skipped.push({ row: i + 1, userId, tag: member.user.tag, reason: 'มีบทบาท EXEMPT' });
            continue;
        }

        // ✅ ดำเนินการจัดการ
        try {
            // 1. ย้ายข้อมูลไป OutDC
            await moveToOutDC(interaction.guild, spreadsheetId, sheetName, outSheetName, row, '30Day');

            // 2. ลบบทบาททั้งหมดExcept @everyone + EXEMPT_ROLES
            await removeAllRolesExcept(member);

            // 3. ใส่บทบาท 30 day
            await member.roles.add(CONFIG.THIRTY_DAY_ROLE_ID).catch(err => {
                console.error(`❌ [30Day] ใส่บทบาท 30 day ไม่สำเร็จ ${member.user.tag}:`, err.message);
            });

            // 4. เปลี่ยนชื่อ DC (ลบ prefix เหลือแค่ชื่อ)
            const cleanName = stripPrefix(member.nickname || member.user.displayName);
            if (cleanName && cleanName !== member.nickname) {
                await member.setNickname(cleanName).catch(err => {
                    console.error(`❌ [30Day] เปลี่ยนชื่อไม่สำเร็จ ${member.user.tag}:`, err.message);
                });
            }

            // 5. ลบข้อมูลจาก NamePD
            await clearNamePDRow(spreadsheetId, sheetName, i + 1);

            processed.push({ row: i + 1, userId, tag: member.user.tag, reason: '30Day' });
            console.log(`✅ [30Day] จัดการ ${member.user.tag} สำเร็จ (แถว ${i + 1})`);

            // หน่วงเล็กน้อยเพื่อกัน rate limit
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
            console.error(`❌ [30Day] จัดการไม่สำเร็จ แถว ${i + 1}:`, err.message);
            skipped.push({ row: i + 1, userId, tag: member.user.tag, reason: `Error: ${err.message}` });
        }
    }

    return { success: true, processed, skipped, notFound };
}

module.exports = async (client) => {

    // ✅ ลงทะเบียน Slash Command
    client.once(Events.ClientReady, async () => {
        const command = new SlashCommandBuilder()
            .setName('30day')
            .setDescription('⏳ ตรวจสอบและจัดการสมาชิกครบ 30 วัน')
            .setDefaultMemberPermissions(0); // 仅 Admin

        try {
            const existing = await client.application.commands.fetch();
            const oldCmd = existing.find(c => c.name === '30day');
            if (oldCmd) {
                await client.application.commands.edit(oldCmd.id, command);
                console.log('✅ [30Day] อัปเดตคำสั่ง /30day');
            } else {
                await client.application.commands.create(command);
                console.log('✅ [30Day] ลงทะเบียนคำสั่ง /30day');
            }
        } catch (e) {
            console.error('❌ [30Day] ลงทะเบียนคำสั่งไม่สำเร็จ:', e);
        }
    });

    // ✅ จัดการคำสั่ง /30day
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName !== '30day') return;

        // เช็คสิทธิ์ Admin
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ เฉพาะผู้ดูแลระบบเท่านั้น', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const result = await checkAndProcess(client, interaction);

            if (!result.success) {
                await interaction.editReply({ content: result.message });
                return;
            }

            // สร้างข้อความผลลัพธ์
            let message = `⏳ **ผลการตรวจสอบครบ 30 วัน**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

            if (result.processed.length > 0) {
                message += `✅ **จัดการแล้ว ${result.processed.length} คน:**\n`;
                for (const p of result.processed) {
                    message += `  • ${p.tag || p.userId} (แถว ${p.row}) — ${p.reason}\n`;
                }
            } else {
                message += `✅ ไม่พบสมาชิกที่ต้องจัดการ\n`;
            }

            if (result.skipped.length > 0) {
                message += `\n⏭️ **ข้าม ${result.skipped.length} คน:**\n`;
                for (const s of result.skipped) {
                    message += `  • ${s.tag || s.userId || `แถว ${s.row}`} — ${s.reason}\n`;
                }
            }

            if (result.notFound.length > 0) {
                message += `\n⚠️ **ไม่พบใน DC ${result.notFound.length} คน:**\n`;
                for (const n of result.notFound) {
                    message += `  • ${n.userId} (แถว ${n.row})\n`;
                }
            }

            message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            message += `\n📊 ตรวจสอบแล้ว ${result.processed.length + result.skipped.length + result.notFound.length} รายการ`;

            await interaction.editReply({ content: message });

        } catch (err) {
            await handleInteractionError(interaction, err, '30Day');
        }
    });
};