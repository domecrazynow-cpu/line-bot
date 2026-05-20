// utils/groq.js
const Groq = require("groq-sdk");

const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "คุณเป็นผู้ช่วยให้ข้อมูลหลักสูตรของคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี (FIET) มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี (KMUTT)\n" +
  "มี 6 สาขาวิชา ได้แก่ MTE, ETE, CTE, IEd, PPT และ ECT\n" +
  "ตอบเป็นภาษาไทยที่ถูกต้อง สุภาพ ชัดเจน\n" +
  "ถ้าไม่มีข้อมูลให้บอกตรงๆ ว่าไม่ทราบ ห้ามแต่งข้อมูลขึ้นมาเอง\n" +
  "ถ้าถามเรื่องหลักสูตร ให้ดูจากข้อมูล RAG ที่ให้มาก่อนเสมอ\n" +
  "การจัดรูปแบบ: ตอบสั้น กระชับ แยกเป็นข้อๆ มี emoji 1-2 ตัว";
async function askGroq(userMsg, kbContext) {
  const systemWithContext = kbContext
    ? SYSTEM_PROMPT + "\n\n---\nข้อมูลจากเอกสารหลักสูตรและฐานความรู้:\n" + kbContext + "\n---"
    : SYSTEM_PROMPT;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemWithContext },
      { role: "user",   content: userMsg }
    ],
temperature: 0.3,
max_tokens: 1200,
  });
  return completion.choices[0].message.content;
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
