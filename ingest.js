// ingest.js
// ระบบ RAG — อ่าน PDF แล้วเก็บลง Qdrant Vector DB

require("dotenv").config();
const fs      = require("fs");
const path    = require("path");
const axios   = require("axios");

const QDRANT_URL   = process.env.QDRANT_URL   || "http://localhost:6333";
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434";
const EMBED_MODEL  = "nomic-embed-text";
const COLLECTION   = "knowledge";
const PDF_DIR      = process.env.PDF_DIR || "./pdfs";
const CHUNK_SIZE   = 500;  // ตัวอักษรต่อ chunk
const CHUNK_OVERLAP = 100; // overlap ระหว่าง chunk

// ── Text Chunking ─────────────────────────────────────────────────────────────
function chunkText(text, source) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end   = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push({ text: chunk, source });
    }
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// ── Get Embedding จาก Ollama ──────────────────────────────────────────────────
async function getEmbedding(text) {
  const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: EMBED_MODEL,
    prompt: text
  });
  return res.data.embedding;
}

// ── สร้าง Collection ใน Qdrant ────────────────────────────────────────────────
async function createCollection() {
  try {
    await axios.put(`${QDRANT_URL}/collections/${COLLECTION}`, {
      vectors: { size: 768, distance: "Cosine" }
    });
    console.log(`[qdrant] Collection "${COLLECTION}" created`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`[qdrant] Collection "${COLLECTION}" already exists`);
    } else {
      throw err;
    }
  }
}

// ── บันทึก chunks ลง Qdrant ──────────────────────────────────────────────────
async function upsertChunks(chunks) {
  const points = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(`\r[embed] ${i+1}/${chunks.length} chunks...`);
    const vector = await getEmbedding(chunk.text);
    points.push({
      id:      Date.now() + i,
      vector,
      payload: { text: chunk.text, source: chunk.source }
    });
    // batch ทุก 10 chunks
    if (points.length >= 10 || i === chunks.length - 1) {
      await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, { points });
      points.length = 0;
    }
  }
  console.log("");
}

// ── อ่าน PDF ด้วย pdfjs-dist ─────────────────────────────────────────────────
async function extractPDF(filePath) {
  try {
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    const data     = new Uint8Array(fs.readFileSync(filePath));
    const doc      = await pdfjsLib.getDocument({ data }).promise;
    let text       = "";

    for (let i = 1; i <= doc.numPages; i++) {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
  } catch (err) {
    console.error(`[pdf] Error reading ${filePath}:`, err.message);
    return "";
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 RAG Ingest System");
  console.log(`   PDF Dir: ${PDF_DIR}`);
  console.log(`   Qdrant:  ${QDRANT_URL}`);
  console.log(`   Ollama:  ${OLLAMA_URL}`);
  console.log(`   Model:   ${EMBED_MODEL}\n`);

  // เช็คว่ามี pdfs folder
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
    console.log(`[info] Created ${PDF_DIR} — วาง PDF ไว้ในนี้แล้วรันใหม่`);
    return;
  }

  // หาไฟล์ PDF ทั้งหมด
  const files = fs.readdirSync(PDF_DIR)
    .filter(f => f.toLowerCase().endsWith(".pdf"));

  if (!files.length) {
    console.log(`[info] ไม่พบ PDF ใน ${PDF_DIR}`);
    return;
  }

  console.log(`[info] พบ ${files.length} ไฟล์ PDF\n`);

  // สร้าง collection
  await createCollection();

  let totalChunks = 0;

  // Process แต่ละ PDF
  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    console.log(`[pdf] กำลังอ่าน: ${file}`);

    const text = await extractPDF(filePath);
    if (!text.trim()) {
      console.log(`[pdf] ⚠️ ไม่สามารถอ่าน ${file} ได้`);
      continue;
    }

    const chunks = chunkText(text, file);
    console.log(`[pdf] ${file} → ${chunks.length} chunks`);

    await upsertChunks(chunks);
    totalChunks += chunks.length;
    console.log(`[pdf] ✅ ${file} เสร็จแล้ว\n`);
  }

  console.log(`\n✅ เสร็จสิ้น! เพิ่ม ${totalChunks} chunks จาก ${files.length} ไฟล์`);
}

main().catch(console.error);