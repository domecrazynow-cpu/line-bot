const axios = require("axios");

async function askAI(userMsg, data) {
  try {
    const prompt = `
คุณเป็น AI แนะนำสถานที่ท่องเที่ยว

ข้อมูล:
${JSON.stringify(data.plans).slice(0, 2000)}

คำถาม:
${userMsg}

ตอบเป็นภาษาไทย แบบเข้าใจง่าย
`;

    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openrouter/free", // 🔥 ใช้ฟรี
        messages: [
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data.choices[0].message.content;

  } catch (err) {
    console.log("❌ AI ERROR:", err.response?.data || err.message);

    return "⚠️ AI มีปัญหา ลองใหม่อีกครั้งนะ";
  }
}

module.exports = { askAI };