// utils/rag.js
const axios = require("axios");

const QDRANT_URL = process.env.QDRANT_URL || "http://qdrant:6333";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";
const EMBED_MODEL = "nomic-embed-text";
const COLLECTION  = "knowledge";
const TOP_K       = 5;

// ── Embedding cache (in-memory) ────────────────────────────────────────────────
// ป้องกันการ embed คำถามเดิมซ้ำๆ ทำให้เร็วขึ้นมาก
const embedCache = new Map();
const CACHE_MAX  = 200;

async function getEmbedding(text) {
  const key = text.trim().slice(0, 200);
  if (embedCache.has(key)) {
    console.log("[rag] cache hit");
    return embedCache.get(key);
  }

  const res = await axios.post(
    `${OLLAMA_URL}/api/embeddings`,
    { model: EMBED_MODEL, prompt: text },
    { timeout: 15000 } // timeout 15s — ถ้า Ollama ช้าเกินนี้ถือว่าล้มเหลว
  );

  const embedding = res.data.embedding;

  // จำกัดขนาด cache
  if (embedCache.size >= CACHE_MAX) {
    const firstKey = embedCache.keys().next().value;
    embedCache.delete(firstKey);
  }
  embedCache.set(key, embedding);

  return embedding;
}

// ── ค้นหาจาก Qdrant ───────────────────────────────────────────────────────────
async function searchRAG(query) {
  try {
    const vector = await getEmbedding(query);

    const res = await axios.post(
      `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
      { vector, limit: TOP_K, with_payload: true },
      { timeout: 5000 }
    );

    const results = res.data.result || [];
    if (!results.length) return null;

    // กรองเฉพาะ results ที่มี score สูงพอ (relevance threshold)
    const relevant = results.filter(r => r.score > 0.5);
    if (!relevant.length) {
      console.log("[rag] no relevant results (score < 0.5)");
      return null;
    }

    const context = relevant
      .map(r => `[จาก: ${r.payload.source}]\n${r.payload.text}`)
      .join("\n\n---\n\n")
      .slice(0, 4500);

    console.log(`[rag] found ${relevant.length} chunks, score: ${relevant[0].score.toFixed(3)}`);
    return context;

  } catch (err) {
    if (err.code === "ECONNABORTED") {
      console.error("[rag] Ollama timeout — ข้ามไปตอบด้วย Groq อย่างเดียว");
    } else {
      console.error("[rag] Search failed:", err.message);
    }
    return null;
  }
}

// ── เช็คสถานะ Qdrant ──────────────────────────────────────────────────────────
// Cache ผล isRAGReady ไว้ 60 วินาที ไม่ต้องเช็คทุก request
let ragReadyCache     = null;
let ragReadyCacheTime = 0;
const RAG_CACHE_TTL   = 60_000; // 60 seconds

async function isRAGReady() {
  const now = Date.now();
  if (ragReadyCache !== null && now - ragReadyCacheTime < RAG_CACHE_TTL) {
    return ragReadyCache;
  }

  try {
    const res   = await axios.get(
      `${QDRANT_URL}/collections/${COLLECTION}`,
      { timeout: 3000 }
    );
    const count = res.data.result?.points_count || 0;
    ragReadyCache     = count > 0;
    ragReadyCacheTime = now;
    return ragReadyCache;
  } catch {
    ragReadyCache     = false;
    ragReadyCacheTime = now;
    return false;
  }
}

module.exports = { searchRAG, isRAGReady };