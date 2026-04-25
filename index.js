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

app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;

    for (let event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userMsg = event.message.text;

        const aiRes = await ai.chat.completions.create({
          model: OLLAMA_MODEL,
          messages: [
            {
              role: "system",
              content: "คุณเป็นผู้ช่วยแนะนำที่กิน เที่ยว แบบเป็นกันเอง"
            },
            {
              role: "user",
              content: userMsg
            }
          ]
        });

        const replyText = aiRes.choices[0].message.content;

        // 🔥 ตอบ LINE
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
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running"));