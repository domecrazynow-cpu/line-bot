// scripts/buildRichmenu.js
// รวมรูป 3 ปุ่มเป็น richmenu.png ไฟล์เดียว
//
// วิธีใช้:
//   1. วางรูปไว้ใน public/
//        public/btn-program.png   ← หลักสูตร (ซ้ายใหญ่)
//        public/btn-tuition.png   ← ค่าเทอม  (ขวาบน)
//        public/btn-contact.png   ← ติดต่อคณะ (ขวาล่าง)
//   2. รัน:  node scripts/buildRichmenu.js
//   3. ได้   public/richmenu.png  พร้อม upload ขึ้น LINE

const { createCanvas, loadImage } = require("canvas");
const fs   = require("fs");
const path = require("path");

const W       = 2500;
const H       = 1686;
const SPLIT_X = 1667;
const SPLIT_Y = 843;

const ROOT = path.join(__dirname, "../public");

const SOURCES = {
  program : path.join(ROOT, "btn-program.png"),
  tuition : path.join(ROOT, "btn-tuition.png"),
  contact : path.join(ROOT, "btn-contact.png"),
};

const OUT = path.join(ROOT, "richmenu.png");

async function build() {
  // ตรวจว่ามีไฟล์ครบไหม
  const missing = Object.entries(SOURCES)
    .filter(([, p]) => !fs.existsSync(p))
    .map(([k]) => k);

  if (missing.length) {
    console.error("❌ ไม่พบไฟล์:", missing.map(k => `public/btn-${k}.png`).join(", "));
    console.error("   วางรูปให้ครบก่อนแล้วรันใหม่");
    process.exit(1);
  }

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // โหลดรูปทั้ง 3
  const [imgProgram, imgTuition, imgContact] = await Promise.all([
    loadImage(SOURCES.program),
    loadImage(SOURCES.tuition),
    loadImage(SOURCES.contact),
  ]);

  // ซ้ายใหญ่ — หลักสูตร  (0, 0) → 1667 × 1686
  ctx.drawImage(imgProgram, 0, 0, SPLIT_X, H);

  // ขวาบน — ค่าเทอม      (1667, 0) → 833 × 843
  ctx.drawImage(imgTuition, SPLIT_X, 0, W - SPLIT_X, SPLIT_Y);

  // ขวาล่าง — ติดต่อคณะ  (1667, 843) → 833 × 843
  ctx.drawImage(imgContact, SPLIT_X, SPLIT_Y, W - SPLIT_X, H - SPLIT_Y);

  // เส้นแบ่งบางๆ
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth   = 4;
  ctx.beginPath();
  ctx.moveTo(SPLIT_X, 0);       ctx.lineTo(SPLIT_X, H);
  ctx.moveTo(SPLIT_X, SPLIT_Y); ctx.lineTo(W, SPLIT_Y);
  ctx.stroke();

  // บันทึกไฟล์
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(OUT, buffer);

  console.log("✅ สร้าง richmenu.png สำเร็จ!");
  console.log(`   ขนาด: ${W} × ${H} px`);
  console.log(`   ไฟล์: ${OUT}`);
  console.log("");
  console.log("👉 Restart server เพื่อ upload ขึ้น LINE:");
  console.log("   docker-compose restart app");
}

build().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
