require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const OpenAI  = require("openai");
const path    = require("path");
const multer  = require("multer");

// ── Utils ─────────────────────────────────────────────────────────────────────
const { autoConvertFont }                                  = require("./utils/fontConvert");
const { addSlang }                                         = require("./utils/normalizeSlang");
const { findNearbyEventsAI, askGeminiRealtime }            = require("./utils/gemini");
const { extractLocationKeywords }                          = require("./utils/eventMatcher");
const { startSession, hasSession, processStep, confirmSend, cancelSession } = require("./utils/flexBuilder");
const {
  addEntry, deleteEntry, updateEntry,
  searchKnowledge, getAllEntries, buildContext
} = require("./utils/knowledge");
const {
  setupRichMenu, makePlaceCarousel,
  makePromoCarousel, makeEventCarousel, withQuickReply
} = require("./utils/lineMenu");

const app    = express();
const upload = multer({ dest: path.join(__dirname, "public") });
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Config ────────────────────────────────────────────────────────────────────
const LINE_TOKEN   = process.env.LINE_TOKEN;
const LIFF_ID      = process.env.LIFF_ID;
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const PORT         = process.env.PORT || 3000;

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  `คุณเป็นผู้ช่วยแนะนำที่กิน เที่ยว แบบเป็นกันเอง
ตอบเป็นภาษาไทยที่ถูกต้อง สุภาพ อ่านง่าย ไม่ใช้ภาษาวิบัติ
ถึงแม้ผู้ใช้จะส่งภาษาอังกฤษหรือผสม ให้ตอบเป็นภาษาไทยเสมอ
คุณเข้าใจภาษาพูด คำแสลง คำทับศัพท์ และประโยคที่พิมพ์ผิดหรือตกหล่น ให้เดาจาก context แล้วตอบเลย ไม่ต้องถามซ้ำ
การจัดรูปแบบคำตอบ:
- ตอบสั้น กระชับ ได้ใจความ อ่านแล้วเข้าใจทันที
- ถ้าแนะนำหลายอย่าง ให้แยกเป็นข้อๆ ชัดเจน
- ทุกข้อความต้องมี emoji 1-3 ตัว เข้ากับเนื้อหา
- ถ้าแนะนำสถานที่หรือร้าน ให้บอก ชื่อ / ประเภท / งบ ทุกครั้ง
สิ่งที่ห้ามทำ:
- ห้ามตอบวนเวียน ซ้ำๆ
- ห้ามใช้ภาษาวิบัติ
- ห้ามตอบยาวเกินความจำเป็น
- ห้ามถามกลับโดยไม่จำเป็น`;

const ai = new OpenAI({ baseURL: OLLAMA_URL, apiKey: "ollama" });

// ── Preprocess ────────────────────────────────────────────────────────────────
function preprocessMessage(text) {
  const thaiChars = text.match(/[\u0E00-\u0E7F]/g) || [];
  const ratio = thaiChars.length / text.length;
  const { converted, wasConverted } = ratio > 0.4
    ? { converted: text, wasConverted: false }
    : autoConvertFont(text);
  if (wasConverted) console.log(`[font] "${text}" -> "${converted}"`);
  return converted;
}

// ── Ask Ollama ────────────────────────────────────────────────────────────────
async function askOllama(userMsg) {
  const cleanMsg = preprocessMessage(userMsg);
  const hits     = searchKnowledge(cleanMsg);
  const context  = buildContext(hits);
  if (hits.length) console.log(`[kb] ${hits.length} entries`);
  const systemWithContext = context
    ? `${SYSTEM_PROMPT}\n\n---\nข้อมูลส่วนตัว:\n${context}\n---`
    : SYSTEM_PROMPT;
  const res = await ai.chat.completions.create({
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: systemWithContext },
      { role: "user",   content: cleanMsg }
    ]
  });
  return res.choices[0].message.content;
}

// ── LINE helpers ──────────────────────────────────────────────────────────────
async function sendLine(replyToken, messages) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      { replyToken, messages: Array.isArray(messages) ? messages : [messages] },
      { headers: { Authorization: `Bearer ${LINE_TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[line]", err.response?.data || err.message);
  }
}

// Push message (ส่งหาทุกคน) — ใช้สำหรับ broadcast flex
async function pushLine(userId, messages) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      { to: userId, messages: Array.isArray(messages) ? messages : [messages] },
      { headers: { Authorization: `Bearer ${LINE_TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[push]", err.response?.data || err.message);
  }
}

function textMsg(text) { return { type: "text", text }; }

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/",      (req, res) => res.send("Bot is running 🚀"));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/team",  (req, res) => res.sendFile(path.join(__dirname, "public", "team.html")));
app.get("/liff",  (req, res) => res.sendFile(path.join(__dirname, "public", "liff.html")));

