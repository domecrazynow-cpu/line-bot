// utils/groq.js
const Groq  = require("groq-sdk");
const axios = require("axios");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL_70B    = "llama-3.3-70b-versatile";  // 100K TPD
const MODEL_8B     = "llama-3.1-8b-instant";      // 500K TPD
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";

// ── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "คุณคือน้องบอทของ FIET KMUTT พูดแบบเป็นกันเอง ภาษาไทยกระชับ\n" +
  "8 สาขา: MTE(เครื่องกล) ETE(ไฟฟ้า) CTE(โยธา) IED(อุตสาหการ) PPT(การพิมพ์) ECT(สื่อสารการศึกษา) CIT(คอมพิวเตอร์) ITE(อุตสาหกรรม)\n" +
  "\n" +
  "วิธีตอบ:\n" +
  "- เนื้อหา: bullet 2-3 ข้อ เน้นจุดเด่นเฉพาะของสาขานั้น ไม่ปนสาขาอื่น\n" +
  "- ถ้าถามเรื่องสาขาเดียวแต่ไม่ระบุว่าสาขาไหน → ถามกลับว่า 'ถามเรื่องสาขาไหนครับ?' ห้ามสุ่มเดาสาขา\n" +
  "- ถ้าถามภาพรวม/เปรียบเทียบหลายสาขา/ทุกสาขา → ตอบเปรียบเทียบได้เลย ไม่ต้องถามกลับ\n" +
  "- ถ้ามีประวัติการสนทนา → อ้างอิงสิ่งที่คุยมา เช่น 'จากที่ถาม ECT มาแล้ว IED ต่างกันตรง...'\n" +
  "- ถามต่อ 1 คำถามสั้นๆ ท้ายคำตอบ เปลี่ยน angle ทุกครั้ง ไม่ถามซ้ำรูปแบบเดิม\n" +
  "  ดี: 'สนใจด้านอาชีพครับ?' / 'อยากเทียบกับ CIT ไหม?' / 'มีพื้นฐานด้านไหนมาบ้างครับ?'\n" +
  "  ห้าม: 'อยากทราบข้อมูลเพิ่มเติมเกี่ยวกับโครงสร้างหลักสูตรหรือการรับสมัคร'\n" +
  "- ถ้ามี[โปรไฟล์]ให้ตอบตรงความสนใจและแนะนำต่อยอด\n" +
  "- ถ้า[สับสน]ให้ทวนสั้นๆ ว่าคุยอะไรมาบ้าง แล้วถามให้ชัด\n" +
  "ห้าม: markdown(**##) / ปนข้อมูลสาขาอื่น / ตัดกลางประโยค\n" +
  "ห้ามแต่งตัวเลขเด็ดขาด: ค่าเทอม/หน่วยกิต/จำนวนรับ ถ้าไม่แน่ใจ → บอกว่า 'ไม่มีข้อมูล กรุณาติดต่อคณะ FIET โดยตรง'\n" +
  "emoji 1 ตัวท้ายคำถาม";

// ── Response cache ────────────────────────────────────────────────────────────
const _cache = new Map();
const CACHE_TTL = 3 * 60 * 1000;

function getCached(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return hit.val;
}
function setCache(key, val) {
  if (_cache.size >= 200) _cache.delete(_cache.keys().next().value);
  _cache.set(key, { val, ts: Date.now() });
}

