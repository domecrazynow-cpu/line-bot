// utils/lineMenu.js
// Rich Menu + Flex Message templates สำหรับ LINE Bot

const axios = require("axios");

const LINE_TOKEN = process.env.LINE_TOKEN;
const LIFF_ID    = process.env.LIFF_ID;

const headers = {
  Authorization: `Bearer ${LINE_TOKEN}`,
  "Content-Type": "application/json"
};

// ── Rich Menu Definition ──────────────────────────────────────────────────────
const richMenuBody = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "Travel Bot Menu",
  chatBarText: "เมนู 🗺️",
  areas: [
    // Row 1
    {
      bounds: { x: 0,    y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `https://liff.line.me/${LIFF_ID}`, label: "วางแผนเที่ยว" }
    },
    {
      bounds: { x: 833,  y: 0, width: 834, height: 843 },
      action: { type: "message", text: "แนะนำสถานที่ลับที่ไม่ค่อยมีคนรู้จัก", label: "สถานที่ลับ" }
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: "message", text: "มีโปรโมชันอะไรบ้าง", label: "โปรโมชัน" }
    },
    // Row 2
    {
      bounds: { x: 0,    y: 843, width: 833, height: 843 },
      action: { type: "message", text: "ลงทะเบียนอีเวนท์", label: "ลงทะเบียน" }
    },
    {
      bounds: { x: 833,  y: 843, width: 834, height: 843 },
      action: { type: "message", text: "ติดต่อทีม", label: "ติดต่อทีม" }
    },
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: { type: "message", text: "แนะนำร้านอาหารอร่อยแถวนี้หน่อย", label: "ร้านอาหาร" }
    }
  ]
};

