require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const path    = require("path");
const multer  = require("multer");

// ── Utils ─────────────────────────────────────────────────────────────────────
const { autoConvertFont }          = require("./utils/fontConvert");
const { addSlang }                 = require("./utils/normalizeSlang");
const { askGroq, generateTripPlan, findNearbyEventsGroq } = require("./utils/groq");
const { extractLocationKeywords }  = require("./utils/eventMatcher");
const { startSession, hasSession, processStep, confirmSend, cancelSession } = require("./utils/flexBuilder");
const {
  addEntry, deleteEntry, updateEntry,
  searchKnowledge, getAllEntries, buildContext
} = require("./utils/knowledge");
const {
  setupRichMenu, makePlaceCarousel,
  makePromoCarousel, makeEventCarousel, makeBranchCarousel, withQuickReply
} = require("./utils/lineMenu");

const app    = express();
const upload = multer({ dest: path.join(__dirname, "public") });
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Config ────────────────────────────────────────────────────────────────────
const LINE_TOKEN = process.env.LINE_TOKEN;
const LIFF_ID    = process.env.LIFF_ID;
const PORT       = process.env.PORT || 3000;

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

const majorMap = {
  MTE: "ครุศาสตร์เครื่องกล Mechanical Technology Education",
  ETE: "ครุศาสตร์ไฟฟ้า Electrical Technology Education",
  CTE: "ครุศาสตร์โยธา Civil Technology Education",
  IED: "ครุศาสตร์อุตสาหการ Industrial Technology Education",
  PPT: "เทคโนโลยีการพิมพ์และบรรจุภัณฑ์ Printing and Packaging Technology",
  ECT: "เทคโนโลยีและสื่อสารการศึกษา Educational Communications and Technology",
};
const BRANCHES = {
  MTE: "ครุศาสตร์เครื่องกล (Mechanical Technology Education)",
  ETE: "ครุศาสตร์ไฟฟ้า (Electrical Technology Education)",
  CTE: "ครุศาสตร์โยธา (Civil Technology Education)",
  IED: "ครุศาสตร์อุตสาหการ (Industrial Technology Education)",
  PPT: "เทคโนโลยีการพิมพ์และบรรจุภัณฑ์ (Printing and Packaging Technology)",
  ECT: "เทคโนโลยีและสื่อสารการศึกษา (Educational Communications and Technology)",
};

// ── Ask AI (Groq + KB context) ───────────────────────────────────────────────
const { searchRAG, isRAGReady } = require("./utils/rag");

function buildRagQuery(cleanMsg) {
  const upperMsg = cleanMsg.trim().toUpperCase();
  const majorKey = Object.keys(majorMap).find(code => upperMsg.includes(code));

  const topicHints = [];

  if (cleanMsg.includes("เรียนอะไร") || cleanMsg.includes("รายวิชา") || cleanMsg.includes("วิชาบังคับ")) {
    topicHints.push("รายวิชา หมวดวิชาเฉพาะ วิชาบังคับ หน่วยกิต โครงสร้างหลักสูตร");
  }

  if (cleanMsg.includes("คุณสมบัติ") || cleanMsg.includes("สมัคร") || cleanMsg.includes("รับเข้า")) {
    topicHints.push("คุณสมบัติผู้สมัคร การรับเข้าศึกษา แผนการรับ เกณฑ์การรับสมัคร");
  }

  if (cleanMsg.includes("จบแล้ว") || cleanMsg.includes("อาชีพ") || cleanMsg.includes("ทำงาน")) {
    topicHints.push("อาชีพหลังสำเร็จการศึกษา แนวทางประกอบอาชีพ ผลลัพธ์การเรียนรู้");
  }

  if (!majorKey) return `${cleanMsg} ${topicHints.join(" ")}`.trim();

  return [
    cleanMsg,
    majorKey,
    majorMap[majorKey],
    ...topicHints,
  ].join(" ");
}

async function askAI(userMsg) {
  const cleanMsg = preprocessMessage(userMsg);
  const queryMsg = buildRagQuery(cleanMsg);

  const hits = searchKnowledge(queryMsg);
  const context = buildContext(hits);

  let ragContext = null;
  const ragReady = await isRAGReady();

  if (ragReady) {
    ragContext = await searchRAG(queryMsg);
    console.log("[rag] query:", queryMsg);
    console.log("[rag] ready:", ragReady, "found:", !!ragContext, "length:", ragContext?.length || 0);
  } else {
    console.log("[rag] not ready");
  }

  const fullContext = [context, ragContext].filter(Boolean).join("\n\n---\n\n");

  return askGroq(cleanMsg, fullContext || null);
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

function textMsg(text) { return { type: "text", text }; }

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/",      (req, res) => res.send("Bot is running 🚀"));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/team",  (req, res) => res.sendFile(path.join(__dirname, "public", "team.html")));
app.get("/liff", (req, res) => {
  const html = require("fs").readFileSync(
    path.join(__dirname, "public", "liff.html"), "utf8"
  ).replace("window.__LIFF_ID__ || \"\"", `"${LIFF_ID}"`);
  res.send(html);
});

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

