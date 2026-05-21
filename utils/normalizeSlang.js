// utils/normalizeSlang.js
// แปลงภาษาลู / พิมพ์ตก / คำแสลง → ภาษาไทยปกติ ก่อนส่งให้ AI

const path = require('path');
const fs = require('fs');

const SLANG_PATH = path.join(__dirname, '../db/slang.json');

let _cache = null;

function loadSlang() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(SLANG_PATH, 'utf8'));
    return _cache;
  } catch (err) {
    console.warn('[slang] โหลด slang.json ไม่ได้:', err.message);
    return {};
  }
}

/**
 * แปลงคำแสลงในข้อความ
 * - จับคู่แบบ case-insensitive
 * - แทนที่ทั้งคำ (word boundary ไม่ทำงานกับไทย จึงใช้ split แทน)
 */
function normalizeSlang(text) {
  const slang = loadSlang();
  let result = text;

  for (const [key, val] of Object.entries(slang)) {
    // แทนที่ทุก occurrence แบบ global
    result = result.split(key).join(val);
  }

  return result;
}

/**
 * เพิ่ม slang ใหม่เข้า dictionary
 */
function addSlang(word, meaning) {
  const slang = loadSlang();
  slang[word] = meaning;
  _cache = slang;
  fs.writeFileSync(SLANG_PATH, JSON.stringify(slang, null, 2), 'utf8');
  console.log(`[slang] เพิ่มคำใหม่: "${word}" → "${meaning}"`);
}

module.exports = { normalizeSlang, addSlang };