// ── Create & Set Rich Menu ────────────────────────────────────────────────────
async function setupRichMenu() {
  try {
    // 1. ลบ Rich Menu เก่าทั้งหมด
    const existing = await axios.get(
      "https://api.line.me/v2/bot/richmenu/list",
      { headers }
    );
    for (const menu of existing.data.richmenus || []) {
      await axios.delete(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, { headers });
      console.log(`[menu] ลบ menu เก่า: ${menu.richMenuId}`);
    }

    // 2. สร้าง Rich Menu ใหม่
    const created = await axios.post(
      "https://api.line.me/v2/bot/richmenu",
      richMenuBody,
      { headers }
    );
    const richMenuId = created.data.richMenuId;
    console.log(`[menu] สร้าง Rich Menu: ${richMenuId}`);

    // 3. Upload รูป placeholder (ถ้าไม่มีรูป จะเป็นพื้นสีเขียว)
    await uploadMenuImage(richMenuId);

    // 4. Set เป็น default
    await axios.post(
      `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
      {},
      { headers }
    );
    console.log(`[menu] ✅ Rich Menu พร้อมใช้งาน!`);
    return richMenuId;
  } catch (err) {
    console.error("[menu] ❌ สร้าง Rich Menu ไม่ได้:", err.response?.data || err.message);
  }
}

// ── Upload Menu Image ─────────────────────────────────────────────────────────
async function uploadMenuImage(richMenuId) {
  try {
    const fs   = require("fs");
    const path = require("path");
    const imgPath = path.join(__dirname, "../public/richmenu.png");

    if (!fs.existsSync(imgPath)) {
      console.log("[menu] ⚠️ ไม่พบ public/richmenu.png — ใช้รูป placeholder");
      // สร้างรูป placeholder ด้วย Canvas (ถ้าไม่มีรูปจริง)
      await generatePlaceholderMenu(richMenuId);
      return;
    }

    const imageData = fs.readFileSync(imgPath);
    await axios.post(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      imageData,
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
          "Content-Type": "image/png"
        }
      }
    );
    console.log("[menu] อัปโหลดรูป Rich Menu สำเร็จ");
  } catch (err) {
    console.error("[menu] อัปโหลดรูปไม่ได้:", err.message);
  }
}

// ── Generate Placeholder Menu Image ──────────────────────────────────────────
async function generatePlaceholderMenu(richMenuId) {
  try {
    const { createCanvas } = require("canvas");
    const canvas = createCanvas(2500, 1686);
    const ctx    = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, 2500, 1686);

    const buttons = [
      { x: 0,    y: 0,   w: 833, h: 843, emoji: "🗺️",  label: "วางแผนเที่ยว",    color: "#06C755" },
      { x: 833,  y: 0,   w: 834, h: 843, emoji: "🔍",  label: "สถานที่ลับ",       color: "#0099ff" },
      { x: 1667, y: 0,   w: 833, h: 843, emoji: "🎁",  label: "โปรโมชัน",         color: "#ff6b6b" },
      { x: 0,    y: 843, w: 833, h: 843, emoji: "📅",  label: "ลงทะเบียนอีเวนท์", color: "#f5a623" },
      { x: 833,  y: 843, w: 834, h: 843, emoji: "📞",  label: "ติดต่อทีม",         color: "#9b59b6" },
      { x: 1667, y: 843, w: 833, h: 843, emoji: "🍜",  label: "ร้านอาหาร",         color: "#e67e22" },
    ];

    for (const btn of buttons) {
      // Button background
      ctx.fillStyle = btn.color + "33";
      ctx.fillRect(btn.x + 4, btn.y + 4, btn.w - 8, btn.h - 8);

      // Border
      ctx.strokeStyle = btn.color;
      ctx.lineWidth   = 6;
      ctx.strokeRect(btn.x + 4, btn.y + 4, btn.w - 8, btn.h - 8);

      // Emoji
      ctx.font      = "180px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(btn.emoji, btn.x + btn.w / 2, btn.y + btn.h / 2 - 60);

      // Label
      ctx.font      = "bold 90px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 120);
    }

    // Grid lines
    ctx.strokeStyle = "#ffffff22";
    ctx.lineWidth   = 4;
    ctx.beginPath();
    ctx.moveTo(833, 0); ctx.lineTo(833, 1686);
    ctx.moveTo(1667, 0); ctx.lineTo(1667, 1686);
    ctx.moveTo(0, 843); ctx.lineTo(2500, 843);
    ctx.stroke();

    const buffer = canvas.toBuffer("image/png");
    await axios.post(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      buffer,
      { headers: { Authorization: `Bearer ${LINE_TOKEN}`, "Content-Type": "image/png" } }
    );
    console.log("[menu] สร้างรูป placeholder สำเร็จ");
  } catch (err) {
    console.log("[menu] ⚠️ ไม่สามารถสร้างรูปได้ — ติดตั้ง canvas: npm install canvas");
    console.log("[menu] หรือวางรูป 2500x1686px ไว้ที่ public/richmenu.png แล้ว restart");
  }
}

// ── Flex Message: Place Carousel ──────────────────────────────────────────────
function makePlaceCarousel(places) {
  const bubbles = places.map(p => ({
    type: "bubble",
    size: "kilo",
    hero: {
      type: "box",
      layout: "vertical",
      contents: [],
      backgroundColor: p.color || "#06C755",
      height: "120px",
      justifyContent: "center",
      alignItems: "center",
      action: p.url ? { type: "uri", uri: p.url } : undefined
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: p.emoji + " " + p.title,
          weight: "bold",
          size: "md",
          wrap: true,
          color: "#1a1a2e"
        },
        {
          type: "text",
          text: p.category || "สถานที่ท่องเที่ยว",
          size: "xs",
          color: "#06C755",
          margin: "xs"
        },
        {
          type: "text",
          text: p.description,
          size: "sm",
          color: "#6b7280",
          wrap: true,
          margin: "sm"
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "💰 " + (p.budget || "ประหยัด"),
              size: "xs",
              color: "#6b7280",
              flex: 1
            },
            {
              type: "text",
              text: "📍 " + (p.distance || "ในเมือง"),
              size: "xs",
              color: "#6b7280",
              flex: 1
            }
          ]
        }
      ],
      paddingAll: "16px"
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "message",
            label: "แนะนำเส้นทาง 🗺️",
            text: `แนะนำเส้นทางไป ${p.title}`
          },
          style: "primary",
          color: "#06C755",
          height: "sm"
        }
      ],
      paddingAll: "12px"
    }
  }));

  return {
    type: "flex",
    altText: "สถานที่แนะนำ 🗺️",
    contents: { type: "carousel", contents: bubbles }
  };
}

// ── Flex Message: Promotion Carousel ─────────────────────────────────────────
function makePromoCarousel(promos) {
  if (!promos.length) {
    return {
      type: "text",
      text: "ตอนนี้ยังไม่มีโปรโมชันพิเศษครับ 😊 ติดตามได้เลย!"
    };
  }

  const bubbles = promos.map(p => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#fff8f0",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#ff6b6b",
          paddingAll: "12px",
          contents: [
            { type: "text", text: "🎁 โปรโมชันพิเศษ", color: "#ffffff", size: "xs", weight: "bold" }
          ]
        },
        {
          type: "text",
          text: p.title,
          weight: "bold",
          size: "md",
          wrap: true,
          margin: "md",
          color: "#1a1a2e"
        },
        {
          type: "text",
          text: p.content,
          size: "sm",
          color: "#6b7280",
          wrap: true,
          margin: "sm"
        },
        p.expiresAt ? {
          type: "text",
          text: "⏳ หมดอายุ: " + new Date(p.expiresAt).toLocaleDateString("th-TH"),
          size: "xs",
          color: "#f5a623",
          margin: "md"
        } : { type: "spacer", size: "sm" }
      ],
      paddingAll: "16px"
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: { type: "message", label: "สนใจ! บอกรายละเอียด", text: `สนใจโปรโมชัน ${p.title}` },
          style: "primary",
          color: "#ff6b6b",
          height: "sm"
        }
      ],
      paddingAll: "12px"
    }
  }));

  return {
    type: "flex",
    altText: "โปรโมชันพิเศษ 🎁",
    contents: { type: "carousel", contents: bubbles }
  };
}

// ── Flex Message: Event Registration ─────────────────────────────────────────
function makeEventCarousel(events) {
  if (!events.length) {
    return {
      type: "text",
      text: "ตอนนี้ยังไม่มีอีเวนท์ที่เปิดรับสมัครครับ 📅 ติดตามได้เลย!"
    };
  }

  const bubbles = events.map(e => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#f5a623",
          paddingAll: "12px",
          contents: [
            { type: "text", text: "📅 อีเวนท์", color: "#ffffff", size: "xs", weight: "bold" }
          ]
        },
        {
          type: "text",
          text: e.title,
          weight: "bold",
          size: "md",
          wrap: true,
          margin: "md"
        },
        {
          type: "text",
          text: e.content,
          size: "sm",
          color: "#6b7280",
          wrap: true,
          margin: "sm"
        }
      ],
      paddingAll: "16px"
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: { type: "message", label: "ลงทะเบียนเลย! 📝", text: `ลงทะเบียน ${e.title}` },
          style: "primary",
          color: "#f5a623",
          height: "sm"
        }
      ],
      paddingAll: "12px"
    }
  }));

  return {
    type: "flex",
    altText: "อีเวนท์ที่เปิดรับสมัคร 📅",
    contents: { type: "carousel", contents: bubbles }
  };
}

// ── Quick Reply ───────────────────────────────────────────────────────────────
function withQuickReply(message) {
  return {
    ...message,
    quickReply: {
      items: [
        { type: "action", action: { type: "uri",     label: "🗺️ วางแผนเที่ยว",    uri: `https://liff.line.me/${LIFF_ID}` } },
        { type: "action", action: { type: "message", label: "🔍 สถานที่ลับ",        text: "แนะนำสถานที่ลับที่ไม่ค่อยมีคนรู้จัก" } },
        { type: "action", action: { type: "message", label: "🎁 โปรโมชัน",          text: "มีโปรโมชันอะไรบ้าง" } },
        { type: "action", action: { type: "message", label: "📅 อีเวนท์",           text: "ลงทะเบียนอีเวนท์" } },
        { type: "action", action: { type: "message", label: "🍜 ร้านอาหาร",         text: "แนะนำร้านอาหารอร่อยแถวนี้หน่อย" } },
        { type: "action", action: { type: "message", label: "📞 ติดต่อทีม",          text: "ติดต่อทีม" } },
      ]
    }
  };
}

module.exports = {
  setupRichMenu,
  makePlaceCarousel,
  makePromoCarousel,
  makeEventCarousel,
  withQuickReply
};