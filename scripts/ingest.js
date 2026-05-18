// scripts/ingest.js
require("dotenv").config();
const fs      = require("fs");
const path    = require("path");
const axios   = require("axios");
const mammoth = require("mammoth");

const QDRANT_URL    = process.env.QDRANT_URL  || "http://localhost:6333";
const OLLAMA_URL    = process.env.OLLAMA_URL  || "http://localhost:11434";
const EMBED_MODEL   = "nomic-embed-text";
const COLLECTION    = "knowledge";
const PDF_DIR       = process.env.PDF_DIR || path.join(__dirname, "../pdfs");
const CHUNK_SIZE    = 500;
const CHUNK_OVERLAP = 100;

// ── อ่าน PDF ──────────────────────────────────────────────────────────────────
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
    console.error(`[pdf] Error: ${err.message}`);
    return "";
  }
}

// ── อ่าน DOCX ─────────────────────────────────────────────────────────────────
async function extractDOCX(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (err) {
    console.error(`[docx] Error: ${err.message}`);
    return "";
  }
}

// ── Chunk Text ────────────────────────────────────────────────────────────────
function chunkText(text, source) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end   = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push({ text: chunk, source });
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// ── Embedding ─────────────────────────────────────────────────────────────────
async function getEmbedding(text) {
  const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: EMBED_MODEL, prompt: text
  });
  return res.data.embedding;
}

// ── สร้าง Collection ──────────────────────────────────────────────────────────
async function createCollection() {
  try {
    await axios.put(`${QDRANT_URL}/collections/${COLLECTION}`, {
      vectors: { size: 768, distance: "Cosine" }
    });
    console.log(`[qdrant] Collection created`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`[qdrant] Collection already exists`);
    } else throw err;
  }
}

// ── บันทึกลง Qdrant ───────────────────────────────────────────────────────────
async function upsertChunks(chunks) {
  const points = [];
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`\r[embed] ${i+1}/${chunks.length} chunks...`);
    const vector = await getEmbedding(chunks[i].text);
    points.push({
      id:      Date.now() + i,
      vector,
      payload: { text: chunks[i].text, source: chunks[i].source }
    });
    if (points.length >= 10 || i === chunks.length - 1) {
      await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, { points });
      points.length = 0;
    }
  }
  console.log("");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 RAG Ingest System");
  console.log(`   Dir:    ${PDF_DIR}`);
  console.log(`   Qdrant: ${QDRANT_URL}`);
  console.log(`   Ollama: ${OLLAMA_URL}\n`);

  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
    console.log(`[info] Created ${PDF_DIR} — วางไฟล์แล้วรันใหม่`);
    return;
  }

  // หาไฟล์ PDF และ DOCX ทั้งหมด
  const files = fs.readdirSync(PDF_DIR).filter(f =>
    f.toLowerCase().endsWith(".pdf") ||
    f.toLowerCase().endsWith(".docx")
  );

  if (!files.length) {
    console.log(`[info] ไม่พบไฟล์ใน ${PDF_DIR}`);
    return;
  }

  console.log(`[info] พบ ${files.length} ไฟล์\n`);
  await createCollection();

  let totalChunks = 0;

  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    const ext      = file.toLowerCase();
    console.log(`[read] ${file}`);

    // อ่านไฟล์ตามประเภท
    let text = "";
    if (ext.endsWith(".pdf")) {
      text = await extractPDF(filePath);
    } else if (ext.endsWith(".docx")) {
      text = await extractDOCX(filePath);
    }

    if (!text.trim()) {
      console.log(`[warn] ⚠️ อ่านไม่ได้: ${file}`);
      continue;
    }

    const chunks = chunkText(text, file);
    console.log(`[chunk] ${chunks.length} chunks`);

    await upsertChunks(chunks);
    totalChunks += chunks.length;
    console.log(`[done] ✅ ${file}\n`);
  }

  console.log(`\n✅ เสร็จสิ้น! ${totalChunks} chunks จาก ${files.length} ไฟล์`);
}

main().catch(console.error);