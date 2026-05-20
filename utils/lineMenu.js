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
  size: { width: 1600, height: 1618 },
  selected: true,
  name: "FIET Curriculum Menu",
  chatBarText: "เลือกสาขา 🎓",
  areas: [
    { bounds: { x: 0,   y: 0,   width: 800, height: 1618 },
      action: { type: "message", text: "ข้อมูลหลักสูตร MTE", label: "MTE" } },
    { bounds: { x: 800, y: 0,   width: 800, height: 809 },
      action: { type: "message", text: "ข้อมูลหลักสูตร ETE", label: "ETE" } },
    { bounds: { x: 800, y: 809, width: 800, height: 809 },
      action: { type: "message", text: "ข้อมูลหลักสูตร CTE", label: "CTE" } },
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
    const canvas = createCanvas(1600, 1618);
    const ctx    = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, 1600, 1618);

    const buttons = [
      { x: 0,   y: 0,   w: 800, h: 1618, emoji: "⚙️", label: "MTE", color: "#2563eb" },
      { x: 800, y: 0,   w: 800, h: 809,  emoji: "⚡", label: "ETE", color: "#f59e0b" },
      { x: 800, y: 809, w: 800, h: 809,  emoji: "🏗️", label: "CTE", color: "#10b981" },
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
    ctx.moveTo(800, 0); ctx.lineTo(800, 1618);
    ctx.moveTo(800, 809); ctx.lineTo(1600, 809);
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
    console.log("[menu] หรือวางรูป 1600x1618px ไว้ที่ public/richmenu.png แล้ว restart");
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

// ── Branch Carousel ───────────────────────────────────────────────────────────
function makeBranchCarousel() {
  const branches = [
    { code: "MTE", emoji: "⚙️", name: "ครุศาสตร์เครื่องกล", english: "Mechanical Technology Education", color: "#2563eb" },
    { code: "ETE", emoji: "⚡", name: "ครุศาสตร์ไฟฟ้า", english: "Electrical Technology Education", color: "#f59e0b" },
    { code: "CTE", emoji: "🏗️", name: "ครุศาสตร์โยธา", english: "Civil Technology Education", color: "#10b981" },
    { code: "IEd", emoji: "🏭", name: "ครุศาสตร์อุตสาหการ", english: "Industrial Technology Education", color: "#ef4444" },
    { code: "PPT", emoji: "🖨️", name: "เทคโนโลยีการพิมพ์และบรรจุภัณฑ์", english: "Printing and Packaging Technology", color: "#8b5cf6" },
    { code: "ECT", emoji: "💻", name: "เทคโนโลยีและสื่อสารการศึกษา", english: "Educational Communications and Technology", color: "#06b6d4" },
  ];

  const bubbles = branches.map(branch => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: branch.color,
          cornerRadius: "8px",
          paddingAll: "14px",
          contents: [
            { type: "text", text: `${branch.emoji} ${branch.code}`, color: "#ffffff", size: "xl", weight: "bold" },
            { type: "text", text: branch.name, color: "#ffffff", size: "sm", weight: "bold", wrap: true, margin: "sm" },
          ]
        },
        {
          type: "text",
          text: branch.english,
          size: "xs",
          color: "#6b7280",
          wrap: true,
          margin: "md"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [{
        type: "button",
        style: "primary",
        color: branch.color,
        height: "sm",
        action: { type: "message", label: "ดูข้อมูลหลักสูตร", text: `ข้อมูลหลักสูตร ${branch.code}` }
      }]
    }
  }));

  return {
    type: "flex",
    altText: "เลือกสาขาหลักสูตร FIET",
    contents: { type: "carousel", contents: bubbles }
  };
}

// ── Quick Reply ───────────────────────────────────────────────────────────────
function withQuickReply(message) {
  return {
    ...message,
    quickReply: {
      items: [
        { type: "action", action: { type: "message", label: "⚙️ MTE", text: "ข้อมูลหลักสูตร MTE" } },
        { type: "action", action: { type: "message", label: "⚡ ETE", text: "ข้อมูลหลักสูตร ETE" } },
        { type: "action", action: { type: "message", label: "🏗️ CTE", text: "ข้อมูลหลักสูตร CTE" } },
        { type: "action", action: { type: "message", label: "🏭 IEd", text: "ข้อมูลหลักสูตร IEd" } },
        { type: "action", action: { type: "message", label: "🖨️ PPT", text: "ข้อมูลหลักสูตร PPT" } },
        { type: "action", action: { type: "message", label: "💻 ECT", text: "ข้อมูลหลักสูตร ECT" } },
      ]
    }
  };
}

module.exports = {
  setupRichMenu,
  makePlaceCarousel,
  makePromoCarousel,
  makeEventCarousel,
  makeBranchCarousel,
  withQuickReply
};

