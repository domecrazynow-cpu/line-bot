// utils/userProfile.js — ติดตามพฤติกรรมและความสนใจของ user แต่ละคน
const fs   = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../db/userProfiles.json");

let profiles = {};

// โหลดข้อมูลที่บันทึกไว้
try {
  if (fs.existsSync(DB_PATH)) {
    profiles = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  }
} catch { profiles = {}; }

const MAJOR_NAMES = {
  MTE: "ครุศาสตร์เครื่องกล",
  ETE: "ครุศาสตร์ไฟฟ้า",
  CTE: "ครุศาสตร์โยธา",
  IED: "ครุศาสตร์อุตสาหการ",
  PPT: "เทคโนโลยีการพิมพ์และบรรจุภัณฑ์",
  ECT: "เทคโนโลยีและสื่อสารการศึกษา",
  CIT: "คอมพิวเตอร์และเทคโนโลยีสารสนเทศ",
  ITE: "เทคโนโลยีอุตสาหกรรม",
};

const TOPIC_PATTERNS = [
  { key: "admission",     re: /รับสมัคร|คุณสมบัติ|สมัคร|รับเข้า|เกรด|GPAX|TCAS|วุฒิ|คัดเลือก/i },
  { key: "career",        re: /อาชีพ|ทำงาน|จบแล้ว|งาน|เงินเดือน|ตลาดแรงงาน|ประกอบอาชีพ/i },
  { key: "courses",       re: /รายวิชา|วิชา|เรียนอะไร|หน่วยกิต|ตารางเรียน|วิชาบังคับ|วิชาเลือก/i },
  { key: "fees",          re: /ค่าเทอม|ค่าธรรมเนียม|ทุน|ค่าใช้จ่าย|ราคา|เสียค่า/i },
  { key: "project",       re: /โครงการ|วิจัย|ปริญญานิพนธ์|สหกิจ|thesis|dissertation/i },
  { key: "graduate",      re: /ป\.โท|ปริญญาโท|master|บัณฑิตศึกษา|ป\s*โท/i },
  { key: "undergraduate", re: /ป\.ตรี|ปริญญาตรี|bachelor|ค\.อ\.บ|ทล\.บ|ป\s*ตรี/i },
  { key: "curriculum",    re: /หลักสูตร|โครงสร้าง|แผนการเรียน|skill|สมรรถนะ/i },
  { key: "english",       re: /ภาษาอังกฤษ|english|TOEIC|IELTS|TETET/i },
];

const TOPIC_LABELS = {
  admission:     "การรับสมัคร/คุณสมบัติ",
  career:        "อาชีพ/การทำงาน",
  courses:       "รายวิชา",
  fees:          "ค่าเทอม/ทุน",
  project:       "โครงการ/วิจัย",
  graduate:      "ปริญญาโท",
  undergraduate: "ปริญญาตรี",
  curriculum:    "โครงสร้างหลักสูตร",
  english:       "ภาษาอังกฤษ",
};

function detectTopics(text) {
  return TOPIC_PATTERNS
    .filter(({ re }) => re.test(text))
    .map(({ key }) => key);
}

let _saveTimer = null;
function saveProfiles() {
  // debounce: รวม write หลายๆ ครั้งที่ใกล้กัน เป็น 1 ครั้ง (ทุก 2 วินาที)
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFile(DB_PATH, JSON.stringify(profiles, null, 2), err => {
        if (err) console.error("[profile] save error:", err.message);
      });
    } catch (e) {
      console.error("[profile] save error:", e.message);
    }
  }, 2000);
}

function getProfile(userId) {
  if (!profiles[userId]) {
    profiles[userId] = {
      programs:    {},   // { ETE: 3, MTE: 1 }
      topics:      {},   // { admission: 2, career: 1 }
      lastProgram: null,
      msgCount:    0,
      lastActive:  null,
    };
  }
  return profiles[userId];
}

/**
 * อัปเดตโปรไฟล์หลังรับข้อความ
 * @param {string} userId
 * @param {string|null} program  - รหัสสาขาที่ detect ได้
 * @param {string} text          - ข้อความ user (สำหรับ detect topics)
 */
function updateProfile(userId, program, text) {
  const p = getProfile(userId);
  p.msgCount++;
  p.lastActive = new Date().toISOString();

  if (program) {
    p.programs[program] = (p.programs[program] || 0) + 1;
    p.lastProgram = program;
  }

  const topics = detectTopics(text);
  for (const t of topics) {
    p.topics[t] = (p.topics[t] || 0) + 1;
  }

  saveProfiles();
  return p;
}

/** สาขาที่ถามบ่อยที่สุด */
function getTopProgram(userId) {
  const { programs } = getProfile(userId);
  const entries = Object.entries(programs);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * สร้าง profile context แบบกระชับ (~20 tokens)
 * @returns {string|null}
 */
function buildProfileContext(userId) {
  const p = getProfile(userId);
  if (p.msgCount < 2) return null; // ยังถามน้อย ไม่ส่ง profile

  const topProgram = getTopProgram(userId);
  const topTopics  = Object.entries(p.topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => TOPIC_LABELS[k] || k);

  if (!topProgram && !topTopics.length) return null;

  // รูปแบบสั้น: "[โปรไฟล์] ETE อาชีพ/รายวิชา"
  const parts = [];
  if (topProgram) parts.push(topProgram);
  if (topTopics.length) parts.push(topTopics.join("/"));
  return `[โปรไฟล์] ${parts.join(" ")}`;
}

module.exports = { getProfile, updateProfile, getTopProgram, buildProfileContext };