// Config APIs
app.post("/config/prompt", (req, res) => {
  process.env.SYSTEM_PROMPT = req.body.prompt;
  res.json({ ok: true });
});

// อัปโหลดรูป Rich Menu
app.post("/config/richmenu-image", upload.single("image"), async (req, res) => {
  try {
    const fs = require("fs");
    fs.renameSync(req.file.path, path.join(__dirname, "public", "richmenu.png"));
    await setupRichMenu();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// อัปเดตปุ่ม Rich Menu
app.post("/config/richmenu-buttons", async (req, res) => {
  try {
    process.env.RICHMENU_BUTTONS = JSON.stringify(req.body.buttons);
    await setupRichMenu();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Carousel items — เก็บใน KB category พิเศษ
app.get("/config/carousel",     (req, res) => res.json(searchKnowledge("carousel")));
app.post("/config/carousel",    (req, res) => {
  const { title, content, tags, duration } = req.body;
  try {
    res.json({ ok: true, entry: addEntry({ title, content, category: "carousel", tags: [...(tags||[]), "carousel"], duration }) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// AI test
app.get("/ai-test", async (req, res) => {
  const msg = req.query.msg || "แนะนำที่เที่ยว";
  try { res.json({ msg, reply: await askOllama(msg) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Trip Plan
app.post("/trip-plan", async (req, res) => {
  try {
    const hits    = searchKnowledge(`${req.body.province} ${req.body.area || ""}`);
    const context = buildContext(hits);
    const { province, area, mood, budget, days, weather, people, festival, extra, lat, lng } = req.body;
    const locationContext = (lat && lng) ? `\n(พิกัด GPS ของ user: ${lat}, ${lng} — ใช้แนะนำสถานที่ที่ใกล้จริงๆ)` : "";
    const prompt = `สร้างแผนเที่ยว ${province} ${area || ""} อารมณ์: ${mood} งบ: ${budget} บาท ${days} วัน ${people} คน สภาพอากาศ: ${weather}${locationContext}${extra ? " ความต้องการพิเศษ: " + extra : ""}
แนะนำสถานที่ที่ไม่ค่อยมีคนรู้จัก จัดตารางเวลาชัดเจน บอกงบแต่ละกิจกรรม และเส้นทางเดินทาง`;
    const res2 = await ai.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: context ? `${SYSTEM_PROMPT}\n\ninsider:\n${context}` : SYSTEM_PROMPT },
        { role: "user",   content: prompt }
      ]
    });
    res.json({ ok: true, plan: res2.choices[0].message.content });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// KB API
app.get("/kb",        (req, res) => res.json(getAllEntries()));
app.post("/kb",       (req, res) => {
  const { title, content, category, tags, duration } = req.body;
  if (!title || !content) return res.status(400).json({ error: "ต้องมี title และ content" });
  try { res.json({ ok: true, entry: addEntry({ title, content, category, tags, duration }) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.put("/kb/:id",    (req, res) => {
  const u = updateEntry(req.params.id, req.body);
  if (!u) return res.status(404).json({ error: "ไม่พบ" });
  res.json({ ok: true, entry: u });
});
app.delete("/kb/:id", (req, res) => {
  if (!deleteEntry(req.params.id)) return res.status(404).json({ error: "ไม่พบ" });
  res.json({ ok: true });
});

app.post("/slang", (req, res) => {
  const { word, meaning } = req.body;
  if (!word || !meaning) return res.status(400).json({ error: "ต้องมี word และ meaning" });
  addSlang(word, meaning);
  res.json({ ok: true });
});

// ── LINE Webhook ──────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== "message") continue;

    const userId = event.source.userId;

    // ── Location Message ──────────────────────────────────────────────────────
    if (event.message.type === "location") {
      const { latitude, longitude, address, title } = event.message;
      const locationName = title || address || `พิกัด ${latitude}, ${longitude}`;
      let replyText;
      try {
        replyText = await askGeminiRealtime(
          `user อยู่แถว "${locationName}" (พิกัด: ${latitude}, ${longitude}) ค้นหาร้านอาหารอร่อยหรือที่เที่ยวน่าสนใจที่ยังเปิดอยู่ตอนนี้ใกล้เคียงหน่อยครับ ระบุชื่อร้าน ประเภท และงบด้วย`
        );
      } catch (err) {
        console.error("[ollama-location]", err.message);
        replyText = "⚠️ AI ขัดข้อง ลองใหม่นะครับ 🙏";
      }
      await sendLine(event.replyToken, [{
        type: "text",
        text: replyText,
        quickReply: {
          items: [
            { type: "action", action: { type: "message", label: "📍 ระบุพื้นที่เอง",    text: "ระบุพื้นที่" } },
            { type: "action", action: { type: "message", label: "🔄 ส่ง location ใหม่", text: "ส่ง location ใหม่" } },
            { type: "action", action: { type: "message", label: "🍜 ร้านอาหาร",         text: "แนะนำร้านอาหารอร่อยแถวนี้หน่อย" } },
            { type: "action", action: { type: "uri",     label: "🗺️ วางแผนเที่ยว",     uri: `https://liff.line.me/${LIFF_ID}` } },
          ]
        }
      }]);
      continue;
    }

    if (event.message.type !== "text") continue;

    const userText = event.message.text.trim();

    // ── Flex Builder Session ──────────────────────────────────────────────────
    if (hasSession(userId)) {
      if (userText === "ยกเลิก" || userText === "cancel") {
        cancelSession(userId);
        await sendLine(event.replyToken, [withQuickReply(textMsg("ยกเลิกแล้วครับ 👋"))]);
        continue;
      }
      if (userText === "ส่ง" || userText === "send") {
        const flex = confirmSend(userId);
        if (flex) {
          await sendLine(event.replyToken, [flex, withQuickReply(textMsg("ส่ง Flex Message แล้วครับ! ✅"))]);
        }
        continue;
      }
      const result = processStep(userId, userText);
      if (result) {
        const messages = [textMsg(result.reply)];
        if (result.flex) messages.unshift(result.flex);
        await sendLine(event.replyToken, messages);
      }
      continue;
    }

    // ── /flex command ─────────────────────────────────────────────────────────
    if (userText === "/flex" || userText === "สร้าง flex") {
      const firstQuestion = startSession(userId);
      await sendLine(event.replyToken, [textMsg("🎨 สร้าง Flex Message!\nพิมพ์ 'ยกเลิก' เพื่อหยุดได้ตลอด\n\n" + firstQuestion)]);
      continue;
    }

    // ── Special Commands ──────────────────────────────────────────────────────
    if (userText.length > 500) {
      await sendLine(event.replyToken, [withQuickReply(textMsg("กรุณาส่งข้อความสั้นกว่านี้นะ 😅"))]);
      continue;
    }

    if (userText === "ระบุพื้นที่") {
      await sendLine(event.replyToken, [textMsg(
        "📍 พิมพ์ชื่อย่าน อำเภอ หรือสถานที่ที่อยู่ตอนนี้ได้เลยครับ\n\nเช่น:\n- สยาม\n- อ่อนนุช\n- นิมมานเฮมิน เชียงใหม่\n- ถนนข้าวสาร\n- แถวเซ็นทรัลเวิลด์"
      )]);
      continue;
    }

    if (userText === "ส่ง location ใหม่") {
      await sendLine(event.replyToken, [textMsg(
        "📍 กดปุ่ม + ด้านล่าง แล้วเลือก 'ตำแหน่ง' เพื่อส่ง location ใหม่ได้เลยครับ 😊"
      )]);
      continue;
    }

    if (userText === "ติดต่อทีม") {
      await sendLine(event.replyToken, [withQuickReply(textMsg("📞 ติดต่อทีมงาน!\n\n💬 LINE: @travelteam\n📧 Email: team@travel.com\n⏰ จ-ศ 9:00-18:00 น."))]);
      continue;
    }

    if (userText === "มีโปรโมชันอะไรบ้าง") {
      const promos = searchKnowledge("โปรโมชัน ส่วนลด พิเศษ");
      await sendLine(event.replyToken, [withQuickReply(makePromoCarousel(promos))]);
      continue;
    }

    if (userText.includes("สถานที่ลับ") || userText.includes("ไม่ค่อยมีคนรู้จัก")) {
      const places = searchKnowledge("สถานที่ ที่เที่ยว ลับ hidden");
      if (places.length) {
        const carouselPlaces = places.slice(0, 10).map(p => ({
          title: p.title,
          description: p.content.slice(0, 80) + "...",
          category: p.category, emoji: "🔍", color: "#0099ff", budget: "ประหยัด",
        }));
        await sendLine(event.replyToken, [withQuickReply(makePlaceCarousel(carouselPlaces))]);
      } else {
        const reply = await askGeminiRealtime("แนะนำสถานที่ท่องเที่ยวที่ไม่ค่อยมีคนรู้จักในไทย 5 แห่ง ที่ยังเปิดให้บริการอยู่ตอนนี้");
        await sendLine(event.replyToken, [withQuickReply(textMsg(reply))]);
      }
      continue;
    }

    if (userText === "ลงทะเบียนอีเวนท์") {
      const evts = searchKnowledge("อีเวนท์ งาน เทศกาล event");
      await sendLine(event.replyToken, [withQuickReply(makeEventCarousel(evts))]);
      continue;
    }

    // ── Ollama ตอบหลัก ────────────────────────────────────────────────────────
    let replyText;
    try {
      // ใช้ Gemini real-time ค้นหาข้อมูลปัจจุบันทุกคำถาม
      const hits    = searchKnowledge(userText);
      const context = buildContext(hits);
      replyText = await askGeminiRealtime(userText, context);
    } catch (err) {
      console.error("[ollama]", err.message);
      replyText = "⚠️ AI ขัดข้องชั่วคราว ลองใหม่อีกครั้งนะครับ 🙏";
    }

    const messages = [withQuickReply(textMsg(replyText))];

    // ── Gemini หาอีเวนท์ใกล้เคียง ─────────────────────────────────────────────
    try {
      const locations = extractLocationKeywords(replyText);
      if (locations.length) {
        const aiEvents = await findNearbyEventsAI(locations.join(", "));
        if (aiEvents.length) {
          const bubbles = aiEvents.slice(0, 5).map(e => ({
            type: "bubble", size: "kilo",
            body: {
              type: "box", layout: "vertical", paddingAll: "16px",
              contents: [
                { type: "box", layout: "vertical", backgroundColor: "#f5a623", paddingAll: "10px",
                  contents: [{ type: "text", text: "📅 อีเวนท์ใกล้เคียง!", color: "#ffffff", size: "xs", weight: "bold" }] },
                { type: "text", text: e.title, weight: "bold", size: "md", wrap: true, margin: "md" },
                { type: "text", text: e.description, size: "sm", color: "#6b7280", wrap: true, margin: "sm" },
                { type: "text", text: "📆 " + e.date, size: "xs", color: "#f5a623", margin: "sm" },
                { type: "text", text: "📍 " + e.location, size: "xs", color: "#6b7280", margin: "xs" }
              ]
            },
            footer: {
              type: "box", layout: "vertical", paddingAll: "12px",
              contents: [{
                type: "button",
                action: e.registerUrl
                  ? { type: "uri",     label: "📝 ลงทะเบียนเลย!", uri: e.registerUrl }
                  : { type: "message", label: "📝 ลงทะเบียนเลย!", text: `ลงทะเบียนอีเวนท์ ${e.title}` },
                style: "primary", color: "#f5a623", height: "sm"
              }]
            }
          }));
          messages.push({ type: "flex", altText: "📅 มีอีเวนท์ใกล้เคียง!", contents: { type: "carousel", contents: bubbles } });
        }
      }
    } catch (err) {
      console.error("[gemini-event]", err.message);
    }

    await sendLine(event.replyToken, messages);
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Server running on :${PORT}`);
  console.log(`   Admin  → http://localhost:${PORT}/admin`);
  console.log(`   Team   → http://localhost:${PORT}/team`);
  console.log(`   LIFF   → http://localhost:${PORT}/liff`);
  if (!LINE_TOKEN)                 console.log("   ⚠️  LINE_TOKEN not set");
  if (!LIFF_ID)                    console.log("   ⚠️  LIFF_ID not set");
  if (!process.env.GEMINI_API_KEY) console.log("   ⚠️  GEMINI_API_KEY not set");
  try {
    const tagsUrl = OLLAMA_URL.replace(/\/v1\/?$/, "") + "/api/tags";
    const r = await axios.get(tagsUrl, { timeout: 3000 });
    const models = (r.data.models || []).map(m => m.name);
    if (models.some(n => n === OLLAMA_MODEL || n.startsWith(OLLAMA_MODEL + ":"))) {
      console.log(`   ✅ Ollama — "${OLLAMA_MODEL}" พร้อม`);
    } else {
      console.log(`   ⚠️  ไม่พบ model "${OLLAMA_MODEL}"`);
    }
  } catch { console.log(`   ❌ Ollama ไม่ได้รัน`); }
  if (LINE_TOKEN && LIFF_ID) {
    console.log("   🎨 สร้าง Rich Menu...");
    await setupRichMenu();
  }
});