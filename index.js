require("dotenv").config();

const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const ai = new OpenAI({
  baseURL: OLLAMA_URL,
  apiKey: "ollama",
});

async function askOllama(userMsg) {
  const res = await ai.chat.completions.create({
    model: OLLAMA_MODEL,
    messages: [
      {
        role: "system",
        content: "คุณเป็นผู้ช่วยแนะนำที่กิน เที่ยว แบบเป็นกันเอง ตอบสั้น กระชับ เป็นภาษาไทย"
      },
      { role: "user", content: userMsg }
    ]
  });
  return res.choices[0].message.content;
}

app.get("/", (req, res) => {
  res.send("Bot is running");
});

// เทส AI โดยไม่ผ่าน LINE — เปิด browser: /ai-test?msg=สวัสดี
app.get("/ai-test", async (req, res) => {
  const msg = req.query.msg || "สวัสดี แนะนำร้านกาแฟแถวสยามหน่อย";
  try {
    const reply = await askOllama(msg);
    res.json({ msg, reply });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      hint: `Ollama running? Try: ollama serve && ollama pull ${OLLAMA_MODEL}`
    });
  }
});

app.post("/webhook", async (req, res) => {
  // ตอบ LINE ก่อน ไม่งั้นถ้า Ollama ช้า LINE จะ timeout แล้วยิง webhook ซ้ำ
  res.sendStatus(200);

  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    let replyText;
    try {
      replyText = await askOllama(event.message.text);
    } catch (err) {
      console.error("[ollama]", err.message);
      replyText = "⚠️ AI ขัดข้อง ลองใหม่อีกครั้งนะ";
    }

    try {
      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
          replyToken: event.replyToken,
          messages: [{ type: "text", text: replyText }]
        },
        {
          headers: {
            Authorization: `Bearer ${LINE_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
    } catch (err) {
      console.error("[line]", err.response?.data || err.message);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on :${PORT}`);
  console.log(`   Ollama: ${OLLAMA_URL}  model: ${OLLAMA_MODEL}`);

  try {
    const tagsUrl = OLLAMA_URL.replace(/\/v1\/?$/, "") + "/api/tags";
    const r = await axios.get(tagsUrl, { timeout: 3000 });
    const models = (r.data.models || []).map(m => m.name);
    if (models.some(n => n === OLLAMA_MODEL || n.startsWith(OLLAMA_MODEL + ":"))) {
      console.log(`   ✅ Ollama reachable — model "${OLLAMA_MODEL}" พร้อมใช้งาน`);
    } else {
      console.log(`   ⚠️  Ollama reachable แต่ยังไม่ได้ pull "${OLLAMA_MODEL}"`);
      console.log(`      สั่ง: ollama pull ${OLLAMA_MODEL}`);
      console.log(`      ที่มีอยู่: ${models.join(", ") || "(ไม่มีเลย)"}`);
    }
  } catch (err) {
    console.log(`   ❌ ต่อ Ollama ไม่ได้ที่ ${OLLAMA_URL} — เปิด "ollama serve" หรือยัง?`);
  }

  if (!LINE_TOKEN) {
    console.log("   ⚠️  ยังไม่ได้ตั้ง LINE_TOKEN — ตอบกลับ LINE จะ fail");
  }
});
