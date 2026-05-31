// scripts/ingest.js
require("dotenv").config();

const fs      = require("fs");
const path    = require("path");
const crypto  = require("crypto");
const axios   = require("axios");
const mammoth = require("mammoth");

const QDRANT_URL        = process.env.QDRANT_URL     || "http://localhost:6333";
const OLLAMA_URL        = process.env.OLLAMA_URL     || "http://localhost:11434";
const EMBED_PROVIDER    = process.env.EMBED_PROVIDER || "ollama";
const JINA_API_KEY      = process.env.JINA_API_KEY;
const EMBED_MODEL       = "nomic-embed-text";
const COLLECTION        = "knowledge";
const PDF_DIR           = process.env.PDF_DIR || path.join(__dirname, "../pdfs");
const CHUNK_SIZE        = 600;
const CHUNK_OVERLAP     = 150;
const VECTOR_SIZE       = (EMBED_PROVIDER === "jina" && JINA_API_KEY) ? 1024 : 768;
const UPSERT_BATCH_SIZE = 10;

// ── ขั้นต่ำที่ถือว่า PDF อ่านได้ "ดีพอ" — ถ้าน้อยกว่านี้จะใช้ DOCX แทน ──────────
const PDF_MIN_CHARS = 20_000;

// ── Standard font data path ───────────────────────────────────────────────────
const STANDARD_FONT_DATA_URL = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "standard_fonts/"
);

// ── ตาราง Map ชื่อสาขา ────────────────────────────────────────────────────────
const PROGRAM_MAP = {
  ETE:     "ETE ครุศาสตร์ไฟฟ้า (Electrical Technology Education)",
  MTE:     "MTE ครุศาสตร์เครื่องกล (Mechanical Technology Education)",
  CTE:     "CTE ครุศาสตร์โยธา (Civil Technology Education)",
  IED:     "IED ครุศาสตร์อุตสาหการ (Industrial Technology Education)",
  PPT:     "PPT เทคโนโลยีการพิมพ์และบรรจุภัณฑ์ (Printing and Packaging Technology)",
  ECT:     "ECT เทคโนโลยีและสื่อสารการศึกษา (Educational Communications and Technology)",
  CIT:     "CIT คอมพิวเตอร์และเทคโนโลยีสารสนเทศ (Computer and Information Technology)",
  ITE:     "ITE เทคโนโลยีอุตสาหกรรม (Industrial Technology)",
  UNKNOWN: "FIET KMUTT",
};

// ── แปลงชื่อไฟล์ → stem (ลบ extension + format marker) ─────────────────────────
function getStem(filename) {
  return filename
    .replace(/\s*\(\.pdf\)(\.pdf)?(\.pdf)?$/i, "")   // (.pdf).pdf.pdf / (.pdf).pdf
    .replace(/\s*\(\.word\)/i, "")                    // (.word)
    .replace(/\.pdf(\.pdf)?$/i, "")                   // .pdf หรือ .pdf.pdf
    .replace(/\.docx$/i, "")                          // .docx
    .trim();
}

// ── ตรวจจับรหัสสาขาจากชื่อไฟล์ก่อน ค่อยดูเนื้อหา ────────────────────────────
function detectProgram(filename, headText = "") {
  const fn     = filename.toLowerCase();
  const fnUp   = filename.toUpperCase();

  // Pass 1 — filename
  if (fnUp.includes("ETE") || fn.includes("ไฟฟ้า") || fn.includes("electrical"))                    return "ETE";
  if (fnUp.includes("MTE") || fn.includes("ครุศาสตร์เครื่องกล") || fn.includes("กล 68") || fn.includes("mechanical")) return "MTE";
  if (fnUp.includes("CTE") || fn.includes("โยธา") || fn.includes("civil"))                          return "CTE";
  if (fnUp.includes("IED") || fn.includes("อุตสาหการ") || fn.includes("อุต") || fn.includes("industrial")) return "IED";
  if (fnUp.includes("PPT") || fn.includes("บรรจุภัณฑ์") || fn.includes("การพิมพ์") || fn.includes("printing") || fn.includes("packaging")) return "PPT";
  if (fnUp.includes("CIT") || fn.includes("คอมพิวเตอร์") || fn.includes("computer") || fn.includes("สารสนเทศ") || fn.includes("มัลติมีเดีย")) return "CIT";
  if (fnUp.includes("ECT") || fn.includes("สื่อสาร") || fn.includes("educational communications") || fn.includes("เทคโน")) return "ECT";
  if (fnUp.includes("ITE") || fn.includes("เทคโนโลยีอุตสาหกรรม") || fn.includes("industrial technology")) return "ITE";

  // Pass 2 — content
  const body  = headText.slice(0, 2000).toLowerCase();
  const bUp   = headText.slice(0, 2000).toUpperCase();

  if (bUp.includes("ETE")  || body.includes("ครุศาสตร์ไฟฟ้า")      || body.includes("electrical technology education")) return "ETE";
  if (bUp.includes("MTE")  || body.includes("ครุศาสตร์เครื่องกล")   || body.includes("mechanical technology education")) return "MTE";
  if (bUp.includes("CTE")  || body.includes("ครุศาสตร์โยธา")        || body.includes("civil technology education"))      return "CTE";
  if (bUp.includes("IED")  || body.includes("ครุศาสตร์อุตสาหการ")   || body.includes("วิศวกรรมอุตสาหการ") || body.includes("industrial technology education")) return "IED";
  if (bUp.includes("PPT")  || body.includes("บรรจุภัณฑ์")           || body.includes("เทคโนโลยีการพิมพ์") || body.includes("printing"))    return "PPT";
  if (bUp.includes("CIT")  || body.includes("คอมพิวเตอร์และเทคโนโลยีสารสนเทศ") || body.includes("วิทยาการคอมพิวเตอร์ประยุกต์") || body.includes("มัลติมีเดีย")) return "CIT";
  if (bUp.includes("ECT")  || body.includes("สื่อสารการศึกษา")      || body.includes("เทคโนโลยีดิจิทัลทางการเรียนรู้")) return "ECT";
  if (bUp.includes("ITE")  || body.includes("เทคโนโลยีอุตสาหกรรม") || body.includes("industrial technology")) return "ITE";

  return "UNKNOWN";
}

