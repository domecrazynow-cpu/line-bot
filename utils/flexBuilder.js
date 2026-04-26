// utils/flexBuilder.js
// จัดการ session การสร้าง Flex Message ผ่าน LINE chat

const sessions = new Map(); // userId -> session state

const STEPS = [
  { key: "type",        question: "สร้าง Flex แบบไหนครับ?\n\n1️⃣ การ์ดโปรโมชัน\n2️⃣ การ์ดสถานที่\n3️⃣ การ์ดอีเวนท์\n4️⃣ การ์ดทั่วไป\n\nพิมพ์ 1-4 ได้เลย" },
  { key: "title",       question: "ชื่อหัวข้อคืออะไรครับ? 📝" },
  { key: "description", question: "รายละเอียดคืออะไรครับ? (1-2 ประโยค)" },
  { key: "extra",       question: "ข้อมูลเพิ่มเติม เช่น วันที่ / ราคา / สถานที่ (หรือพิมพ์ - เพื่อข้าม)" },
  { key: "buttonLabel", question: "ชื่อปุ่มกดคืออะไรครับ? เช่น 'ดูเพิ่มเติม' / 'ลงทะเบียน' / 'สั่งซื้อ'" },
  { key: "buttonText",  question: "เมื่อกดปุ่มแล้วจะส่งข้อความอะไรกลับมาครับ? (หรือใส่ https://... เพื่อเปิด link)" },
  { key: "confirm",     question: null }, // preview step
];

const TYPE_COLORS = {
  "1": { bg: "#ff6b6b", label: "โปรโมชัน 🎁",   emoji: "🎁" },
  "2": { bg: "#0099ff", label: "สถานที่ 📍",      emoji: "📍" },
  "3": { bg: "#f5a623", label: "อีเวนท์ 📅",      emoji: "📅" },
  "4": { bg: "#06C755", label: "ทั่วไป ✨",        emoji: "✨" },
};

function startSession(userId) {
  sessions.set(userId, { step: 0, data: {} });
  return STEPS[0].question;
}

function hasSession(userId) {
  return sessions.has(userId);
}

function cancelSession(userId) {
  sessions.delete(userId);
}

function processStep(userId, text) {
  const session = sessions.get(userId);
  if (!session) return null;

  const currentStep = STEPS[session.step];

  // validate type step
  if (currentStep.key === "type") {
    if (!["1","2","3","4"].includes(text.trim())) {
      return { reply: "กรุณาพิมพ์ 1, 2, 3 หรือ 4 ครับ 😊", done: false, flex: null };
    }
    session.data.type = text.trim();
  } else if (currentStep.key === "confirm") {
    // handled separately
  } else {
    session.data[currentStep.key] = text.trim() === "-" ? "" : text.trim();
  }

  session.step++;

  // preview step
  if (session.step === STEPS.length - 1) {
    const flex = buildFlex(session.data);
    const preview = `✅ ได้เลยครับ! นี่คือตัวอย่าง Flex Message ที่สร้างไว้\n\nพิมพ์ "ส่ง" เพื่อส่งให้ทุกคน หรือ "ยกเลิก" เพื่อเริ่มใหม่`;
    return { reply: preview, done: false, flex, previewOnly: true };
  }

  // done
  if (session.step >= STEPS.length) {
    sessions.delete(userId);
    return { reply: "✅ ส่ง Flex Message แล้วครับ!", done: true, flex: null };
  }

  return { reply: STEPS[session.step].question, done: false, flex: null };
}

function confirmSend(userId) {
  const session = sessions.get(userId);
  if (!session) return null;
  const flex = buildFlex(session.data);
  sessions.delete(userId);
  return flex;
}

function buildFlex(data) {
  const typeInfo = TYPE_COLORS[data.type] || TYPE_COLORS["4"];
  const hasLink  = data.buttonText?.startsWith("http");

  return {
    type: "flex",
    altText: `${typeInfo.emoji} ${data.title}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: typeInfo.bg,
            paddingAll: "16px",
            contents: [
              { type: "text", text: typeInfo.emoji + " " + typeInfo.label, color: "#ffffff", size: "xs", weight: "bold" }
            ]
          },
          {
            type: "text",
            text: data.title,
            weight: "bold",
            size: "xl",
            wrap: true,
            margin: "md",
            color: "#1a1a2e"
          },
          {
            type: "text",
            text: data.description,
            size: "sm",
            color: "#6b7280",
            wrap: true,
            margin: "sm"
          },
          ...(data.extra ? [{
            type: "text",
            text: data.extra,
            size: "xs",
            color: typeInfo.bg,
            wrap: true,
            margin: "md",
            weight: "bold"
          }] : [])
        ],
        paddingAll: "0px"
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [{
          type: "button",
          action: hasLink
            ? { type: "uri",     label: data.buttonLabel, uri: data.buttonText }
            : { type: "message", label: data.buttonLabel, text: data.buttonText },
          style: "primary",
          color: typeInfo.bg,
          height: "sm"
        }]
      }
    }
  };
}

module.exports = { startSession, hasSession, processStep, confirmSend, cancelSession };