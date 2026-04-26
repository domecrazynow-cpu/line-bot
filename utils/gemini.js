// utils/gemini.js
// Gemini AI — ค้นหา real-time ทุกคำถาม

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model ปกติ
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const modelWithSearch = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  tools: [{ googleSearch: {} }],
});

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  `คุณเป็นผู้ช่วยแนะนำที่กิน เที่ยว เฉพาะในประเทศไทยเท่านั้น
ตอบเป็นภาษาไทยที่ถูกต้อง สุภาพ อ่านง่าย ไม่ใช้ภาษาวิบัติ
คุณเข้าใจภาษาไทยทุกรูปแบบ ทั้งภาษาพูด คำแสลง คำทับศัพท์ และประโยคที่พิมพ์ผิดหรือตกหล่น
ให้เดาจาก context แล้วตอบเลย ไม่ต้องถามซ้ำ
ขอบเขตที่ตอบได้: ร้านอาหาร ของกิน สถานที่ท่องเที่ยว ที่พัก การเดินทางในไทย โปรโมชัน อีเวนท์
ถ้าถามนอกขอบเขต ตอบว่า "ขอโทษนะครับ ผมช่วยแนะนำแค่ที่กินที่เที่ยวในไทยเท่านั้นเลยครับ 😊"
การจัดรูปแบบ: ตอบสั้น กระชับ แยกเป็นข้อๆ มี emoji 1-3 ตัว ถ้าแนะนำร้าน/สถานที่ บอก ชื่อ/ประเภท/งบ ทุกครั้ง
ข้อมูลที่ให้ต้องเป็นปัจจุบันและถูกต้องเสมอ ถ้าไม่แน่ใจให้บอกว่าควรตรวจสอบอีกครั้ง`;

/**
 * askGeminiRealtime — ค้นหา real-time ทุกคำถาม
 * ใช้ Google Search grounding เพื่อข้อมูลปัจจุบัน
 */
async function askGeminiRealtime(userMsg, kbContext = null) {
  const today = new Date().toLocaleDateString("th-TH", {
    year: "numeric", month: "long", day: "numeric"
  });

  const systemWithContext = kbContext
    ? `${SYSTEM_PROMPT}\n\n---\nข้อมูล insider ของเรา (ให้ใช้ก่อนเสมอ):\n${kbContext}\n---`
    : SYSTEM_PROMPT;

  const prompt = `${systemWithContext}

วันที่ปัจจุบัน: ${today}
ให้ค้นหาข้อมูลปัจจุบันก่อนตอบทุกครั้ง เพื่อให้ข้อมูลที่ทันสมัยที่สุด

ผู้ใช้ถามว่า: ${userMsg}`;

  try {
    const result = await modelWithSearch.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    // ถ้า search ไม่ได้ fallback ไป model ปกติ
    console.warn("[gemini] search fallback:", err.message);
    const result = await model.generateContent(`${systemWithContext}\n\nผู้ใช้: ${userMsg}`);
    return result.response.text();
  }
}

/**
 * askGemini — สำหรับงานที่ไม่ต้องการ real-time (เช่น generate trip plan)
 */
async function askGemini(userMsg, kbContext = null) {
  const systemWithContext = kbContext
    ? `${SYSTEM_PROMPT}\n\n---\nข้อมูล insider:\n${kbContext}\n---`
    : SYSTEM_PROMPT;

  const prompt = `${systemWithContext}\n\nผู้ใช้: ${userMsg}`;
  const result = await model.generateContent(prompt);
  return result.response.text();
}

/**
 * generateTripPlan — สร้างแผนเที่ยวจาก LIFF form พร้อม real-time search
 */
async function generateTripPlan({ province, area, mood, budget, days, weather, people, festival, extra, lat, lng }) {
  const today = new Date().toLocaleDateString("th-TH", {
    year: "numeric", month: "long", day: "numeric"
  });

  const locationContext = (lat && lng)
    ? `\nพิกัด GPS: ${lat}, ${lng} — ใช้แนะนำสถานที่ที่ใกล้จริงๆ`
    : "";

  const prompt = `${SYSTEM_PROMPT}

วันที่ปัจจุบัน: ${today}
ค้นหาข้อมูลปัจจุบันก่อนตอบ เพื่อให้ได้ร้านและสถานที่ที่ยังเปิดอยู่จริง

ผู้ใช้ต้องการแผนเที่ยวดังนี้:
- จังหวัด: ${province}
- พื้นที่/อำเภอ: ${area || "ทั่วจังหวัด"}
- อารมณ์/สไตล์: ${mood}
- งบประมาณ: ${budget} บาท/คน
- จำนวนวัน: ${days} วัน
- จำนวนคน: ${people} คน
- สภาพอากาศ: ${weather}
- เทศกาล/โอกาส: ${festival || "ทั่วไป"}
${extra ? `- ความต้องการพิเศษ: ${extra}` : ""}${locationContext}

สร้างแผนเที่ยวที่:
1. แนะนำสถานที่ที่ไม่ค่อยมีคนรู้จัก (hidden gems) เป็นหลัก
2. จัดตารางเวลาแต่ละวันชัดเจน เช้า/กลางวัน/เย็น/ค่ำ
3. แนะนำร้านอาหารอร่อยในพื้นที่ที่ยังเปิดอยู่ปัจจุบัน
4. บอกงบประมาณโดยประมาณแต่ละกิจกรรม
5. แนะนำการเดินทาง รถเมล์/รถสองแถว/ระยะทาง
6. เตือนสิ่งที่ควรระวังตามสภาพอากาศ`;

  try {
    const result = await modelWithSearch.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.warn("[gemini-trip] search fallback:", err.message);
    const result = await model.generateContent(prompt);
    return result.response.text();
  }
}

/**
 * findNearbyEventsAI — หาอีเวนท์ใกล้เคียง real-time
 */
async function findNearbyEventsAI(location) {
  const today = new Date().toLocaleDateString("th-TH", {
    year: "numeric", month: "long", day: "numeric"
  });

  const prompt = `ค้นหาอีเวนท์ งาน เทศกาล หรือกิจกรรมพิเศษที่กำลังจะเกิดขึ้นหรือกำลังเปิดรับสมัคร
บริเวณ: ${location}
วันที่ปัจจุบัน: ${today}

ตอบในรูปแบบ JSON array เท่านั้น ห้ามมีข้อความอื่น:
[
  {
    "title": "ชื่ออีเวนท์",
    "description": "รายละเอียดสั้นๆ 1-2 ประโยค",
    "date": "วันที่จัดงาน",
    "location": "สถานที่จัดงาน",
    "registerUrl": null
  }
]

ถ้าไม่มีอีเวนท์ที่แน่ใจ 100% ให้ return [] เท่านั้น ห้ามแต่งข้อมูล`;

  try {
    const result = await modelWithSearch.generateContent(prompt);
    const text   = result.response.text();
    const clean  = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

module.exports = { askGemini, askGeminiRealtime, generateTripPlan, findNearbyEventsAI, SYSTEM_PROMPT };