// utils/eventMatcher.js
const { searchKnowledge } = require("./knowledge");

function extractLocationKeywords(text) {
  const locationPatterns = [
    /เชียงใหม่|เชียงราย|ลำปาง|ลำพูน|แม่ฮ่องสอน/g,
    /กรุงเทพ|กทม|สยาม|สุขุมวิท|อารีย์|ทองหล่อ|เอกมัย/g,
    /ภูเก็ต|กระบี่|พังงา|เกาะ\S+/g,
    /เกาะสมุย|สุราษฎร์|ชุมพร|นครศรีธรรมราช/g,
    /พัทยา|ชลบุรี|ระยอง|จันทบุรี/g,
    /กาญจนบุรี|ราชบุรี|เพชรบุรี|ประจวบ/g,
    /สมุทรสาคร|สมุทรสงคราม|สมุทรปราการ/g,
    /นครราชสีมา|โคราช|ขอนแก่น|อุดร|หนองคาย/g,
    /อยุธยา|สุพรรณบุรี|นครปฐม|ปทุมธานี/g,
  ];

  const found = new Set();
  for (const pattern of locationPatterns) {
    const matches = text.match(pattern) || [];
    matches.forEach(m => found.add(m));
  }

  const placeMatches = text.match(/(?:ที่|ไป|แถว|ใน|เขต|อำเภอ)\s*([^\s,。!?]+)/g) || [];
  placeMatches.forEach(m => {
    const word = m.replace(/^(ที่|ไป|แถว|ใน|เขต|อำเภอ)\s*/, "").trim();
    if (word.length > 1) found.add(word);
  });

  return [...found];
}

function findNearbyEvents(aiResponseText) {
  const keywords = extractLocationKeywords(aiResponseText);
  if (!keywords.length) return [];
  const query = keywords.join(" ") + " อีเวนท์ งาน เทศกาล event";
  const results = searchKnowledge(query);
  return results.filter(r =>
    r.category === "อีเวนท์" ||
    r.category === "งาน/เทศกาล" ||
    (r.tags || []).some(t => ["อีเวนท์", "งาน", "เทศกาล", "event", "ลงทะเบียน"].includes(t))
  );
}

function makeNearbyEventBubble(events) {
  if (!events.length) return null;
  const bubbles = events.slice(0, 5).map(e => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box", layout: "vertical", paddingAll: "16px",
      contents: [
        { type: "box", layout: "vertical", backgroundColor: "#f5a623", paddingAll: "10px",
          contents: [{ type: "text", text: "📅 อีเวนท์ใกล้เคียง!", color: "#ffffff", size: "xs", weight: "bold" }]
        },
        { type: "text", text: e.title, weight: "bold", size: "md", wrap: true, margin: "md", color: "#1a1a2e" },
        { type: "text", text: e.content.slice(0, 100) + (e.content.length > 100 ? "..." : ""),
          size: "sm", color: "#6b7280", wrap: true, margin: "sm" },
        e.expiresAt
          ? { type: "text", text: "⏳ ถึง " + new Date(e.expiresAt).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }),
              size: "xs", color: "#f5a623", margin: "sm" }
          : { type: "spacer", size: "xs" }
      ]
    },
    footer: {
      type: "box", layout: "vertical", paddingAll: "12px",
      contents: [{
        type: "button",
        action: { type: "message", label: "📝 ลงทะเบียนเลย!", text: `ลงทะเบียนอีเวนท์ ${e.title}` },
        style: "primary", color: "#f5a623", height: "sm"
      }]
    }
  }));

  return {
    type: "flex",
    altText: "🎪 มีอีเวนท์ใกล้เคียงด้วย!",
    contents: { type: "carousel", contents: bubbles }
  };
}

module.exports = { findNearbyEvents, makeNearbyEventBubble, extractLocationKeywords };