// utils/groq.js
const Groq = require("groq-sdk");

const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "คุณเป็นผู้ช่วยให้ข้อมูลหลักสูตรของคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี (FIET) มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี (KMUTT)\n" +
  "มี 8 สาขา: MTE (เครื่องกล), ETE (ไฟฟ้า), CTE (โยธา), IED (อุตสาหการ), PPT (การพิมพ์), ECT (สื่อสารการศึกษา), CIT (คอมพิวเตอร์), ITE (เทคโนโลยีอุตสาหกรรม)\n" +
  "\n" +
  "กฎภาษาและรูปแบบ (ห้ามละเมิด):\n" +
  "- ใช้ภาษาไทยและภาษาอังกฤษเท่านั้น ห้ามตัวอักษรจีน/ญี่ปุ่น/เกาหลี\n" +
  "- ห้ามใช้ ** ## _ หรือ markdown ใดๆ เด็ดขาด เพราะ LINE ไม่รองรับ\n" +
  "- bullet ใช้ - นำหน้า เท่านั้น\n" +
  "\n" +
  "ข้อมูลที่ต้องข้ามเสมอ (ทุกสาขามีเหมือนกัน ไม่มีคุณค่าในการบอก):\n" +
  "- ซื่อสัตย์สุจริต / เอื้อเฟื้อเผื่อแผ่ / จิตสาธารณะ / คุณธรรม จริยธรรม\n" +
  "- ประโยคที่ขึ้นต้นว่า 'มุ่งผลิตบัณฑิตที่มีคุณภาพ' (boilerplate ที่ทุกหลักสูตรใช้)\n" +
  "\n" +
  "กฎการตอบ (เข้มงวด):\n" +
  "1. ตอบสั้น เน้นสิ่งที่ทำให้สาขานี้ต่างจากสาขาอื่น ไม่ใช่สิ่งที่ทุกสาขามีเหมือนกัน\n" +
  "2. ถามภาพรวม → bullet สูงสุด 3 ข้อ แต่ละข้อ 1 บรรทัด ห้ามเกินนี้\n" +
  "3. ถามเฉพาะ → ตอบตรงประเด็น 2-3 ประโยคสั้น\n" +
  "4. ถ้ามีข้อมูลเยอะ → บอกแค่ประเด็นหลัก แล้วถามว่าอยากรู้ส่วนไหนเพิ่ม\n" +
  "5. ถ้ามี [โปรไฟล์ผู้ใช้] → ปรับให้ตรงสาขา/หัวข้อที่สนใจ\n" +
  "6. ถ้า [ผู้ใช้ดูสับสน] → ทวนสรุปสั้นๆ แล้วถามให้ชัดว่าต้องการอะไร\n" +
  "7. หลังตอบ → ถามต่อ 1 คำถามสั้น เช่น 'อยากรู้เรื่องอะไรเพิ่มครับ?'\n" +
  "8. ตอบต้องจบประโยคเสมอ ห้ามตัดกลางคัน ถ้าจะยาวให้ตัดให้สั้นลงก่อนจบ\n" +
  "9. ห้ามปนข้อมูลสาขาอื่น เช่น ถ้าถามเรื่อง ECT ห้ามบอกข้อมูล PPT หรือสาขาอื่นปะปน\n" +
  "10. ถามต่อท้ายได้ 1 คำถามเท่านั้น ห้ามถาม 2 คำถามในประโยคเดียวกัน\n" +
  "11. ห้ามแต่งตัวเลข: ค่าเทอม หน่วยกิต เกณฑ์เกรด คะแนนขั้นต่ำ — ถ้าไม่มีในเอกสารให้บอกว่าไม่มีและแนะนำติดต่อคณะ\n" +
  "12. ห้ามแต่งข้อมูลอื่นๆ ถ้าไม่รู้ให้บอกตรงๆ\n" +
  "13. emoji 1 ตัวพอ";

// ── คำแปลสำรองสำหรับตัวอักษรจีนที่พบบ่อย ─────────────────────────────────────
const CJK_REPLACEMENTS = [
  [/社会/g, "สังคม"],
  [/经济/g, "เศรษฐกิจ"],
  [/教育/g, "การศึกษา"],
  [/技术/g, "เทคโนโลยี"],
  [/发展/g, "การพัฒนา"],
  [/国家/g, "ประเทศ"],
  [/学生/g, "นักศึกษา"],
  [/课程/g, "หลักสูตร"],
];

/**
 * กรองอักษรที่ไม่ใช่ไทย/อังกฤษ/เครื่องหมายทั่วไปออกจาก response
 */
