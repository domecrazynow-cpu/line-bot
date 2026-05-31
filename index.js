require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const path    = require("path");
const multer  = require("multer");
const crypto  = require("crypto");
const fs      = require("fs");

// ── Utils ─────────────────────────────────────────────────────────────────────
const { autoConvertFont }          = require("./utils/fontConvert");
const { addSlang, normalizeSlang } = require("./utils/normalizeSlang");
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
app.use(express.json({ verify: verifyLineSignature }));
app.use(express.static(path.join(__dirname, "public")));

// ── Config ────────────────────────────────────────────────────────────────────
const LINE_TOKEN          = process.env.LINE_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const ADMIN_SECRET        = process.env.ADMIN_SECRET;
const LIFF_ID             = process.env.LIFF_ID;
const PORT                = process.env.PORT || 3000;

// ── Middleware: LINE signature verification ───────────────────────────────────
function verifyLineSignature(req, res, buf) {
  req.rawBody = buf;
}

function requireLineSignature(req, res, next) {
  if (!LINE_CHANNEL_SECRET) return next();
  const sig = req.headers["x-line-signature"];
  if (!sig) return res.sendStatus(401);
  const expected = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");
  if (sig !== expected) return res.sendStatus(401);
  next();
}

// ── Middleware: admin routes auth ─────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!ADMIN_SECRET) return next();
  const token = req.headers["x-admin-secret"] || req.query.secret;
  if (token !== ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  next();
}

// ── Preprocess ────────────────────────────────────────────────────────────────
function preprocessMessage(text) {
  const slangNormalized = normalizeSlang(text);
  const thaiChars = slangNormalized.match(/[\u0E00-\u0E7F]/g) || [];
  const ratio = thaiChars.length / slangNormalized.length;
  const { converted, wasConverted } = ratio > 0.4
    ? { converted: slangNormalized, wasConverted: false }
    : autoConvertFont(slangNormalized);
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
  CIT: "คอมพิวเตอร์และเทคโนโลยีสารสนเทศ Computer and Information Technology",
  ITE: "เทคโนโลยีอุตสาหกรรม Industrial Technology",
};
const BRANCHES = {
  MTE: "ครุศาสตร์เครื่องกล (Mechanical Technology Education)",
  ETE: "ครุศาสตร์ไฟฟ้า (Electrical Technology Education)",
  CTE: "ครุศาสตร์โยธา (Civil Technology Education)",
  IED: "ครุศาสตร์อุตสาหการ (Industrial Technology Education)",
  PPT: "เทคโนโลยีการพิมพ์และบรรจุภัณฑ์ (Printing and Packaging Technology)",
  ECT: "เทคโนโลยีและสื่อสารการศึกษา (Educational Communications and Technology)",
  CIT: "คอมพิวเตอร์และเทคโนโลยีสารสนเทศ (Computer and Information Technology)",
  ITE: "เทคโนโลยีอุตสาหกรรม (Industrial Technology)",
};
const majorAliases = [
  { code: "MTE", terms: ["MTE", "ครูเครื่องกล", "เครื่องกล", "ครุศาสตร์เครื่องกล", "mechanical"] },
  { code: "ETE", terms: ["ETE", "ครูไฟฟ้า", "ไฟฟ้า", "ครุศาสตร์ไฟฟ้า", "electrical"] },
  { code: "CTE", terms: ["CTE", "ครูโยธา", "โยธา", "ครุศาสตร์โยธา", "civil"] },
  { code: "IED", terms: ["IED", "IEd", "ครูอุต", "อุตสาหการ", "ครุศาสตร์อุตสาหการ", "industrial education"] },
  { code: "PPT", terms: ["PPT", "การพิมพ์", "บรรจุภัณฑ์", "พิมพ์", "printing", "packaging"] },
  { code: "ECT", terms: ["ECT", "สื่อสารการศึกษา", "เทคโนโลยีและสื่อสาร", "educational communications", "เทคโนโลยีดิจิทัล"] },
  { code: "CIT", terms: ["CIT", "คอมพิวเตอร์", "computer", "เทคโนโลยีสารสนเทศ", "information technology", "มัลติมีเดีย", "multimedia"] },
  { code: "ITE", terms: ["ITE", "เทคโนโลยีอุตสาหกรรม", "industrial technology", "ทล.บ"] },
];

