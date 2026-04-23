const axios = require("axios");

const SHEET_ID = "1AySFhURaIo388bYQgaNHG4zW1yMggZlL_B2v7iXGcwg";

async function getSheetData() {
  try {
    // 🔥 โหลดพร้อมกัน = เร็วกว่า
    const [plansRes, dictRes, learnRes] = await Promise.all([
      axios.get(`https://opensheet.elk.sh/${SHEET_ID}/plans`),
      axios.get(`https://opensheet.elk.sh/${SHEET_ID}/dictionary`),
      axios.get(`https://opensheet.elk.sh/${SHEET_ID}/learning`)
    ]);

    return {
      plans: plansRes.data || [],
      dictionary: dictRes.data || [],
      learning: learnRes.data || []
    };

  } catch (err) {
    console.log("❌ โหลด sheet ไม่ได้:", err.message);

    // 🔥 fallback กันระบบพัง
    return {
      plans: [],
      dictionary: [],
      learning: []
    };
  }
}

module.exports = { getSheetData };
