# 🤖 FIET LINE Bot — คู่มือ Deploy ฉบับสมบูรณ์
### ตั้งแต่ต้นจนจบ + ปัญหาที่พบและวิธีแก้

---

## 📋 สารบัญ
1. [Architecture ระบบ](#architecture)
2. [Prerequisites สิ่งที่ต้องมีก่อน](#prerequisites)
3. [Step 1 — Clone & ติดตั้ง](#step-1)
4. [Step 2 — ตั้งค่า .env](#step-2)
5. [Step 3 — LINE Developers Console](#step-3)
6. [Step 4 — รัน Services](#step-4)
7. [Step 5 — Ingest PDF](#step-5)
8. [Step 6 — Rich Menu Image](#step-6)
9. [Step 7 — Expose ด้วย ngrok](#step-7)
10. [Step 8 — ทดสอบ](#step-8)
11. [Deploy บน Server มหาลัย](#deploy-server)
12. [Deploy ฟรีบน Cloud](#deploy-cloud)
13. [ปัญหาที่พบและวิธีแก้](#troubleshooting)

---

## 🏗️ Architecture {#architecture}

```
LINE Platform
    ↓ HTTPS Webhook
ngrok / Server IP
    ↓ Port 80 หรือ 3000
Node.js Express (index.js)
    ↓
├── Groq API (llama-3.3-70b) — ตอบคำถาม
├── Ollama (nomic-embed-text) — แปลงข้อความเป็น vector
└── Qdrant Vector DB — เก็บ PDF embeddings
```

---

## ✅ Prerequisites {#prerequisites}

| สิ่งที่ต้องมี | Version | ดาวน์โหลด |
|---|---|---|
| Node.js | v18+ | https://nodejs.org |
| Docker Desktop | latest | https://docker.com |
| Git | latest | https://git-scm.com |
| ngrok | latest | https://ngrok.com |
| LINE Developers Account | — | https://developers.line.biz |
| Groq API Key | — | https://console.groq.com |

---

## 📦 Step 1 — Clone & ติดตั้ง {#step-1}

```bash
# Clone repo
git clone https://github.com/domecrazynow-cpu/line-bot.git
cd line-bot

# ติดตั้ง dependencies
npm install

# ติดตั้ง packages เพิ่มเติม (ถ้ายังไม่มี)
npm install mammoth pdfjs-dist@2.16.105 canvas
npm audit fix
```

---

## ⚙️ Step 2 — ตั้งค่า .env {#step-2}

สร้างไฟล์ `.env` ในโฟลเดอร์ root:

```env
# LINE (จาก LINE Developers Console)
LINE_TOKEN=ใส่ Channel Access Token
LINE_CHANNEL_SECRET=ใส่ Channel Secret
LIFF_ID=ใส่ LIFF ID

# Groq AI (จาก console.groq.com)
GROQ_API_KEY=ใส่ Groq API Key

# Ollama + Qdrant (local)
OLLAMA_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
OLLAMA_MODEL=llama3.2

# App
AI_PROVIDER=groq
PORT=3000

# Admin (ตั้งรหัสเอง)
ADMIN_SECRET=ตั้งรหัสแอดมินเอง
```

⚠️ **ข้อควรระวัง:**
- ห้ามมี `OLLAMA_URL` สองบรรทัด (dotenv อ่านค่าแรก)
- `LINE_CHANNEL_SECRET` ต้องตรงกับใน LINE Console ทุกตัวอักษร
- ห้าม commit ไฟล์ `.env` ขึ้น GitHub

---

## 📱 Step 3 — LINE Developers Console {#step-3}

### 3.1 สร้าง Channel
1. เปิด https://developers.line.biz
2. สร้าง Provider → สร้าง **Messaging API** Channel
3. เข้า Channel → **Basic settings** → copy **Channel secret** ใส่ `.env`
4. เข้า **Messaging API** tab → **Issue** Channel access token → copy ใส่ `.env`

### 3.2 ตั้งค่า Webhook
1. เข้า **Messaging API** tab
2. **Webhook URL** → ใส่ URL จาก ngrok เช่น `https://xxx.ngrok-free.dev/webhook`
3. เปิด **Use webhook** = ON
4. กด **Verify** → ต้องได้ Success

### 3.3 สร้าง LIFF
1. เข้า **LIFF** tab → Add
2. Size: **Full**
3. Endpoint URL: `https://xxx.ngrok-free.dev/liff`
4. copy LIFF ID ใส่ `.env`

---

## 🐳 Step 4 — รัน Services {#step-4}

### วิธีที่ 1 — Docker Compose (แนะนำ)
```bash
# รัน Qdrant + Ollama
docker compose up -d qdrant ollama

# รอ 30 วินาที แล้วเช็ค
docker compose ps

# Pull model nomic-embed-text
docker compose exec ollama ollama pull nomic-embed-text
```

### วิธีที่ 2 — รันตรงบน Windows
```bash
# Ollama — ดาวน์โหลดจาก https://ollama.com
ollama serve
ollama pull nomic-embed-text

# Qdrant — ดาวน์โหลดจาก https://qdrant.tech/documentation/guides/installation/
./qdrant.exe
```

### เช็คสถานะ
```powershell
# เช็ค Qdrant
Invoke-WebRequest -Uri "http://localhost:6333/collections" | Select-Object -ExpandProperty Content

# เช็ค Ollama
Invoke-WebRequest -Uri "http://localhost:11434/api/tags" | Select-Object -ExpandProperty Content
```

---

## 📄 Step 5 — Ingest PDF {#step-5}

```bash
# วาง PDF ทั้งหมดใน folder pdfs/
# แล้วรัน ingest
node scripts/ingest.js
```

ผลที่ควรได้:
```
✅ เสร็จสิ้น!
   15349 chunks จาก 20 ไฟล์
   📦 Qdrant: 15,980 points รวมทั้งหมด
```

⚠️ **ถ้า ingest ช้า** — Ollama รันบน CPU ปกติใช้เวลา 30-60 นาทีสำหรับ 20 ไฟล์

---

## 🖼️ Step 6 — Rich Menu Image {#step-6}

```bash
# วางรูป richmenu.png ขนาด 2500x1686px ใน public/
# ถ้ารูปใหญ่เกิน 1MB ให้ compress ก่อน
node -e "
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
loadImage('./public/richmenu.png').then(img => {
  const canvas = createCanvas(2500, 1686);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 2500, 1686);
  const buf = canvas.toBuffer('image/jpeg', { quality: 0.6 });
  fs.writeFileSync('./public/richmenu.png', buf);
  console.log('Size:', (buf.length/1024).toFixed(0), 'KB');
});
"
```

LINE รับได้สูงสุด **1 MB** เท่านั้น

---

## 🌐 Step 7 — Expose ด้วย ngrok {#step-7}

```bash
# Terminal ใหม่
ngrok http 3000
```

copy URL เช่น `https://granola-parchment-unsoiled.ngrok-free.dev`
แล้วนำไปใส่ใน LINE Developers Console → Webhook URL → `/webhook` ต่อท้าย

⚠️ **ngrok Free** URL เปลี่ยนทุกครั้งที่ restart → ต้องอัปเดต LINE Console ทุกครั้ง

---

## 🧪 Step 8 — ทดสอบ {#step-8}

```bash
# รัน bot
npm run dev
```

ทดสอบใน browser (ถ้าเอา requireAdmin ออกชั่วคราว):
```
http://localhost:3000/ai-test?msg=ครุไฟฟ้าเรียนอะไรบ้าง
```

log ที่ควรเห็นใน terminal:
```
[rag] found 5 chunks, score: 0.721
```

ถ้า RAG ทำงาน → คำตอบจะมีข้อมูลจาก PDF จริงๆ

---

## 🖥️ Deploy บน Server มหาลัย {#deploy-server}

**Server Spec:** Windows Server, Xeon W5-3425, 32GB RAM, Port 80 เปิด, ไม่มี SSH

### ขั้นตอน (ทำที่เครื่อง Server โดยตรง)

```bash
# 1. ติดตั้ง Git, Docker Desktop, Node.js บน Windows Server

# 2. Clone repo
git clone https://github.com/domecrazynow-cpu/line-bot.git
cd line-bot

# 3. copy .env จากเครื่องเดิม

# 4. copy pdfs/ folder จากเครื่องเดิม

# 5. รัน Docker services
docker compose up -d qdrant ollama

# 6. Pull model
docker compose exec ollama ollama pull nomic-embed-text

# 7. Ingest PDF
node scripts/ingest.js

# 8. รัน bot ที่ port 80
# แก้ .env: PORT=80
npm start
```

### ตั้งค่า LINE Webhook
- Webhook URL: `http://IP-SERVER/webhook`
- ไม่ต้องใช้ ngrok เพราะ Port 80 เปิดอยู่แล้ว

### Auto-start เมื่อ reboot
```bash
# ติดตั้ง pm2
npm install -g pm2
pm2 start index.js --name "fiet-bot"
pm2 startup
pm2 save
```

---

## ☁️ Deploy ฟรีบน Cloud {#deploy-cloud}

### Option A — Railway (แนะนำสุด)
1. สมัคร https://railway.app
2. New Project → Deploy from GitHub
3. เลือก repo `line-bot`
4. ตั้งค่า Environment Variables (copy จาก .env)
5. **ปัญหา:** Ollama ใช้ RAM เยอะ → ใช้ Qdrant Cloud แทน

### Option B — Qdrant Cloud (ฟรี 1GB)
1. สมัคร https://cloud.qdrant.io
2. สร้าง Cluster ฟรี
3. copy URL + API Key
4. แก้ `.env`:
```env
QDRANT_URL=https://xxx.eu-central.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=ใส่ API Key
```
5. แก้ `utils/rag.js` เพิ่ม header:
```js
headers: { "api-key": process.env.QDRANT_API_KEY }
```

### Option C — ใช้ Groq Embedding แทน Ollama (เร็วกว่ามาก)
แก้ `utils/rag.js` เปลี่ยนจาก Ollama เป็น Groq:
```js
async function getEmbedding(text) {
  // Groq ยังไม่มี embedding API — ใช้ OpenAI compatible แทน
  // แนะนำใช้ Jina AI ฟรี 1M tokens/เดือน
  const res = await axios.post(
    "https://api.jina.ai/v1/embeddings",
    { input: [text], model: "jina-embeddings-v2-base-en" },
    { headers: { Authorization: `Bearer ${process.env.JINA_API_KEY}` } }
  );
  return res.data.data[0].embedding;
}
```

---

## 🔧 ปัญหาที่พบและวิธีแก้ {#troubleshooting}

### ❌ 401 Unauthorized (webhook)
**สาเหตุ:** `LINE_CHANNEL_SECRET` ไม่ถูกต้อง
**แก้:**
1. เปิด https://developers.line.biz → Basic settings
2. copy Channel secret ใหม่ใส่ `.env`
3. `npm run dev`

---

### ❌ RAG ไม่ทำงาน / [rag] not ready
**สาเหตุ:** Ollama หรือ Qdrant ไม่ได้รัน หรือ URL ผิด
**แก้:**
```powershell
# เช็ค Qdrant
Invoke-WebRequest -Uri "http://localhost:6333/collections/knowledge"

# เช็ค Ollama  
Invoke-WebRequest -Uri "http://localhost:11434/api/tags"
```
ถ้า error → รัน services ใหม่

---

### ❌ OLLAMA_URL สองบรรทัดใน .env
**สาเหตุ:** dotenv อ่านค่าแรก ถ้ามี duplicate key
**แก้:** ลบบรรทัดซ้ำออก เหลือแค่:
```env
OLLAMA_URL=http://localhost:11434
```

---

### ❌ Rich Menu 413 Request Entity Too Large
**สาเหตุ:** รูปใหญ่เกิน 1MB
**แก้:** compress รูปก่อน upload (ดู Step 6)

---

### ❌ Cannot find module 'mammoth'
**แก้:**
```bash
npm install mammoth pdfjs-dist@2.16.105
```

---

### ❌ pdfjs-dist/legacy/build/pdf.js not found
**สาเหตุ:** pdfjs-dist version ใหม่เปลี่ยน path
**แก้:**
```bash
npm install pdfjs-dist@2.16.105
```

---

### ❌ Font warning ใน ingest
```
Warning: fetchStandardFontData: failed to fetch file "FoxitSerif.pfb"
```
**สาเหตุ:** pdfjs หา standard fonts ไม่เจอ
**แก้:** ใช้ `ingest.js` ที่แก้แล้ว (มี `standardFontDataUrl`)

---

### ❌ บอทตอบช้ามาก (timeout)
**สาเหตุ:** Ollama embed บน CPU ช้า
**แก้ระยะสั้น:** ใช้ `rag.js` ที่มี embedding cache
**แก้ระยะยาว:** ใช้ GPU หรือเปลี่ยนไปใช้ Jina/OpenAI embedding API

---

### ❌ ngrok URL เปลี่ยนทุกครั้ง
**สาเหตุ:** ngrok Free ไม่มี static domain
**แก้:** สมัคร ngrok Free static domain (ฟรี 1 domain)
```bash
ngrok http --domain=your-domain.ngrok-free.app 3000
```

---

### ❌ nodemon อยู่ใน dependencies แทน devDependencies
**แก้ package.json:**
```json
"dependencies": { ... },
"devDependencies": {
  "nodemon": "^3.1.14"
}
```

---

### ❌ Admin secret รั่วใน URL query string
**สาเหตุ:** `req.query.secret` expose secret ใน server logs
**แก้:** ใช้ header เท่านั้น (แก้แล้วใน index.js ใหม่)

---

## 📊 สรุป Checklist ก่อน Deploy Production

- [ ] `LINE_CHANNEL_SECRET` ถูกต้อง → ไม่มี 401
- [ ] `OLLAMA_URL` ไม่มีบรรทัดซ้ำใน .env
- [ ] Qdrant มี points > 0
- [ ] Ollama มี nomic-embed-text
- [ ] Rich Menu image < 1MB
- [ ] `nodemon` อยู่ใน devDependencies
- [ ] ไม่มี `req.query.secret` ใน requireAdmin
- [ ] Webhook URL อัปเดตใน LINE Console แล้ว
- [ ] ทดสอบ `/ai-test` ได้คำตอบจาก RAG (มี `found: true`)
- [ ] ไม่มี `SETUP_RICHMENU=true` ทิ้งไว้ใน production .env

---

*อัปเดตล่าสุด: พฤษภาคม 2026*