function detectMajorKey(text) {
  const raw = text.trim();
  const upper = raw.toUpperCase();

  for (const code of Object.keys(majorMap)) {
    if (upper.includes(code)) return code;
  }

  const lower = raw.toLowerCase();
  const found = majorAliases.find(({ terms }) =>
    terms.some(term => lower.includes(term.toLowerCase()))
  );

  return found?.code || null;
}

// ── Ask AI (Groq + KB context) ───────────────────────────────────────────────
const { searchRAG, isRAGReady }                       = require("./utils/rag");
const { updateProfile, buildProfileContext, getTopProgram } = require("./utils/userProfile");
const { getFallback, getComparisonOverview }           = require("./utils/fallback");
const {
  isExpired, addMessage, getGroqHistory,
  detectConfusion, buildSummary, endSession, getTurnCount,
} = require("./utils/chatSession");

function buildRagQuery(cleanMsg) {
  const majorKey = detectMajorKey(cleanMsg);
  const topicHints = [];

  if (
    cleanMsg.includes("เรียนอะไร") ||
    cleanMsg.includes("เรียนไร") ||
    cleanMsg.includes("เรียนบ้าง") ||
    cleanMsg.includes("รายวิชา") ||
    cleanMsg.includes("วิชาบังคับ") ||
    cleanMsg.includes("กี่วิชา")
  ) {
    topicHints.push("รายวิชา วิชาบังคับ วิชาเฉพาะ หน่วยกิต โครงสร้างหลักสูตร แผนการเรียน");
  }

  if (cleanMsg.includes("ยาก") || cleanMsg.includes("ระวัง") || cleanMsg.includes("ไม่ควรขาด") || cleanMsg.includes("ขาด")) {
    topicHints.push("รายวิชาสำคัญ วิชาพื้นฐาน วิชาต่อเนื่อง เงื่อนไขรายวิชา แผนการเรียน");
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
/**
 * @param {string}      userMsg
 * @param {string|null} userId      - LINE userId
 * @param {boolean}     isConfused  - ให้บอทสรุปสิ่งที่คุยมา
 */
async function askAI(userMsg, userId = null, isConfused = false) {
  const cleanMsg = preprocessMessage(userMsg);
  const queryMsg = buildRagQuery(cleanMsg);
  const majorKey = detectMajorKey(cleanMsg);

  // ── อัปเดตโปรไฟล์ user ───────────────────────────────────────────────────
  if (userId) updateProfile(userId, majorKey, cleanMsg);
  const profileContext = userId ? buildProfileContext(userId) : null;

  // ── Conversation history ──────────────────────────────────────────────────
  const history = userId ? getGroqHistory(userId) : [];

  // ── ถ้า user ดูสับสน → เติม instruction ก่อนคำถาม ────────────────────────
  let finalMsg = cleanMsg;
  if (isConfused && userId) {
    const pastQ = history
      .filter(m => m.role === "user").slice(-4)
      .map(m => `"${m.content}"`).join(", ");
    finalMsg = `[ผู้ใช้ดูสับสน] คำถามที่ผ่านมา: ${pastQ}\nข้อความล่าสุด: ${cleanMsg}\n→ กรุณาทวนสรุปสิ่งที่คุยมา แล้วถามให้ชัดว่าต้องการอะไร`;
  }

  // ── Knowledge Base ────────────────────────────────────────────────────────
  const hits    = searchKnowledge(queryMsg);
  const context = buildContext(hits);

  // ── RAG ───────────────────────────────────────────────────────────────────
  let ragContext = null;
  const ragReady = await isRAGReady();

  if (ragReady) {
    ragContext = await searchRAG(queryMsg, majorKey || null);
    console.log("[rag] query:", queryMsg.slice(0, 80));
    console.log("[rag] program:", majorKey || "none", "| found:", !!ragContext, "| len:", ragContext?.length || 0);
  } else {
    console.log("[rag] not ready");
  }

  // ── Fallback เมื่อ RAG ไม่พบข้อมูล ───────────────────────────────────────
  if (!ragContext && majorKey) {
    const fb = getFallback(majorKey);
    if (fb) {
      console.log(`[fallback] static fallback for ${majorKey}`);
      ragContext = fb;
    }
  }

  const fullContext = [context, ragContext].filter(Boolean).join("\n\n---\n\n");

  // ── เรียก Groq — turn แรกของ session = 70b (quality), follow-up = 8b (save tokens)
  const isFollowUp = history.length > 0;
  const reply = await askGroq(finalMsg, fullContext || null, profileContext, history, isFollowUp);

  // ── บันทึก turn ลง session ────────────────────────────────────────────────
  if (userId) {
    addMessage(userId, "user",      cleanMsg);
    addMessage(userId, "assistant", reply);
  }

  return reply;
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
  const html = fs.readFileSync(
    path.join(__dirname, "public", "liff.html"), "utf8"
  ).replace("window.__LIFF_ID__ || \"\"", `"${LIFF_ID}"`);
  res.send(html);
});

app.post("/config/prompt", requireAdmin, (req, res) => {
  process.env.SYSTEM_PROMPT = req.body.prompt;
  res.json({ ok: true });
});

// อัปโหลดรูป Rich Menu
app.post("/config/richmenu-image", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "ไม่มีไฟล์" });
    const allowed = ["image/png", "image/jpeg"];
    if (!allowed.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "อนุญาตเฉพาะ PNG หรือ JPEG เท่านั้น" });
    }
    fs.renameSync(req.file.path, path.join(__dirname, "public", "richmenu.png"));
    await setupRichMenu();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// อัปเดตปุ่ม Rich Menu