// AI test
app.get("/ai-test", async (req, res) => {
  const msg = req.query.msg || "แนะนำที่เที่ยวใกล้กรุงเทพ";
  try { res.json({ msg, reply: await askAI(msg) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Trip Plan จาก LIFF
app.post("/trip-plan", async (req, res) => {
  try {
    const plan = await generateTripPlan(req.body);
    res.json({ ok: true, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── KB API ────────────────────────────────────────────────────────────────────
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
        replyText = await askAI(
          `user อยู่แถว "${locationName}" (พิกัด: ${latitude}, ${longitude}) แนะนำร้านอาหารอร่อยหรือที่เที่ยวน่าสนใจใกล้เคียงหน่อยครับ ระบุชื่อร้าน ประเภท และงบด้วย`
        );
      } catch (err) {
        console.error("[groq-location]", err.message);
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
        if (flex) await sendLine(event.replyToken, [flex, withQuickReply(textMsg("ส่ง Flex Message แล้วครับ! ✅"))]);
        continue;
      }
      const result = processStep(userId, userText);
      if (result) {
        const msgs = [textMsg(result.reply)];
        if (result.flex) msgs.unshift(result.flex);
        await sendLine(event.replyToken, msgs);
      }
      continue;
    }

    // ── /flex command ─────────────────────────────────────────────────────────
    if (userText === "/flex" || userText === "สร้าง flex") {
      const firstQ = startSession(userId);
      await sendLine(event.replyToken, [textMsg("🎨 สร้าง Flex Message!\nพิมพ์ 'ยกเลิก' เพื่อหยุดได้ตลอด\n\n" + firstQ)]);
      continue;
    }

    // ── Special Commands ──────────────────────────────────────────────────────
    if (["เมนู", "เลือกสาขา", "ข้อมูลหลักสูตร", "หลักสูตร", "สาขา"].includes(userText)) {
      await sendLine(event.replyToken, [makeBranchCarousel()]);
      continue;
    }

    // ── 6 สาขา ───────────────────────────────────────────────────────────────
    const branchMatch = userText.match(/(?:ข้อมูลหลักสูตร\s*)?(MTE|ETE|CTE|IEd|IED|PPT|ECT)\b/i);
    if (branchMatch) {
      const branchCode = branchMatch[1].toUpperCase();
      const branchName = BRANCHES[branchCode];
      const reply = await askAI(`ข้อมูลหลักสูตร ${branchCode} ${branchName}`);
      await sendLine(event.replyToken, [withQuickReply(textMsg(reply))]);
      continue;
    }

    // ข้อความจาก LIFF trip plan (ยาว / มี markdown) — ไม่ตอบ
    if (
      userText.startsWith("**เช้า") ||
      userText.startsWith("**กลางวัน") ||
      userText.startsWith("**เย็น") ||
      userText.startsWith("**ค่ำ") ||
      userText.startsWith("## วัน") ||
      userText.startsWith("# แผนเที่ยว") ||
      userText.length > 800
    ) {
      continue;
    }

    if (userText.length > 500) {
      await sendLine(event.replyToken, [withQuickReply(textMsg("กรุณาส่งข้อความสั้นกว่านี้นะ 😅"))]);
      continue;
    }

    if (userText === "ระบุพื้นที่") {
      await sendLine(event.replyToken, [textMsg(
        "📍 พิมพ์ชื่อย่าน อำเภอ หรือสถานที่ที่อยู่ตอนนี้ได้เลยครับ\n\nเช่น:\n- สยาม\n- อ่อนนุช\n- นิมมานเฮมิน เชียงใหม่\n- ถนนข้าวสาร"
      )]);
      continue;
    }

    if (userText === "ส่ง location ใหม่") {
      await sendLine(event.replyToken, [textMsg("📍 กดปุ่ม + ด้านล่าง แล้วเลือก 'ตำแหน่ง' เพื่อส่ง location ใหม่ได้เลยครับ 😊")]);
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
          description: p.content.slice(0, 80) + (p.content.length > 80 ? "..." : ""),
          category: p.category, emoji: "🔍", color: "#0099ff", budget: "ประหยัด",
        }));
        await sendLine(event.replyToken, [withQuickReply(makePlaceCarousel(carouselPlaces))]);
      } else {
        const reply = await askAI("แนะนำสถานที่ท่องเที่ยวที่ไม่ค่อยมีคนรู้จักในไทย 5 แห่ง");
        await sendLine(event.replyToken, [withQuickReply(textMsg(reply))]);
      }
      continue;
    }

    if (userText === "ลงทะเบียนอีเวนท์") {
      const evts = searchKnowledge("อีเวนท์ งาน เทศกาล event");
      await sendLine(event.replyToken, [withQuickReply(makeEventCarousel(evts))]);
      continue;
    }

    // ── Groq ตอบหลัก ─────────────────────────────────────────────────────────
    let replyText;
    try {
      replyText = await askAI(userText);
    } catch (err) {
      console.error("[groq]", err.message);
      replyText = "⚠️ AI ขัดข้องชั่วคราว ลองใหม่อีกครั้งนะครับ 🙏";
    }

    const messages = [withQuickReply(textMsg(replyText))];

    // ── หาอีเวนท์ใกล้เคียง ───────────────────────────────────────────────────
    try {
      const locations = extractLocationKeywords(replyText);
      if (locations.length) {
        const aiEvents = await findNearbyEventsGroq(locations.join(", "));
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
      console.error("[event]", err.message);
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
  console.log(`   AI     → ${process.env.AI_PROVIDER || "groq"}`);
  if (!LINE_TOKEN)              console.log("   ⚠️  LINE_TOKEN not set");
  if (!LIFF_ID)                 console.log("   ⚠️  LIFF_ID not set");
  if (!process.env.GROQ_API_KEY) console.log("   ⚠️  GROQ_API_KEY not set");
  if (LINE_TOKEN && LIFF_ID) {
    console.log("   🎨 สร้าง Rich Menu...");
    await setupRichMenu();
  }
});


