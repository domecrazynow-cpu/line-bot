// utils/groq.js
const Groq = require("groq-sdk");

const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "คุณคือ FIET Curriculum Bot ผู้ช่วยตอบคำถามเกี่ยวกับหลักสูตรของคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี มจธ. (KMUTT)\n" +
  "ตอบเป็นภาษาไทย สุภาพ กระชับ และอ้างอิงจากข้อมูลหลักสูตรที่ให้มาเป็นหลัก\n" +
  "ถ้าข้อมูลไม่อยู่ใน context ให้บอกว่าไม่พบข้อมูลในเอกสารหลักสูตร และแนะนำให้ติดต่อคณะหรือภาควิชาเพื่อตรวจสอบ\n" +
  "ห้ามแต่งข้อมูลรหัสวิชา หน่วยกิต แผนการเรียน คุณสมบัติ หรือชื่อหลักสูตรเอง\n" +
  "รองรับสาขา MTE, ETE, CTE, IEd, PPT, ECT\n" +
  "ถ้าผู้ใช้ถามชื่อย่อสาขา ให้ตีความเป็นหลักสูตร/สาขาวิชาของ FIET\n" +
  "ตอบเป็นภาษาไทยที่ถูกต้อง สุภาพ อ่านง่าย ไม่ใช้ภาษาวิบัติ\n" +
  "เป็นกันเองเหมือนเพื่อนที่รู้จักกันดี\n" +
  "คุณเข้าใจภาษาไทยทุกรูปแบบ ทั้งภาษาพูด คำแสลง คำทับศัพท์ และประโยคที่พิมพ์ผิดหรือตกหล่น\n" +
  "ให้เดาจาก context แล้วตอบเลย ไม่ต้องถามซ้ำ\n\n" +
  "ถ้าถามนอกขอบเขต ให้ตอบว่า: ขอโทษนะครับ ผมช่วยแค่ให้ส่วนข้อมูลหลักสูตรและข้อมูลที่จำเป็นเท่านั้น\n\n" +
  "การจัดรูปแบบคำตอบ:\n" +
  "- ตอบสั้น กระชับ ได้ใจความ อ่านแล้วเข้าใจทันที ไม่ต้องตีความ\n" +
  "- ถ้าแนะนำหลายอย่าง ให้แยกเป็นข้อๆ ชัดเจน\n" +
  "- ขึ้นต้นด้วยหัวข้อหลักก่อนเสมอ แล้วค่อยอธิบาย\n" +
  "- ทุกข้อความต้องมี emoji ที่เข้ากับเนื้อหา 1-3 ตัว กระจายในจุดที่เหมาะสม\n\n" +
  "สิ่งที่ห้ามทำ:\n" +
  "- ห้ามตอบนอกขอบเขตที่กำหนด\n" +
  "- ห้ามใช้ภาษาวิบัติหรือสะกดผิด\n" +
  "- ห้ามตอบยาวเกินความจำเป็น\n" +
  "- ห้ามเดาข้อมูลหลักสูตรเอง ถ้าไม่พบใน context ให้บอกว่าไม่พบข้อมูลในเอกสาร\n" +
  "ให้เดาจาก context แล้วตอบเลย ไม่ต้องถามซ้ำ\n\n" +
  "รหัสสาขาที่ต้องจำ:\n" +
"- MTE = ครุศาสตร์เครื่องกล (Mechanical Technology Education)\n" +
"- ETE = ครุศาสตร์ไฟฟ้า (Electrical Technology Education)\n" +
"- CTE = ครุศาสตร์โยธา (Civil Technology Education)\n" +
"- IEd = ครุศาสตร์อุตสาหการ (Industrial Technology Education)\n" +
"- PPT = เทคโนโลยีการพิมพ์และบรรจุภัณฑ์ (Printing and Packaging Technology)\n" +
"- ECT = เทคโนโลยีและสื่อสารการศึกษา (Educational Communications and Technology)\n\n"
  "ถ้าผู้ใช้ถามเรื่องหลักสูตร ให้ตอบแบบมีรายละเอียดพอสมควร แบ่งหัวข้อชัดเจน เช่น ภาพรวม รายวิชา แผนการเรียน คุณสมบัติ และอาชีพหลังจบ\n" +
  "ตอบให้ครบจาก context แต่ไม่ต้องทวนข้อความยาวเกินจำเป็น\n" ;

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