app.post("/config/richmenu-buttons", requireAdmin, async (req, res) => {
  try {
    process.env.RICHMENU_BUTTONS = JSON.stringify(req.body.buttons);
    await setupRichMenu();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI test
app.get("/ai-test", requireAdmin, async (req, res) => {
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
app.get("/kb",        requireAdmin, (req, res) => res.json(getAllEntries()));
app.post("/kb",       requireAdmin, (req, res) => {
  const { title, content, category, tags, duration } = req.body;
  if (!title || !content) return res.status(400).json({ error: "ต้องมี title และ content" });
  try { res.json({ ok: true, entry: addEntry({ title, content, category, tags, duration }) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.put("/kb/:id",    requireAdmin, (req, res) => {
  const u = updateEntry(req.params.id, req.body);
  if (!u) return res.status(404).json({ error: "ไม่พบ" });
  res.json({ ok: true, entry: u });
});
app.delete("/kb/:id", requireAdmin, (req, res) => {
  if (!deleteEntry(req.params.id)) return res.status(404).json({ error: "ไม่พบ" });
  res.json({ ok: true });
});

app.post("/slang", requireAdmin, (req, res) => {
  const { word, meaning } = req.body;
  if (!word || !meaning) return res.status(400).json({ error: "ต้องมี word และ meaning" });
  addSlang(word, meaning);
  res.json({ ok: true });
});

// ── LINE Webhook ──────────────────────────────────────────────────────────────
async function handleEvent(event) {
    if (event.type !== "message") return;

    const userId = event.source.userId;

    // ── Session timeout: ถ้าไม่ active นาน 15 นาที → จบ session เก่า ─────────
    if (userId && isExpired(userId)) {
      const summary = endSession(userId);
      if (summary && summary.questions.length > 0) {
        // บันทึกสรุป session ลง profile (เพื่อใช้อ้างอิงในอนาคต)
        updateProfile(userId, null, `[session summary: ${summary.questions.slice(0, 3).join(" | ")}]`);
        console.log(`[session] timeout → saved summary (${summary.durationMin} min, ${summary.questions.length} q)`);
      }
    }

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
      return;
    }

    if (event.message.type !== "text") return;
    const userText = event.message.text.trim();

    // ── Flex Builder Session ──────────────────────────────────────────────────
    if (hasSession(userId)) {
      if (userText === "ยกเลิก" || userText === "cancel") {
        cancelSession(userId);
        await sendLine(event.replyToken, [withQuickReply(textMsg("ยกเลิกแล้วครับ 👋"))]);
        return;
      }
      if (userText === "ส่ง" || userText === "send") {
        const flex = confirmSend(userId);
        if (flex) await sendLine(event.replyToken, [flex, withQuickReply(textMsg("ส่ง Flex Message แล้วครับ! ✅"))]);
        return;
      }
      const result = processStep(userId, userText);
      if (result) {
        const msgs = [textMsg(result.reply)];
        if (result.flex) msgs.unshift(result.flex);
        await sendLine(event.replyToken, msgs);
      }
      return;
    }

    // ── /flex command ─────────────────────────────────────────────────────────
    if (userText === "/flex" || userText === "สร้าง flex") {
      const firstQ = startSession(userId);
      await sendLine(event.replyToken, [textMsg("🎨 สร้าง Flex Message!\nพิมพ์ 'ยกเลิก' เพื่อหยุดได้ตลอด\n\n" + firstQ)]);
      return;
    }

    // ── Special Commands ──────────────────────────────────────────────────────
    if (["เมนู", "เลือกสาขา", "ข้อมูลหลักสูตร", "หลักสูตร", "สาขา", "เมนูหลักสูตร"].includes(userText)) {
      await sendLine(event.replyToken, [makeBranchCarousel()]);
      return;
    }

    if (userText === "ค่าเทอม" || userText === "ค่าธรรมเนียม") {
      const reply = await askAI("ค่าเทอม ค่าธรรมเนียมการศึกษา FIET แต่ละสาขา", userId);
      await sendLine(event.replyToken, [withQuickReply(textMsg(reply))]);
      return;
    }

    if (userText === "ติดต่อคณะ") {
      const reply = await askAI("ข้อมูลติดต่อคณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี FIET KMUTT", userId);
      await sendLine(event.replyToken, [withQuickReply(textMsg(reply))]);
      return;
    }

    // ── 8 สาขา ───────────────────────────────────────────────────────────────
    const branchMatch = userText.match(/(?:ข้อมูลหลักสูตร\s*)?(MTE|ETE|CTE|IEd|IED|PPT|ECT|CIT|ITE)\b/i);
    if (branchMatch) {
      const branchCode = branchMatch[1].toUpperCase();
      const branchName = BRANCHES[branchCode];
      const reply = await askAI(`ข้อมูลหลักสูตร ${branchCode} ${branchName}`, userId);
      await sendLine(event.replyToken, [withQuickReply(textMsg(reply))]);
      return;
    }

    // ข้อความจาก LIFF trip plan (ยาว / มี markdown) — ไม่ตอบ
    if (
      userText.startsWith("**เช้า") ||
      userText.startsWith("**กลางวัน") ||
      userText.startsWith("**เย็น") ||
      userText.startsWith("**ค่ำ") ||
      userText.startsWith("## วัน") ||
      userText.startsWith("# แผนเที่ยว")
    ) {
      return;
    }

    if (userText.length > 500) {
      await sendLine(event.replyToken, [withQuickReply(textMsg("กรุณาส่งข้อความสั้นกว่านี้นะ 😅"))]);
      return;
    }

    if (userText === "ระบุพื้นที่") {
      await sendLine(event.replyToken, [textMsg(
        "📍 พิมพ์ชื่อย่าน อำเภอ หรือสถานที่ที่อยู่ตอนนี้ได้เลยครับ\n\nเช่น:\n- สยาม\n- อ่อนนุช\n- นิมมานเฮมิน เชียงใหม่\n- ถนนข้าวสาร"
      )]);
      return;
    }

    if (userText === "ส่ง location ใหม่") {
      await sendLine(event.replyToken, [textMsg("📍 กดปุ่ม + ด้านล่าง แล้วเลือก 'ตำแหน่ง' เพื่อส่ง location ใหม่ได้เลยครับ 😊")]);
      return;
    }

    if (userText === "ติดต่อทีม") {
      await sendLine(event.replyToken, [withQuickReply(textMsg("📞 ติดต่อทีมงาน!\n\n💬 LINE: @travelteam\n📧 Email: team@travel.com\n⏰ จ-ศ 9:00-18:00 น."))]);
      return;
    }

    if (userText === "มีโปรโมชันอะไรบ้าง") {
      const promos = searchKnowledge("โปรโมชัน ส่วนลด พิเศษ");
      await sendLine(event.replyToken, [withQuickReply(makePromoCarousel(promos))]);
      return;
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
      return;
    }

    if (userText === "ลงทะเบียนอีเวนท์") {
      const evts = searchKnowledge("อีเวนท์ งาน เทศกาล event");
      await sendLine(event.replyToken, [withQuickReply(makeEventCarousel(evts))]);
      return;
    }

    // ── เปรียบเทียบสาขา ────────────────────────────────────────────────────────
    const isCompareAll = (
      userText === "เทียบทุกสาขา" ||
      userText === "เทียบกับทุกสาขา" ||
      userText === "เปรียบเทียบทุกสาขา" ||
      (userText.includes("เทียบ") && (userText.includes("ทุกสาขา") || userText.includes("ทุกหลักสูตร"))) ||
      (userText.includes("เปรียบเทียบ") && userText.includes("สาขา"))
    );
    if (isCompareAll) {
      // ถ้าถามเฉพาะด้าน เช่น "เทียบอาชีพ" / "เทียบค่าเทอม"
      const wantCareer = /อาชีพ|งาน|ทำงาน/.test(userText);
      const wantFees   = /ค่าเทอม|ค่าใช้จ่าย|ทุน/.test(userText);
      const wantCourse = /วิชา|การเรียน|หน่วยกิต/.test(userText);

      let prompt;
      if (wantFees) {
        prompt = "ผู้ใช้ถามเรื่องค่าเทอมเปรียบเทียบทุกสาขา FIET ให้บอกตรงๆ ว่าไม่มีข้อมูลค่าเทอมในเอกสาร และแนะนำให้ติดต่อคณะ FIET KMUTT โดยตรงเพื่อขอข้อมูลล่าสุด";
      } else if (wantCareer) {
        prompt = "เปรียบเทียบอาชีพหลังสำเร็จการศึกษาของทุกสาขา FIET ทั้ง 8 สาขา ตอบเป็น bullet สาขาละ 1 บรรทัด สั้นกระชับ";
      } else if (wantCourse) {
        prompt = "เปรียบเทียบเนื้อหาการเรียนของทุกสาขา FIET ทั้ง 8 สาขา ตอบเป็น bullet สาขาละ 1 บรรทัด เน้นจุดต่างของแต่ละสาขา";
      } else {
        prompt = "ผู้ใช้ต้องการเปรียบเทียบภาพรวมทุกสาขา FIET ให้ตอบแบ่งเป็น 2 กลุ่ม (ค.อ.บ. และ ทล.บ.) สาขาละ 1 บรรทัดบอกจุดเด่น แล้วถามว่าอยากเจาะลึกด้านไหน (อาชีพ / เนื้อหาการเรียน / สาขาใดสาขาหนึ่ง)";
      }
      const overview = getComparisonOverview();
      let replyText;
      try { replyText = await askAI(prompt, userId); }
      catch (err) { replyText = "⚠️ AI ขัดข้องชั่วคราว ลองใหม่นะครับ 🙏"; }
      // ถ้า AI ตอบสั้นเกินไปหรือไม่มีเนื้อหา fallback ไปใช้ข้อมูล static
      if (!replyText || replyText.length < 50) {
        replyText = "เปรียบเทียบ 8 สาขา FIET 📊\n\nกลุ่ม ค.อ.บ. (ครูช่าง):\n- MTE เครื่องกล, ETE ไฟฟ้า, CTE โยธา, IED อุตสาหการ, ECT สื่อสารการศึกษา\n\nกลุ่ม ทล.บ. (เทคโนโลยี):\n- PPT การพิมพ์, CIT คอมพิวเตอร์, ITE อุตสาหกรรม\n\nอยากเจาะลึกด้านไหนครับ? (อาชีพ / เนื้อหาการเรียน / สาขาใดสาขาหนึ่ง)";
      }
      await sendLine(event.replyToken, [withQuickReply(textMsg(replyText))]);
      return;
    }

    // ── สำรวจเพิ่มเติม: "มีไรอีกน่าสนใจ" / "อยากรู้เรื่องอื่น" ──────────────
    if (
      userText.includes("มีไรอีก") ||
      userText.includes("อะไรอีก") ||
      userText.includes("น่าสนใจอีก") ||
      userText.includes("เรื่องอื่น") ||
      userText.includes("หัวข้ออื่น") ||
      userText.includes("นอกจากนี้") ||
      (userText.includes("น่าสนใจ") && userText.includes("อีก"))
    ) {
      const topProgram = getTopProgram(userId);
      const history    = userId ? getGroqHistory(userId) : [];
      const seenCodes  = [...new Set(
        history.filter(m => m.role === "user")
               .map(m => detectMajorKey(m.content))
               .filter(Boolean)
      )];
      const unseen = Object.keys(majorMap).filter(c => !seenCodes.includes(c));

      let prompt;
      if (seenCodes.length > 0) {
        const seenNames = seenCodes.map(c => `${c} (${majorMap[c].split(" ")[0]})`).join(", ");
        const unseenSample = unseen.slice(0, 3).map(c => `${c}`).join(", ");
        prompt = `ผู้ใช้เคยถามเรื่อง ${seenNames} แล้ว ตอนนี้อยากรู้ว่า "มีไรอีกน่าสนใจ" ใน FIET\nให้แนะนำสาขาอื่นที่ยังไม่ได้คุย (เช่น ${unseenSample}) สั้นๆ สาขาละ 1 บรรทัด ไม่เกิน 3 สาขา แล้วถามว่าสนใจสาขาไหน`;
      } else {
        prompt = `ผู้ใช้ถามว่า "มีไรน่าสนใจ" ใน FIET ให้แนะนำ 3 สาขาที่น่าสนใจ สาขาละ 1 บรรทัด แล้วถามว่าสนใจสาขาไหน`;
      }
      let replyText;
      try { replyText = await askAI(prompt, userId); }
      catch (err) { replyText = "⚠️ AI ขัดข้องชั่วคราว ลองใหม่นะครับ 🙏"; }
      await sendLine(event.replyToken, [withQuickReply(textMsg(replyText))]);
      return;
    }

    // ── แนะนำสาขา: "ไปต่อสายไหนดี" ──────────────────────────────────────────
    if (
      userText === "ไปต่อสายไหนดี" ||
      userText === "แนะนำสาขา" ||
      userText === "ช่วยเลือกสาขา" ||
      userText.includes("ต่อสายไหนดี") ||
      userText.includes("เลือกสาขาอะไรดี")
    ) {
      const topProgram = getTopProgram(userId);
      const turnCount  = getTurnCount(userId);
      let prompt;
      if (topProgram && turnCount >= 2) {
        prompt = `ผู้ใช้ถามว่า "ไปต่อสายไหนดี" จากการสนทนา ดูเหมือนสนใจสาขา ${topProgram} (${majorMap[topProgram]}) ให้สรุปสั้นๆ ว่าสาขานี้เหมาะกับคนแบบไหน แล้วถามถึงพื้นฐานหรือเป้าหมายอาชีพของผู้ใช้`;
      } else {
        prompt = `ผู้ใช้ถามว่า "ไปต่อสายไหนดี" ให้แนะนำว่า FIET มี 8 สาขา แต่ละสาขาเหมาะกับความสนใจต่างกัน แล้วถามว่าผู้ใช้ชอบด้านไหน หรือมีพื้นฐานด้านอะไรมาก่อน`;
      }
      let replyText;
      try { replyText = await askAI(prompt, userId); }
      catch (err) { replyText = "⚠️ AI ขัดข้องชั่วคราว ลองใหม่นะครับ 🙏"; }
      await sendLine(event.replyToken, [withQuickReply(textMsg(replyText))]);
      return;
    }

    // ── ตรวจความสับสน: ถ้า user งง/ถามซ้ำ → ให้บอทสรุป ──────────────────────
    const confused = userId ? detectConfusion(userId, userText) : false;

    // ── Groq ตอบหลัก ─────────────────────────────────────────────────────────
    let replyText;
    try {
      replyText = await askAI(userText, userId, confused);
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

app.post("/webhook", requireLineSignature, async (req, res) => {
  res.sendStatus(200);
  const events = req.body.events || [];
  await Promise.all(events.map(event => handleEvent(event).catch(err =>
    console.error("[webhook-event]", err.message)
  )));
});

// ── Ollama: pull chat model ตอน startup (background) ─────────────────────────
async function ensureOllamaChatModel() {
  const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434";
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
  try {
    // ตรวจสอบว่า model มีอยู่แล้วหรือยัง
    const { data } = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    const exists = (data.models || []).some(m => m.name.startsWith(OLLAMA_MODEL.split(":")[0]));
    if (exists) {
      console.log(`[ollama] model ${OLLAMA_MODEL} ready ✓`);
      return;
    }
    // ยังไม่มี → pull (ใช้เวลาสักครู่)
    console.log(`[ollama] pulling ${OLLAMA_MODEL} (fallback model)...`);
    await axios.post(`${OLLAMA_URL}/api/pull`, { name: OLLAMA_MODEL }, { timeout: 300000 });
    console.log(`[ollama] ${OLLAMA_MODEL} pulled ✓`);
  } catch (err) {
    console.warn(`[ollama] model check failed: ${err.message}`);
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Server running on :${PORT}`);
  console.log(`   Admin  → http://localhost:${PORT}/admin`);
  console.log(`   Team   → http://localhost:${PORT}/team`);
  console.log(`   LIFF   → http://localhost:${PORT}/liff`);
  console.log(`   AI     → ${process.env.AI_PROVIDER || "groq → ollama fallback"}`);
  if (!LINE_TOKEN)               console.log("   ⚠️  LINE_TOKEN not set");
  if (!LIFF_ID)                  console.log("   ⚠️  LIFF_ID not set");
  if (!process.env.GROQ_API_KEY) console.log("   ⚠️  GROQ_API_KEY not set");

  // ตรวจ/pull ollama fallback model หลังจาก 15 วินาที (รอ network พร้อม)
  setTimeout(() => ensureOllamaChatModel().catch(() => {}), 15000);

  if (LINE_TOKEN && LIFF_ID) {
    console.log("   🎨 สร้าง Rich Menu...");
    await setupRichMenu();
  }
});


