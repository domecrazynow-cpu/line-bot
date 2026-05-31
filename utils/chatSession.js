// utils/chatSession.js — จำการสนทนาต่อเนื่อง + ตรวจความสับสน + timeout
const MAX_TURNS        = 3;           // จำ 3 คู่ = 6 messages (~150 tokens)
const SESSION_TIMEOUT  = 15 * 60 * 1000;  // 15 นาที

// sessions[userId] = { messages: [], lastActive: ts, start: ts }
const sessions = {};

// ── ผู้ช่วยภายใน ───────────────────────────────────────────────────────────────
function _get(userId) {
  if (!sessions[userId]) {
    sessions[userId] = { messages: [], lastActive: Date.now(), start: Date.now() };
  }
  return sessions[userId];
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** ตรวจว่า session หมดเวลาหรือยัง (ก่อนรับ message ใหม่) */
function isExpired(userId) {
  const s = sessions[userId];
  return s ? Date.now() - s.lastActive > SESSION_TIMEOUT : false;
}

/** เพิ่ม message เข้า session */
function addMessage(userId, role, content) {
  const s = _get(userId);
  s.messages.push({ role, content });
  s.lastActive = Date.now();
  // ตัดเกิน MAX_TURNS * 2 messages
  if (s.messages.length > MAX_TURNS * 2) {
    s.messages = s.messages.slice(-MAX_TURNS * 2);
  }
}

/**
 * ดึง history ในรูปแบบ [{role, content}] สำหรับ Groq
 * (ไม่รวม message ปัจจุบัน — จะถูกเพิ่มใน askGroq เอง)
 */
function getGroqHistory(userId) {
  return (sessions[userId]?.messages || []).map(({ role, content }) => ({ role, content }));
}

/**
 * ตรวจว่า user ดูเหมือนสับสน:
 * - พิมพ์คำบ่งบอกความงง
 * - ถามเรื่องเดิมซ้ำ 2 ครั้งขึ้นไปใน session
 *
 * ไม่นับว่าสับสนถ้า user กำลัง "สำรวจ" หรือ pivot หัวข้อ
 */
function detectConfusion(userId, newMsg) {
  // คำที่แสดงว่ากำลัง "สำรวจ/pivot" — ไม่ใช่สับสน
  const EXPLORATION = [
    "น่าสนใจ", "อีกอะไร", "มีอะไรอีก", "บอกเพิ่ม", "อีกไหม",
    "ออกจาก", "เรื่องอื่น", "หัวข้ออื่น", "นอกจาก", "แล้ว",
    "ต่อไป", "ถัดไป", "เปลี่ยน", "ไปดู", "อยากรู้เรื่อง",
  ];
  if (EXPLORATION.some(w => newMsg.includes(w))) return false;

  // คำที่แสดงความสับสนจริงๆ
  const CONFUSION_WORDS = [
    "งง", "ไม่เข้าใจ", "ทวนให้หน่อย", "สรุปให้หน่อย",
    "ช่วยสรุป", "พูดอีกที", "บอกอีกที",
  ];
  if (CONFUSION_WORDS.some(w => newMsg.includes(w))) return true;

  // ถามซ้ำ: เนื้อหาคล้ายเดิม 60%+ (เพิ่มจาก 50 เพื่อลด false positive)
  const s = sessions[userId];
  if (!s) return false;
  const userMsgs = s.messages.filter(m => m.role === "user").slice(-4).map(m => m.content);
  if (userMsgs.length < 2) return false;

  const last = new Set(newMsg.replace(/\s+/g, " ").split(" ").filter(w => w.length > 1));
  const prev = userMsgs[userMsgs.length - 1].replace(/\s+/g, " ").split(" ").filter(w => w.length > 1);
  if (!last.size || !prev.length) return false;
  const overlap = prev.filter(w => last.has(w)).length;
  const sim = overlap / Math.max(last.size, prev.length);
  return sim >= 0.6;
}

/**
 * สร้าง summary ของ session (สำหรับบันทึกใน profile)
 * @returns {{ questions: string[], durationMin: number } | null}
 */
function buildSummary(userId) {
  const s = sessions[userId];
  if (!s || s.messages.length === 0) return null;
  const questions = s.messages.filter(m => m.role === "user").map(m => m.content);
  const durationMin = Math.round((Date.now() - s.start) / 60000);
  return { questions, durationMin };
}

/** จบ session — คืน summary แล้วล้างข้อมูล */
function endSession(userId) {
  const summary = buildSummary(userId);
  delete sessions[userId];
  console.log(`[session] ended for ${userId} — ${summary?.questions.length || 0} questions, ${summary?.durationMin || 0} min`);
  return summary;
}

/** จำนวน turns ที่คุยไปแล้วใน session นี้ */
function getTurnCount(userId) {
  return Math.floor((sessions[userId]?.messages.length || 0) / 2);
}

module.exports = { isExpired, addMessage, getGroqHistory, detectConfusion, buildSummary, endSession, getTurnCount };
