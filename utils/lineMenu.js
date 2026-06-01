// utils/lineMenu.js
// LINE Rich Menu + Flex Templates (FIXED VERSION)

const axios = require("axios");

const LINE_TOKEN = process.env.LINE_TOKEN;

const headers = {
  Authorization: `Bearer ${LINE_TOKEN}`,
  "Content-Type": "application/json"
};

// ─────────────────────────────────────────────────────────────
// Rich Menu Definition (LINE VALID SIZE)
// รองรับเฉพาะ:
// 2500 x 843
// 2500 x 1686
// ─────────────────────────────────────────────────────────────

// Layout #4: left big (2/3) + two stacked right (1/3 each)
// 2500 wide → left=1667, right=833  |  1686 tall → each right=843
const richMenuBody = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "FIET Main Menu",
  chatBarText: "เมนู FIET 🎓",
  areas: [
    // LEFT BIG — หลักสูตร
    {
      bounds: { x: 0, y: 0, width: 1667, height: 1686 },
      action: { type: "message", label: "หลักสูตร", text: "หลักสูตร" }
    },
    // RIGHT TOP — ติดต่อคณะ
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: "message", label: "ติดต่อคณะ", text: "ติดต่อคณะ" }
    },
    // RIGHT BOTTOM — ค่าเทอม
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: { type: "message", label: "ค่าเทอม", text: "ค่าเทอม" }
    }
  ]
};

// ─────────────────────────────────────────────────────────────
// Setup Rich Menu
// ─────────────────────────────────────────────────────────────

