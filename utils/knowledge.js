// utils/knowledge.js
// Personal knowledge base — เพิ่ม/ลบ/ค้นหาข้อมูลส่วนตัว พร้อมระบบ expiry

const fs   = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../db/knowledge.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
}

function loadDB() {
  ensureDB();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveDB(entries) {
  ensureDB();
  fs.writeFileSync(DB_PATH, JSON.stringify(entries, null, 2), "utf8");
}

// ── Expiry ────────────────────────────────────────────────────────────────────

/**
 * คำนวณวันหมดอายุจาก duration string
 * เช่น "7d" = 7 วัน, "2w" = 2 สัปดาห์, "1m" = 1 เดือน, "forever" = ไม่หมดอายุ
 */
function calcExpiry(duration) {
  if (!duration || duration === "forever") return null;

  const num  = parseInt(duration);
  const unit = duration.replace(/[0-9]/g, "").toLowerCase();
  const now  = Date.now();

  const ms = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7  * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
  }[unit];

  if (!ms) throw new Error(`duration format ไม่ถูก: "${duration}" — ใช้ เช่น "7d", "2w", "1m", "forever"`);
  return new Date(now + num * ms).toISOString();
}

function isExpired(entry) {
  if (!entry.expiresAt) return false;
  return new Date(entry.expiresAt) < new Date();
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * เพิ่มข้อมูลใหม่
 * @param {object} opts
 * @param {string} opts.title     - ชื่อ เช่น "ร้านก๋วยเตี๋ยวเรือนายหมู"
 * @param {string} opts.content   - รายละเอียด
 * @param {string} opts.category  - หมวด เช่น "ร้านอาหาร", "ที่เที่ยว", "ทั่วไป"
 * @param {string[]} opts.tags    - คำค้น เช่น ["ก๋วยเตี๋ยว", "สมุทรสาคร"]
 * @param {string} opts.duration  - "7d" | "2w" | "1m" | "forever"
 */
function addEntry({ title, content, category = "ทั่วไป", tags = [], duration = "forever" }) {
  const entries = loadDB();
  const entry = {
    id:        Date.now().toString(),
    title,
    content,
    category,
    tags:      tags.map(t => t.toLowerCase()),
    createdAt: new Date().toISOString(),
    expiresAt: calcExpiry(duration),
    duration,
  };
  entries.push(entry);
  saveDB(entries);
  console.log(`[kb] เพิ่ม: "${title}" (หมดอายุ: ${entry.expiresAt ?? "ไม่มี"})`);
  return entry;
}

/**
 * ลบ entry ที่หมดอายุแล้วออกจาก DB
 * เรียกอัตโนมัติทุกครั้งที่ search
 */
function purgeExpired() {
  const entries = loadDB();
  const active  = entries.filter(e => !isExpired(e));
  if (active.length < entries.length) {
    console.log(`[kb] ลบ ${entries.length - active.length} รายการที่หมดอายุ`);
    saveDB(active);
  }
  return active;
}

/**
 * ค้นหาข้อมูลจาก keyword
 * คืนค่า entries ที่ match (title / content / tags / category)
 */
function searchKnowledge(query) {
  const entries = purgeExpired();               // ลบหมดอายุก่อนค้น
  const words   = query.toLowerCase().split(/\s+/);

  return entries.filter(e => {
    const haystack = [
      e.title, e.content, e.category, ...e.tags
    ].join(" ").toLowerCase();
    return words.some(w => haystack.includes(w));
  });
}

/**
 * ดึงทุก entry (active)
 */
function getAllEntries() {
  return purgeExpired();
}

/**
 * ลบ entry ด้วย id
 */
function deleteEntry(id) {
  const entries = loadDB();
  const next    = entries.filter(e => e.id !== id);
  if (next.length === entries.length) return false;
  saveDB(next);
  console.log(`[kb] ลบ id: ${id}`);
  return true;
}

/**
 * แก้ไข entry
 */
function updateEntry(id, patch) {
  const entries = loadDB();
  const idx     = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;

  if (patch.duration) {
    patch.expiresAt = calcExpiry(patch.duration);
  }
  entries[idx] = { ...entries[idx], ...patch, id };
  saveDB(entries);
  return entries[idx];
}

/**
 * สร้าง context string สำหรับแนบใน prompt ให้ AI
 */
function buildContext(results) {
  if (!results.length) return null;
  return results
    .map(e => `[${e.category}] ${e.title}: ${e.content}`)
    .join("\n");
}

module.exports = {
  addEntry, deleteEntry, updateEntry,
  searchKnowledge, getAllEntries, buildContext,
  purgeExpired,
};
