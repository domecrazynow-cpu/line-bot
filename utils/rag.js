// utils/rag.js
// ค้นหาข้อมูลจาก Qdrant Vector DB

const axios = require("axios");

const QDRANT_URL  = process.env.QDRANT_URL  || "http://qdrant:6333";
const OLLAMA_URL  = process.env.OLLAMA_URL  || "http://ollama:11434";
const EMBED_MODEL = "nomic-embed-text";
const COLLECTION  = "knowledge";
const TOP_K       = 5; // จำนวน chunks ที่ดึงมา

/**
 * แปลงข้อความเป็น embedding
 */
async function getEmbedding(text) {
  const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: EMBED_MODEL,
    prompt: text
  });
  return res.data.embedding;
}

/**
 * ค้นหาข้อมูลที่เกี่ยวข้องจาก Qdrant
 */
async function searchRAG(query) {
  try {
    const vector = await getEmbedding(query);
    const res = await axios.post(
      `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
      { vector, limit: TOP_K, with_payload: true }
    );

    const results = res.data.result || [];
    if (!results.length) return null;

    // รวม context จากทุก chunk
    const context = results
      .map(r => `[จาก: ${r.payload.source}]\n${r.payload.text}`)
      .join("\n\n---\n\n");

    return context;
  } catch (err) {
    console.error("[rag] Search failed:", err.message);
    return null;
  }
}

/**
 * เช็คว่า Qdrant พร้อมใช้งานไหม
 */
async function isRAGReady() {
  try {
    const res = await axios.get(
      `${QDRANT_URL}/collections/${COLLECTION}`,
      { timeout: 3000 }
    );
    const count = res.data.result?.points_count || 0;
    return count > 0;
  } catch {
    return false;
  }
}

module.exports = { searchRAG, isRAGReady };