async function setupRichMenu() {
  try {

    console.log("[menu] 🚀 Creating Rich Menu...");

    // ลบเฉพาะ menu ที่ชื่อเดียวกัน
    const existing = await axios.get(
      "https://api.line.me/v2/bot/richmenu/list",
      { headers }
    );

    const oldMenus = existing.data.richmenus || [];

    for (const menu of oldMenus) {

      if (menu.name === "FIET Main Menu") {

        await axios.delete(
          `https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`,
          { headers }
        );

        console.log("[menu] 🗑 Deleted:", menu.richMenuId);
      }
    }

    // Create new rich menu
    const created = await axios.post(
      "https://api.line.me/v2/bot/richmenu",
      richMenuBody,
      { headers }
    );

    const richMenuId = created.data.richMenuId;

    console.log("[menu] ✅ Created:", richMenuId);

    // Upload image
    await uploadMenuImage(richMenuId);

    // Set default
    await axios.post(
      `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
      {},
      { headers }
    );

    console.log("[menu] 🎉 Rich Menu Ready");

    return richMenuId;

  } catch (err) {

    console.error(
      "[menu] ❌ ERROR:",
      err.response?.data || err.message
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Upload Rich Menu Image
// ─────────────────────────────────────────────────────────────

async function uploadMenuImage(richMenuId) {

  try {

    const fs = require("fs");
    const path = require("path");

    const imgPath = path.join(
      __dirname,
      "../public/richmenu.png"
    );

    // ถ้าไม่มีรูป → generate placeholder
    if (!fs.existsSync(imgPath)) {

      console.log(
        "[menu] ⚠️ richmenu.png not found → generating placeholder"
      );

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

    console.log("[menu] ✅ Image uploaded");

  } catch (err) {

    console.error(
      "[menu] ❌ Upload failed:",
      err.response?.data || err.message
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Generate Placeholder Image
// ─────────────────────────────────────────────────────────────

async function generatePlaceholderMenu(richMenuId) {

  try {

    const { createCanvas } = require("canvas");

    const W = 2500, H = 1686;
    const SPLIT_X = 1667, SPLIT_Y = 843;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // ── Panel definitions (match acrylic sign colors) ──────────────────
    const panels = [
      // LEFT BIG — หลักสูตร: dark navy like the sign
      { x: 0,       y: 0,       w: SPLIT_X,       h: H,
        bg: "#1a2a5e", labelTh: "หลักสูตร", labelEn: "PROGRAM",
        iconSize: 320, textSize: 130, subSize: 80 },
      // RIGHT TOP — ค่าเทอม: light blue like the sign
      { x: SPLIT_X, y: 0,       w: W - SPLIT_X,   h: SPLIT_Y,
        bg: "#7bb8d4", labelTh: "ค่าเทอม", labelEn: "TUITION FEE",
        iconSize: 180, textSize: 90, subSize: 60 },
      // RIGHT BOTTOM — ติดต่อคณะ: very light blue/white like the sign
      { x: SPLIT_X, y: SPLIT_Y, w: W - SPLIT_X,   h: H - SPLIT_Y,
        bg: "#d6eaf5", labelTh: "ติดต่อคณะ", labelEn: "CONTACT FACULTY",
        textColor: "#555", iconSize: 180, textSize: 90, subSize: 60 },
    ];

    for (const p of panels) {
      const tc = p.textColor || "#ffffff";
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;

      // Panel background
      ctx.fillStyle = p.bg;
      ctx.fillRect(p.x, p.y, p.w, p.h);

      // Subtle inner border to mimic acrylic edge
      ctx.strokeStyle = tc === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)";
      ctx.lineWidth = 8;
      ctx.strokeRect(p.x + 16, p.y + 16, p.w - 32, p.h - 32);

      // Thai label
      ctx.fillStyle = tc;
      ctx.textAlign = "center";
      ctx.font = `bold ${p.textSize}px Arial`;
      ctx.fillText(p.labelTh, cx, cy + p.iconSize * 0.55);

      // English sub-label
      ctx.font = `${p.subSize}px Arial`;
      ctx.fillText(p.labelEn, cx, cy + p.iconSize * 0.55 + p.subSize + 10);
    }

    // Divider lines
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(SPLIT_X, 0);     ctx.lineTo(SPLIT_X, H);
    ctx.moveTo(SPLIT_X, SPLIT_Y); ctx.lineTo(W, SPLIT_Y);
    ctx.stroke();

    const buffer = canvas.toBuffer("image/png");

    await axios.post(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      buffer,
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
          "Content-Type": "image/png"
        }
      }
    );

    console.log("[menu] ✅ Placeholder generated");

  } catch (err) {

    console.log(
      "[menu] ❌ canvas missing"
    );

    console.log(
      "npm install canvas"
    );

    console.log(err.message);
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
    { code: "MTE", emoji: "⚙️",  name: "ครุศาสตร์เครื่องกล",            english: "Mechanical Technology Education",          color: "#2563eb" },
    { code: "ETE", emoji: "⚡",  name: "ครุศาสตร์ไฟฟ้า",                english: "Electrical Technology Education",          color: "#f59e0b" },
    { code: "CTE", emoji: "🏗️", name: "ครุศาสตร์โยธา",                  english: "Civil Technology Education",               color: "#10b981" },
    { code: "IED", emoji: "🏭",  name: "ครุศาสตร์อุตสาหการ",            english: "Industrial Technology Education",          color: "#ef4444" },
    { code: "PPT", emoji: "🖨️", name: "เทคโนโลยีการพิมพ์และบรรจุภัณฑ์", english: "Printing and Packaging Technology",        color: "#8b5cf6" },
    { code: "ECT", emoji: "📡",  name: "เทคโนโลยีและสื่อสารการศึกษา",   english: "Educational Communications and Technology", color: "#06b6d4" },
    { code: "CIT", emoji: "💻",  name: "คอมพิวเตอร์และเทคโนโลยีสารสนเทศ", english: "Computer and Information Technology",     color: "#0ea5e9" },
    { code: "ITE", emoji: "🔧",  name: "เทคโนโลยีอุตสาหกรรม",           english: "Industrial Technology",                    color: "#f97316" },
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
        { type: "action", action: { type: "message", label: "เทียบทุกสาขา", text: "เทียบทุกสาขา" } },
        { type: "action", action: { type: "message", label: "ไปต่อสายไหนดี", text: "ไปต่อสายไหนดี" } },
        { type: "action", action: { type: "message", label: "MTE เครื่องกล",  text: "ข้อมูลหลักสูตร MTE" } },
        { type: "action", action: { type: "message", label: "ETE ไฟฟ้า",      text: "ข้อมูลหลักสูตร ETE" } },
        { type: "action", action: { type: "message", label: "CTE โยธา",       text: "ข้อมูลหลักสูตร CTE" } },
        { type: "action", action: { type: "message", label: "IED อุตสาหการ", text: "ข้อมูลหลักสูตร IED" } },
        { type: "action", action: { type: "message", label: "PPT การพิมพ์",   text: "ข้อมูลหลักสูตร PPT" } },
        { type: "action", action: { type: "message", label: "ECT สื่อสาร",    text: "ข้อมูลหลักสูตร ECT" } },
        { type: "action", action: { type: "message", label: "CIT คอมพิวเตอร์", text: "ข้อมูลหลักสูตร CIT" } },
        { type: "action", action: { type: "message", label: "ITE อุตสาหกรรม", text: "ข้อมูลหลักสูตร ITE" } },
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