// ── CJK sanitizer ─────────────────────────────────────────────────────────────
const CJK_MAP = [
  [/社会/g,"สังคม"],[/经济/g,"เศรษฐกิจ"],[/教育/g,"การศึกษา"],
  [/技术/g,"เทคโนโลยี"],[/发展/g,"การพัฒนา"],[/国家/g,"ประเทศ"],
  [/学生/g,"นักศึกษา"],[/课程/g,"หลักสูตร"],
];
function sanitizeResponse(text) {
  let r = text;
  // แทนที่ CJK
  for (const [p, s] of CJK_MAP) r = r.replace(p, s);
  // ลบ CJK Unicode blocks ที่เหลือ
  r = r.replace(/[　-〿一-鿿＀-￯぀-ゟ゠-ヿ가-힯]/g, "");
  // ลบ markdown ที่ LINE ไม่ render (**, ##, __)
  r = r.replace(/\*\*(.+?)\*\*/g, "$1");  // **bold** → bold
  r = r.replace(/#{1,6}\s+/g, "");         // ## Heading → Heading
  r = r.replace(/__(.+?)__/g, "$1");       // __text__ → text
  return r.replace(/  +/g, " ").trim();
}

// ── Groq call ─────────────────────────────────────────────────────────────────
async function _groqCall(model, messages, maxTok) {
  const res = await groq.chat.completions.create({
    model, messages, temperature: 0.4, max_tokens: maxTok,
  });
  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Groq returned empty choices (model: ${model})`);
  return content;
}

// ── Ollama fallback ───────────────────────────────────────────────────────────
async function _ollamaCall(messages, maxTok) {
  const res = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    { model: OLLAMA_MODEL, messages, stream: false,
      options: { num_predict: maxTok, temperature: 0.4 } },
    { timeout: 60000 }
  );
  return res.data.message.content;
}

// ── Main: Groq → Ollama fallback เมื่อ 429 ───────────────────────────────────
/**
 * @param {string}      userMsg
 * @param {string|null} kbContext
 * @param {string|null} profileContext
 * @param {Array}       history        - [{role,content}] max 6 messages
 * @param {boolean}     isFollowUp     - true = 8b, false = 70b
 */
async function askGroq(userMsg, kbContext, profileContext = null, history = [], isFollowUp = false) {
  // cache
  const canCache = !profileContext && history.length === 0;
  const cacheKey = canCache ? `${userMsg.slice(0,80)}|${(kbContext||"").slice(0,40)}` : null;
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit) { console.log("[groq] cache hit"); return hit; }
  }

  // build messages
  let sys = SYSTEM_PROMPT;
  if (profileContext) sys += "\n" + profileContext;
  if (kbContext)      sys += "\n---\n" + kbContext.slice(0, 1500) + "\n---";

  const messages = [
    { role: "system", content: sys },
    ...history.slice(-6),
    { role: "user", content: userMsg },
  ];

  const model  = isFollowUp ? MODEL_8B : MODEL_70B;
  const maxTok = isFollowUp ? 350 : 450;

  let text;
  try {
    // 1. ลอง Groq ก่อน
    text = await _groqCall(model, messages, maxTok);
    console.log(`[groq] ok (${model.includes("70b") ? "70b" : "8b"})`);
  } catch (err) {
    const isRateLimit = err?.status === 429 ||
      err?.error?.code === "rate_limit_exceeded";

    if (isRateLimit) {
      // 2. Groq หมด → ลอง model อื่นใน Groq ก่อน (8b มี quota ต่างกัน)
      if (!isFollowUp) {
        try {
          text = await _groqCall(MODEL_8B, messages, maxTok);
          console.log("[groq] 70b limited → 8b ok");
        } catch (err2) {
          if (err2?.status === 429) {
            console.warn("[groq] both models limited → ollama");
            text = await _ollamaCall(messages, maxTok);
            console.log("[ollama] fallback ok");
          } else throw err2;
        }
      } else {
        // 8b ก็หมด → Ollama
        console.warn("[groq] 8b limited → ollama");
        text = await _ollamaCall(messages, maxTok);
        console.log("[ollama] fallback ok");
      }
    } else {
      throw err;
    }
  }

  const reply = sanitizeResponse(text);
  if (cacheKey) setCache(cacheKey, reply);
  return reply;
}

// ── Trip plan ─────────────────────────────────────────────────────────────────
async function generateTripPlan({ province, area, mood, budget, days, weather, people, festival, extra, lat, lng }) {
  const loc    = (lat && lng) ? `พิกัด:${lat},${lng} ` : "";
  const prompt =
    `แผนเที่ยว จ.${province} ${area||""} สไตล์:${mood} งบ:${budget}บ./คน ` +
    `${days}วัน ${people}คน อากาศ:${weather} ${festival||""} ${extra||""} ${loc}` +
    `\nตาราง เช้า/กลางวัน/เย็น/ค่ำ hidden gems ร้านอาหาร งบต่อกิจกรรม การเดินทาง`;

  let text;
  try {
    text = (await groq.chat.completions.create({
      model: MODEL_70B,
      messages: [
        { role: "system", content: "วางแผนเที่ยวไทย ตอบไทย ไม่ใช้ markdown" },
        { role: "user",   content: prompt },
      ],
      temperature: 0.7, max_tokens: 1200,
    })).choices[0].message.content;
  } catch (err) {
    if (err?.status === 429) {
      const res = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: OLLAMA_MODEL, stream: false,
        messages: [
          { role: "system", content: "วางแผนเที่ยวไทย ตอบไทย" },
          { role: "user",   content: prompt },
        ],
        options: { num_predict: 1200 },
      }, { timeout: 90000 });
      text = res.data.message.content;
    } else throw err;
  }
  return text;
}

// ── Find events ───────────────────────────────────────────────────────────────
async function findNearbyEventsGroq(location) {
  const today = new Date().toLocaleDateString("th-TH", { year:"numeric", month:"long", day:"numeric" });
  try {
    const res = await groq.chat.completions.create({
      model: MODEL_8B,
      messages: [{ role:"user", content:
        `อีเวนท์บริเวณ ${location} วันที่ ${today} ` +
        `JSON:[{"title":"","description":"","date":"","location":"","registerUrl":null}] ถ้าไม่แน่ใจ return []`
      }],
      temperature: 0.2, max_tokens: 200,
    });
    return JSON.parse(res.choices[0].message.content.replace(/```json|```/g,"").trim());
  } catch { return []; }
}

module.exports = { askGroq, generateTripPlan, findNearbyEventsGroq, SYSTEM_PROMPT };
