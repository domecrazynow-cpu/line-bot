// scripts/ingest.js
require("dotenv").config();

const fs      = require("fs");
const path    = require("path");
const crypto  = require("crypto");
const axios   = require("axios");
const mammoth = require("mammoth");

const QDRANT_URL      = process.env.QDRANT_URL     || "http://localhost:6333";
const OLLAMA_URL      = process.env.OLLAMA_URL     || "http://localhost:11434";
const EMBED_PROVIDER  = process.env.EMBED_PROVIDER || "ollama";
const JINA_API_KEY    = process.env.JINA_API_KEY;
const EMBED_MODEL     = "nomic-embed-text";
const COLLECTION      = "knowledge";
const PDF_DIR         = process.env.PDF_DIR || path.join(__dirname, "../pdfs");
const CHUNK_SIZE      = 500;
const CHUNK_OVERLAP   = 100;
const VECTOR_SIZE     = (EMBED_PROVIDER === "jina" && JINA_API_KEY) ? 1024 : 768;
const UPSERT_BATCH_SIZE = 10;

// ── Standard font data path (แก้ปัญหา font warning) ──────────────────────────
const STANDARD_FONT_DATA_URL = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "standard_fonts/"
);

// ── อ่าน PDF ──────────────────────────────────────────────────────────────────
async function extractPDF(filePath) {
  try {
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    const data = new Uint8Array(fs.readFileSync(filePath));

    const doc = await pdfjsLib.getDocument({
      data,
      // ระบุ path font ให้ pdfjs อ่านได้ครบ
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      // ปิด warning ที่ไม่จำเป็น
      verbosity: 0,
    }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();

      // รวม text items พร้อม preserve spacing
      let pageText = "";
      let lastY    = null;
      for (const item of content.items) {
        // ถ้า Y เปลี่ยน (ขึ้นบรรทัดใหม่) ใส่ newline
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          pageText += "\n";
        }
        pageText += item.str;
        lastY = item.transform[5];
      }
      text += pageText + "\n";
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
  let start    = 0;
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
  if (EMBED_PROVIDER === "jina" && JINA_API_KEY) {
    const res = await axios.post(
      "https://api.jina.ai/v1/embeddings",
      { model: "jina-embeddings-v3", input: [text], task: "retrieval.passage" },
      {
        headers: { Authorization: `Bearer ${JINA_API_KEY}`, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );
    return res.data.data[0].embedding;
  }
  const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: EMBED_MODEL,
    prompt: text,
  });
  return res.data.embedding;
}

// ── สร้าง Collection ──────────────────────────────────────────────────────────
async function createCollection(recreate = false) {
  if (recreate) {
    try {
      await axios.delete(`${QDRANT_URL}/collections/${COLLECTION}`);
      console.log(`[qdrant] Collection deleted (recreate mode)`);
    } catch {
      // ignore if not exists
    }
  }
  try {
    await axios.put(`${QDRANT_URL}/collections/${COLLECTION}`, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
    console.log(`[qdrant] Collection created (${VECTOR_SIZE} dims)`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`[qdrant] Collection already exists`);
    } else throw err;
  }
}

function pointId(source, index) {
  const hash = crypto.createHash("sha1").update(`${source}:${index}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join("-");
}

function isValidVector(vector) {
  return (
    Array.isArray(vector) &&
    vector.length === VECTOR_SIZE &&
    vector.every(Number.isFinite)
  );
}

function qdrantErrorMessage(err) {
  if (err.response?.data) return JSON.stringify(err.response.data);
  return err.message;
}

async function upsertPoints(points, source, endingChunk) {
  try {
    await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, { points });
    return;
  } catch (err) {
    console.error(`\n[qdrant] Batch upsert failed: ${qdrantErrorMessage(err)}`);
    console.error(`[qdrant] Retrying one-by-one: source=${source}, ending chunk=${endingChunk}`);
  }
  for (const point of points) {
    try {
      await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, { points: [point] });
    } catch (err) {
      console.error(`[warn] skip point ${point.id} chunk=${point.payload.chunk}: ${qdrantErrorMessage(err)}`);
    }
  }
}

// ── บันทึกลง Qdrant ───────────────────────────────────────────────────────────
async function upsertChunks(chunks) {
  const points = [];
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`\r[embed] ${i + 1}/${chunks.length} chunks...`);
    const vector = await getEmbedding(chunks[i].text);
    if (!isValidVector(vector)) {
      console.error(`\n[warn] skip invalid embedding source=${chunks[i].source} chunk=${i + 1}`);
      continue;
    }
    points.push({
      id:      pointId(chunks[i].source, i),
      vector,
      payload: { text: chunks[i].text, source: chunks[i].source, chunk: i + 1 },
    });
    if (points.length >= UPSERT_BATCH_SIZE || i === chunks.length - 1) {
      await upsertPoints(points, chunks[i].source, i + 1);
      points.length = 0;
    }
  }
  console.log("");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const recreate = process.argv.includes("--recreate");
  const provider = (EMBED_PROVIDER === "jina" && JINA_API_KEY) ? "jina-embeddings-v3" : `ollama/${EMBED_MODEL}`;

  console.log("🚀 RAG Ingest System");
  console.log(`   Dir:      ${PDF_DIR}`);
  console.log(`   Qdrant:   ${QDRANT_URL}`);
  console.log(`   Embed:    ${provider} (${VECTOR_SIZE} dims)`);
  if (recreate) console.log(`   Mode:     RECREATE — existing collection will be deleted`);
  console.log("");

  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
    console.log(`[info] Created ${PDF_DIR} — วางไฟล์แล้วรันใหม่`);
    return;
  }

  const files = fs.readdirSync(PDF_DIR).filter((f) => {
    const lower = f.toLowerCase();
    return lower.endsWith(".pdf") || lower.endsWith(".docx");
  });

  if (!files.length) {
    console.log(`[info] ไม่พบไฟล์ใน ${PDF_DIR}`);
    return;
  }

  console.log(`[info] พบ ${files.length} ไฟล์\n`);
  await createCollection(recreate);

  let totalChunks = 0;
  let skipped     = 0;

  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    const lower    = file.toLowerCase();
    console.log(`[read] ${file}`);

    let text = "";
    if (lower.endsWith(".pdf")) {
      text = await extractPDF(filePath);
    } else if (lower.endsWith(".docx")) {
      text = await extractDOCX(filePath);
    }

    if (!text.trim()) {
      console.log(`[warn] ⚠️ อ่านไม่ได้: ${file}`);
      skipped++;
      continue;
    }

    // แสดงจำนวน chars ที่อ่านได้
    console.log(`[chars] ${text.length.toLocaleString()} chars`);

    const chunks = chunkText(text, file);
    console.log(`[chunk] ${chunks.length} chunks`);
    await upsertChunks(chunks);
    totalChunks += chunks.length;
    console.log(`[done] ✅ ${file}\n`);
  }

  console.log(`\n✅ เสร็จสิ้น!`);
  console.log(`   ${totalChunks} chunks จาก ${files.length - skipped} ไฟล์`);
  if (skipped > 0) console.log(`   ⚠️ อ่านไม่ได้ ${skipped} ไฟล์`);

  // เช็คจำนวน points ใน Qdrant
  try {
    const res   = await axios.get(`${QDRANT_URL}/collections/${COLLECTION}`);
    const count = res.data.result?.points_count || 0;
    console.log(`   📦 Qdrant: ${count.toLocaleString()} points รวมทั้งหมด`);
  } catch {
    // ignore
  }
}

main().catch(console.error);