function sanitizeResponse(text) {
  let result = text;
  // แทนที่คำจีนที่รู้จักก่อน
  for (const [pattern, replacement] of CJK_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  // ลบตัวอักษร CJK ที่เหลือ (U+4E00–U+9FFF, U+3000–U+303F, U+FF00–U+FFEF)
  result = result.replace(/[　-〿一-鿿＀-￯぀-ゟ゠-ヿ가-힯]/g, "");
  // ลบช่องว่างซ้อน
  result = result.replace(/  +/g, " ").replace(/ ([,.!?])/g, "$1");
  return result.trim();
}

/**
 * @param {string}   userMsg
 * @param {string|null} kbContext      - ข้อมูลจาก RAG / fallback
 * @param {string|null} profileContext - โปรไฟล์ user จาก userProfile.js
 * @param {Array}    history           - [{role,content}] conversation history
 */
async function askGroq(userMsg, kbContext, profileContext = null, history = []) {
  let systemFull = SYSTEM_PROMPT;

  if (profileContext) {
    systemFull += "\n\n" + profileContext;
  }

  if (kbContext) {
    systemFull += "\n\n---\nข้อมูลจากเอกสารหลักสูตรและฐานความรู้:\n" + kbContext + "\n---";
  }

  // history มากขึ้น → ลด max_tokens เพื่อไม่เกิน context window
  const maxTok = history.length >= 8 ? 700 : 900;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemFull },
      ...history,
      { role: "user",   content: userMsg },
    ],
    temperature: 0.3,
    max_tokens: maxTok,
  });
  return sanitizeResponse(completion.choices[0].message.content);
}

async function generateTripPlan({ province, area, mood, budget, days, weather, people, festival, extra, lat, lng }) {
  const locationContext = (lat && lng) ? "\nพิกัด GPS: " + lat + ", " + lng : "";
  const prompt = "สร้างแผนเที่ยวดังนี้:\n" +
    "- จังหวัด: " + province + "\n" +
    "- พื้นที่/อำเภอ: " + (area || "ทั่วจังหวัด") + "\n" +
    "- อารมณ์/สไตล์: " + mood + "\n" +
    "- งบประมาณ: " + budget + " บาท/คน\n" +
    "- จำนวนวัน: " + days + " วัน\n" +
    "- จำนวนคน: " + people + " คน\n" +
    "- สภาพอากาศ: " + weather + "\n" +
    "- เทศกาล/โอกาส: " + (festival || "ทั่วไป") + "\n" +
    (extra ? "- ความต้องการพิเศษ: " + extra + "\n" : "") +
    locationContext + "\n\n" +
    "กรุณาสร้างแผนเที่ยวที่:\n" +
    "1. แนะนำสถานที่ที่ไม่ค่อยมีคนรู้จัก (hidden gems) เป็นหลัก\n" +
    "2. จัดตารางเวลาแต่ละวันชัดเจน เช้า/กลางวัน/เย็น/ค่ำ\n" +
    "3. แนะนำร้านอาหารอร่อยในพื้นที่\n" +
    "4. บอกงบประมาณโดยประมาณแต่ละกิจกรรม\n" +
    "5. แนะนำการเดินทาง รถเมล์/รถสองแถว/ระยะทาง\n" +
    "6. เตือนสิ่งที่ควรระวังตามสภาพอากาศ\n" +
    "7. แนะนำโทรเช็คก่อนไปทุกครั้ง เผื่อข้อมูลเปลี่ยน";

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 2048,
  });
  return completion.choices[0].message.content;
}

async function findNearbyEventsGroq(location) {
  const today = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  const prompt = "ค้นหาอีเวนท์ งาน เทศกาล หรือกิจกรรมพิเศษที่น่าจะเกิดขึ้น\n" +
    "บริเวณ: " + location + "\n" +
    "วันที่อ้างอิง: " + today + "\n\n" +
    'ตอบในรูปแบบ JSON array เท่านั้น ห้ามมีข้อความอื่น:\n' +
    '[{"title":"ชื่ออีเวนท์","description":"รายละเอียด","date":"วันที่","location":"สถานที่","registerUrl":null}]\n' +
    "ถ้าไม่มีอีเวนท์ที่แน่ใจ ให้ return [] เท่านั้น ห้ามแต่งข้อมูล";

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 512,
    });
    const text  = completion.choices[0].message.content;
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

module.exports = { askGroq, generateTripPlan, findNearbyEventsGroq, SYSTEM_PROMPT };
