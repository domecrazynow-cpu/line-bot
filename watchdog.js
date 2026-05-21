// watchdog.js
// ดูแลระบบ auto-heal + notify LINE users ทุกคน

require("dotenv").config();
const axios = require("axios");

const LINE_TOKEN     = process.env.LINE_TOKEN;
const BOT_URL        = "http://app:3000";
const CHECK_INTERVAL = 30000; // เช็คทุก 30 วินาที
const BROADCAST_URL  = "https://api.line.me/v2/bot/message/broadcast";

let wasDown      = false;
let downTime     = null;
let checkCount   = 0;
let failStreak   = 0;
const FAIL_THRESHOLD = 3;

// ── แจ้ง users ทุกคนผ่าน LINE Broadcast ──────────────────────────────────────
async function notify(message) {
  try {
    await axios.post(
      BROADCAST_URL,
      { messages: [{ type: "text", text: message }] },
      { headers: { Authorization: `Bearer ${LINE_TOKEN}`, "Content-Type": "application/json" } }
    );
    console.log("[watchdog] ✅ Notified users:", message.split("\n")[0]);
  } catch (err) {
    console.error("[watchdog] ❌ Notify failed:", err.response?.data || err.message);
  }
}

// ── คำนวณเวลาที่ล่มไป ─────────────────────────────────────────────────────────
function getDownDuration() {
  if (!downTime) return "";
  const diff = Math.floor((Date.now() - downTime) / 1000);
  if (diff < 60)  return `${diff} วินาที`;
  if (diff < 3600) return `${Math.floor(diff/60)} นาที`;
  return `${Math.floor(diff/3600)} ชั่วโมง`;
}

// ── เช็คสุขภาพระบบ ────────────────────────────────────────────────────────────
async function checkHealth() {
  checkCount++;
  try {
    await axios.get(BOT_URL, { timeout: 5000 });

    failStreak = 0;

    // ระบบกลับมาหลังจากล่ม
    if (wasDown) {
      const duration = getDownDuration();
      wasDown  = false;
      downTime = null;
      await notify(
        "✅ ระบบกลับมาออนไลน์แล้วครับ!\n\n" +
        "🤖 AI Bot พร้อมให้บริการแล้ว\n" +
        (duration ? `⏱️ ระบบหยุดทำงานไป: ${duration}\n` : "") +
        "⏰ เวลา: " + new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) + "\n\n" +
        "ขออภัยในความไม่สะดวกครับ 🙏"
      );
    }

    // Log ทุก 10 นาที
    if (checkCount % 20 === 0) {
      console.log(`[watchdog] ✅ System healthy — ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
    }

  } catch (err) {
    failStreak++;
    console.error(`[watchdog] ❌ Fail #${failStreak}:`, err.message);

    if (failStreak >= FAIL_THRESHOLD && !wasDown) {
      wasDown  = true;
      downTime = Date.now();
      await notify(
        "⚠️ ระบบขัดข้องชั่วคราวครับ!\n\n" +
        "🔧 กำลังแก้ไขและฟื้นฟูระบบอัตโนมัติ\n" +
        "⏰ เวลา: " + new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) + "\n\n" +
        "กรุณารอสักครู่ ระบบจะกลับมาโดยอัตโนมัติครับ 🙏"
      );
    } else if (wasDown) {
      console.error(`[watchdog] ❌ Still DOWN (${getDownDuration()})`);
    }
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
console.log("🐕 Watchdog started");
console.log(`   Monitoring: ${BOT_URL}`);
console.log(`   Interval: ${CHECK_INTERVAL/1000}s`);

// รอ 60 วินาทีก่อนเริ่มเช็ค (ให้ app start ก่อน)
setTimeout(() => {
  console.log("[watchdog] Starting health checks...");
  checkHealth();
  setInterval(checkHealth, CHECK_INTERVAL);
}, 60000);