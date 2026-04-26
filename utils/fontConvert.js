// utils/fontConvert.js
// แปลงข้อความที่พิมพ์ผิด font (ลืมเปลี่ยน keyboard layout ไทย<->อังกฤษ)

const ENG_TO_THAI = {
  'q': 'ๆ', 'w': 'ไ', 'e': 'ำ', 'r': 'พ', 't': 'ะ', 'y': 'ั', 'u': 'ี',
  'i': 'ร', 'o': 'น', 'p': 'ย', '[': 'บ', ']': 'ล', '\\': 'ฃ',
  'a': 'ฟ', 's': 'ห', 'd': 'ก', 'f': 'ด', 'g': 'เ', 'h': '้', 'j': '่',
  'k': 'า', 'l': 'ส', ';': 'ว', "'": 'ง',
  'z': 'ผ', 'x': 'ป', 'c': 'แ', 'v': 'อ', 'b': 'ิ', 'n': 'ื', 'm': 'ท',
  ',': 'ม', '.': 'ใ', '/': 'ฝ',
  'Q': '๑', 'W': '๒', 'E': '๓', 'R': '๔', 'T': 'ู', 'Y': '฿', 'U': '๕',
  'I': '๖', 'O': '๗', 'P': '๘', '{': '๙', '}': '๐',
  'A': 'ฤ', 'S': 'ฆ', 'D': 'ฏ', 'F': 'โ', 'G': 'ฌ', 'H': '็', 'J': '๋',
  'K': 'ษ', 'L': 'ศ', ':': 'ซ', '"': '',
  'Z': '(', 'X': ')', 'C': 'ฉ', 'V': 'ฮ', 'B': 'ฺ', 'N': '์', 'M': '?',
  '<': 'ฒ', '>': 'ฬ', '?': 'ฦ',
};

const THAI_TO_ENG = Object.fromEntries(
  Object.entries(ENG_TO_THAI).map(([k, v]) => [v, k]).filter(([k]) => k)
);

/**
 * ตรวจว่าข้อความเป็นภาษาอังกฤษล้วน (น่าจะลืมเปลี่ยน font)
 */
function looksLikeWrongFont(text) {
  const engChars = text.match(/[a-zA-Z]/g) || [];
  const thaiChars = text.match(/[\u0E00-\u0E7F]/g) || [];
  // ถ้ามีอังกฤษ > 70% และไม่มีไทยเลย → น่าจะพิมพ์ผิด font
return engChars.length > 5 && thaiChars.length === 0 && text.length > 6;}

/**
 * แปลง English keyboard → Thai
 */
function engToThai(text) {
  return text.split('').map(c => ENG_TO_THAI[c] ?? c).join('');
}

/**
 * แปลง Thai keyboard → English  
 */
function thaiToEng(text) {
  return text.split('').map(c => THAI_TO_ENG[c] ?? c).join('');
}

/**
 * Auto-detect และแปลงถ้าจำเป็น
 * คืนค่า { converted: string, wasConverted: boolean }
 */
function autoConvertFont(text) {
  if (looksLikeWrongFont(text)) {
    const converted = engToThai(text);
    return { converted, wasConverted: true };
  }
  return { converted: text, wasConverted: false };
}

module.exports = { engToThai, thaiToEng, autoConvertFont };