// ── อ่าน PDF ──────────────────────────────────────────────────────────────────
async function extractPDF(filePath) {
  try {
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    const data     = new Uint8Array(fs.readFileSync(filePath));
    const doc      = await pdfjsLib.getDocument({
      data,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      verbosity: 0,
    }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();
      let pageText  = "";
      let lastY     = null;
      for (const item of content.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) pageText += "\n";
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
function chunkText(text, source, programCode) {
  const programLabel = PROGRAM_MAP[programCode] || PROGRAM_MAP.UNKNOWN;
  const prefix       = `[สาขา: ${programLabel}]\n`;
  const chunks       = [];
  let start          = 0;
  while (start < text.length) {
    const end   = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push({ text: prefix + chunk, source, program: programCode });
    }
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
      { headers: { Authorization: `Bearer ${JINA_API_KEY}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
    return res.data.data[0].embedding;
  }
  const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, { model: EMBED_MODEL, prompt: text });
  return res.data.embedding;
}

// ── สร้าง Collection ──────────────────────────────────────────────────────────
async function createCollection(recreate = false) {
  if (recreate) {
    try {
      await axios.delete(`${QDRANT_URL}/collections/${COLLECTION}`);
      console.log(`[qdrant] Collection deleted (recreate mode)`);
    } catch { /* ignore */ }
  }
  try {
    await axios.put(`${QDRANT_URL}/collections/${COLLECTION}`, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
    console.log(`[qdrant] Collection created (${VECTOR_SIZE} dims)`);
  } catch (err) {
    if (err.response?.status === 409) console.log(`[qdrant] Collection already exists`);
    else throw err;
  }
}

function pointId(source, index) {
  const hash = crypto.createHash("sha1").update(`${source}:${index}`).digest("hex");
  return [
    hash.slice(0, 8), hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join("-");
}

function isValidVector(v) {
  return Array.isArray(v) && v.length === VECTOR_SIZE && v.every(Number.isFinite);
}

function qdrantErr(err) {
  return err.response?.data ? JSON.stringify(err.response.data) : err.message;
}

async function upsertPoints(points, source, endingChunk) {
  try {
    await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, { points });
    return;
  } catch (err) {
    console.error(`\n[qdrant] Batch failed: ${qdrantErr(err)} — retrying one-by-one`);
  }
  for (const pt of points) {
    try {
      await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, { points: [pt] });
    } catch (err) {
      console.error(`[warn] skip ${pt.id} chunk=${pt.payload.chunk}: ${qdrantErr(err)}`);
    }
  }
}

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
      payload: { text: chunks[i].text, source: chunks[i].source, program: chunks[i].program, chunk: i + 1 },
    });
    if (points.length >= UPSERT_BATCH_SIZE || i === chunks.length - 1) {
      await upsertPoints(points, chunks[i].source, i + 1);
      points.length = 0;
    }
  }
  console.log("");
}

// ── จัดกลุ่มไฟล์ตาม stem ─────────────────────────────────────────────────────
// คืน array ของ task แต่ละอัน: { label, pdfFile?, docxFile? }
function groupFiles(allFiles) {
  const byExt   = { pdf: [], docx: [] };
  for (const f of allFiles) {
    const lower = f.toLowerCase();
    if (lower.endsWith(".pdf"))  byExt.pdf.push(f);
    if (lower.endsWith(".docx")) byExt.docx.push(f);
  }

  // map stem → { pdf, docx }
  const groups = new Map();

  for (const f of byExt.pdf) {
    const stem = getStem(f);
    if (!groups.has(stem)) groups.set(stem, { pdf: null, docx: null });
    groups.get(stem).pdf = f;
  }
  for (const f of byExt.docx) {
    const stem = getStem(f);
    if (!groups.has(stem)) groups.set(stem, { pdf: null, docx: null });
    groups.get(stem).docx = f;
  }

  return Array.from(groups.entries()).map(([stem, g]) => ({ stem, ...g }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const recreate = process.argv.includes("--recreate");
  const provider = (EMBED_PROVIDER === "jina" && JINA_API_KEY) ? "jina-embeddings-v3" : `ollama/${EMBED_MODEL}`;

  console.log("🚀 RAG Ingest System");
  console.log(`   Dir:    ${PDF_DIR}`);
  console.log(`   Qdrant: ${QDRANT_URL}`);
  console.log(`   Embed:  ${provider} (${VECTOR_SIZE} dims)`);
  console.log(`   PDF threshold: ${PDF_MIN_CHARS.toLocaleString()} chars (น้อยกว่านี้ใช้ DOCX แทน)`);
  if (recreate) console.log(`   Mode:   RECREATE`);
  console.log("");

  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
    console.log(`[info] Created ${PDF_DIR} — วางไฟล์แล้วรันใหม่`);
    return;
  }

  const allFiles = fs.readdirSync(PDF_DIR).filter(f => {
    const l = f.toLowerCase();
    return l.endsWith(".pdf") || l.endsWith(".docx");
  });

  if (!allFiles.length) {
    console.log(`[info] ไม่พบไฟล์ใน ${PDF_DIR}`);
    return;
  }

  const groups = groupFiles(allFiles);
  console.log(`[info] พบ ${allFiles.length} ไฟล์ → ${groups.length} กลุ่มเอกสาร\n`);
  await createCollection(recreate);

  let totalChunks = 0;
  let skipped     = 0;
  const report    = [];  // สรุปผลแต่ละไฟล์

  for (const g of groups.sort((a, b) => a.stem.localeCompare(b.stem))) {
    let chosenFile = null;
    let chosenExt  = null;
    let text       = "";
    let reason     = "";

    if (g.pdf && !g.docx) {
      // ── มีแค่ PDF ────────────────────────────────────────────────────────────
      chosenFile = g.pdf;
      chosenExt  = "pdf";
      text       = await extractPDF(path.join(PDF_DIR, g.pdf));
      reason     = "PDF only";

    } else if (!g.pdf && g.docx) {
      // ── มีแค่ DOCX ───────────────────────────────────────────────────────────
      chosenFile = g.docx;
      chosenExt  = "docx";
      text       = await extractDOCX(path.join(PDF_DIR, g.docx));
      reason     = "DOCX only";

    } else {
      // ── มีทั้ง PDF และ DOCX — ลอง PDF ก่อน ─────────────────────────────────
      const pdfText = await extractPDF(path.join(PDF_DIR, g.pdf));
      const pdfLen  = pdfText.trim().length;

      if (pdfLen >= PDF_MIN_CHARS) {
        // PDF อ่านได้ดี → ใช้ PDF เป็นหลัก
        chosenFile = g.pdf;
        chosenExt  = "pdf";
        text       = pdfText;
        reason     = `PDF ok (${pdfLen.toLocaleString()}c)`;
      } else {
        // PDF เนื้อน้อยหรืออ่านยาก → ใช้ DOCX แทน
        chosenFile = g.docx;
        chosenExt  = "docx";
        text       = await extractDOCX(path.join(PDF_DIR, g.docx));
        reason     = `PDF sparse (${pdfLen.toLocaleString()}c) → DOCX fallback`;
      }
    }

    if (!text.trim()) {
      console.log(`[skip] ⚠️  ${chosenFile} — อ่านไม่ได้`);
      report.push({ file: chosenFile, status: "SKIP", reason: "empty text", program: "-" });
      skipped++;
      continue;
    }

    const programCode = detectProgram(chosenFile, text);
    const chunks      = chunkText(text, chosenFile, programCode);

    console.log(`[file] ${chosenFile}`);
    console.log(`       สาขา: ${programCode} | ${reason} | ${text.length.toLocaleString()}c → ${chunks.length} chunks`);

    await upsertChunks(chunks);
    totalChunks += chunks.length;
    report.push({ file: chosenFile, status: "OK", reason, program: programCode, chunks: chunks.length });
    console.log(`       ✅ done\n`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("══════════════════════════════════════════════");
  console.log("📋 สรุปการ Ingest:");
  console.log("══════════════════════════════════════════════");
  for (const r of report) {
    const icon = r.status === "OK" ? "✅" : "⚠️";
    const prog = r.program.padEnd(8);
    console.log(`${icon} [${prog}] ${r.file}`);
    console.log(`         ${r.reason}${r.chunks ? ` | ${r.chunks} chunks` : ""}`);
  }
  console.log("══════════════════════════════════════════════");
  console.log(`✅ เสร็จสิ้น! ${totalChunks} chunks จาก ${groups.length - skipped} กลุ่ม`);
  if (skipped) console.log(`⚠️  ข้าม ${skipped} กลุ่ม (อ่านไม่ได้)`);

  try {
    const res   = await axios.get(`${QDRANT_URL}/collections/${COLLECTION}`);
    const count = res.data.result?.points_count || 0;
    console.log(`📦 Qdrant: ${count.toLocaleString()} points รวมทั้งหมด`);
  } catch { /* ignore */ }
}

main().catch(console.error);
