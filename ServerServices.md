# 🔧 FIET LINE Bot — Services Guide
### ngrok + Ollama + Qdrant ฉบับสมบูรณ์

---

## 📋 สารบัญ
1. [ngrok](#ngrok)
2. [Ollama](#ollama)
3. [Qdrant](#qdrant)
4. [ใช้ร่วมกัน — Flow ทั้งระบบ](#together)
5. [ปัญหาที่พบและวิธีแก้](#troubleshooting)

---

# 🌐 ngrok {#ngrok}

## ngrok คืออะไร
ngrok สร้าง HTTPS tunnel จาก internet → localhost ทำให้ LINE Platform ส่ง webhook มาหา bot ที่รันบนเครื่องตัวเองได้

```
LINE Platform
    ↓ HTTPS
https://xxx.ngrok-free.dev    ← ngrok URL (public)
    ↓ tunnel
http://localhost:3000          ← bot บนเครื่องเรา
```

## ติดตั้ง ngrok

### Windows
```bash
# วิธีที่ 1 — Chocolatey
choco install ngrok

# วิธีที่ 2 — ดาวน์โหลดตรง
# https://ngrok.com/download → unzip → วางใน PATH
```

### ตั้งค่า Auth Token (ทำครั้งเดียว)
```bash
# สมัคร https://ngrok.com แล้ว copy token
ngrok config add-authtoken YOUR_TOKEN_HERE
```

## คำสั่ง ngrok

```bash
# รัน tunnel port 3000 (ใช้บ่อยสุด)
ngrok http 3000

# รันพร้อม static domain (ฟรี 1 domain ต่อ account)
ngrok http --domain=your-name.ngrok-free.app 3000

# รัน port 80 (ถ้า bot รันที่ 80)
ngrok http 80

# ดู dashboard ngrok
# เปิด browser: http://localhost:4040
```

## อ่าน output ngrok

```
Session Status    online
Account           domecrazynow-cpu (Plan: Free)
Version           3.39.2
Region            Asia Pacific (ap)
Latency           33ms
Web Interface     http://127.0.0.1:4040        ← dashboard
Forwarding        https://xxx.ngrok-free.dev → http://localhost:3000

Connections       ttl    opn    rt1    rt5    p50    p90
                  18     0      0.00   0.00   75.07  76.49

HTTP Requests
───────────────
02:59:40 +07 POST /webhook    200 OK         ← ปกติ
02:59:26 +07 POST /webhook    401 Unauthorized  ← signature ผิด
```

## Status Codes ที่พบ

| Code | ความหมาย | วิธีแก้ |
|------|---------|---------|
| 200 OK | ปกติ ✅ | — |
| 401 Unauthorized | LINE_CHANNEL_SECRET ผิด | เช็ค .env |
| 404 Not Found | route ไม่มี | เช็ค URL |
| 502 Bad Gateway | bot ไม่ได้รัน | npm run dev |
| 504 Gateway Timeout | bot ช้าเกิน 30s | แก้ performance |

## ตั้งค่าใน LINE Developers Console

1. เปิด https://developers.line.biz
2. เลือก Channel → **Messaging API**
3. **Webhook URL** → ใส่:
   ```
   https://xxx.ngrok-free.dev/webhook
   ```
4. เปิด **Use webhook** = ON
5. กด **Verify** → ต้องได้ Success

⚠️ **ngrok Free — URL เปลี่ยนทุกครั้งที่ restart**
→ ต้องอัปเดต LINE Console ทุกครั้ง
→ แก้ด้วย static domain (ฟรี 1 domain)

## Static Domain (แนะนำ)

```bash
# ขอ static domain ฟรีที่ https://dashboard.ngrok.com/cloud-edge/domains
# แล้วรัน
ngrok http --domain=fiet-kmutt-bot.ngrok-free.app 3000
```

URL จะไม่เปลี่ยนอีกต่อไป ไม่ต้องอัปเดต LINE Console ทุกครั้ง ✅

## ngrok Dashboard (http://localhost:4040)

```
เปิด browser → http://localhost:4040
```
ดูได้:
- HTTP requests ทั้งหมด
- Request/Response headers และ body
- Replay request ใหม่ได้
- ดีมากสำหรับ debug webhook

---

# 🦙 Ollama {#ollama}

## Ollama คืออะไร
Ollama รัน AI model บนเครื่องตัวเอง ในโปรเจกต์นี้ใช้สำหรับ:
- **nomic-embed-text** — แปลงข้อความ → vector (768 dimensions) สำหรับ RAG
- **llama3.2** — สำรอง (ปัจจุบันใช้ Groq แทน)

```
ข้อความ "ครุไฟฟ้าเรียนอะไรบ้าง"
    ↓ Ollama (nomic-embed-text)
[0.123, -0.456, 0.789, ...] (768 ตัวเลข)
    ↓
Qdrant ค้นหา vectors ที่ใกล้เคียง
    ↓
ได้ข้อความจาก PDF ที่เกี่ยวข้อง
```

## ติดตั้ง Ollama

### Windows (รันบน Host โดยตรง)
```bash
# ดาวน์โหลดจาก https://ollama.com/download/windows
# ติดตั้งแล้ว Ollama จะรันเป็น background service อัตโนมัติ

# ตรวจสอบ
ollama --version
```

### Docker
```bash
# รัน Ollama container
docker compose up -d ollama

# หรือรันแบบ standalone
docker run -d -p 11434:11434 -v ollama_data:/root/.ollama ollama/ollama
```

## คำสั่ง Ollama

```bash
# ดู models ที่ติดตั้งแล้ว
ollama list

# Pull model (ทำครั้งแรก)
ollama pull nomic-embed-text    # 274 MB — สำหรับ embedding
ollama pull llama3.2            # 2 GB — สำหรับ chat (optional)

# รัน model แบบ interactive
ollama run llama3.2

# ลบ model
ollama rm llama3.2

# ดู model info
ollama show nomic-embed-text
```

## คำสั่งเมื่อใช้ใน Docker
```bash
# Pull model ใน container
docker compose exec ollama ollama pull nomic-embed-text

# ดู models
docker compose exec ollama ollama list

# เช็ค logs
docker compose logs -f ollama
```

## Ollama API

```bash
# เช็คว่ารันอยู่ไหม
curl http://localhost:11434/api/tags

# ทดสอบ embedding
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","prompt":"ทดสอบ"}'
# ผลลัพธ์: {"embedding":[0.123, -0.456, ...]} (768 ตัวเลข)

# PowerShell
Invoke-WebRequest -Uri "http://localhost:11434/api/tags" | Select-Object -ExpandProperty Content
```

## Models ที่ใช้ในโปรเจกต์

| Model | ขนาด | หน้าที่ | RAM |
|-------|------|---------|-----|
| nomic-embed-text | 274 MB | แปลงข้อความ → vector | ~1 GB |
| llama3.2 | 2 GB | Chat (สำรอง) | ~4 GB |

## ความเร็ว Ollama

| Hardware | เวลา embed 1 chunk |
|----------|-------------------|
| CPU เท่านั้น | 1-3 วินาที |
| GPU (NVIDIA) | 0.01-0.1 วินาที |

**สำหรับ 15,000 chunks:**
- CPU: ~8-12 ชั่วโมง (ถ้าช้า)
- GPU: ~5-15 นาที

⚠️ **Ingest ครั้งเดียวพอ** — หลัง ingest แล้ว Qdrant เก็บ vectors ไว้ถาวร ไม่ต้องทำใหม่

## ทางเลือกแทน Ollama (เร็วกว่า)

### Jina AI (ฟรี 1M tokens/เดือน)
```bash
# สมัคร https://jina.ai แล้วได้ API key ฟรี
```

แก้ `utils/rag.js`:
```js
async function getEmbedding(text) {
  const res = await axios.post(
    "https://api.jina.ai/v1/embeddings",
    {
      input: [text],
      model: "jina-embeddings-v2-base-multilingual"  // รองรับภาษาไทย
    },
    {
      headers: { Authorization: `Bearer ${process.env.JINA_API_KEY}` },
      timeout: 10000
    }
  );
  return res.data.data[0].embedding;
}
```

เพิ่มใน `.env`:
```env
JINA_API_KEY=jina_xxxxxxxxxxxxx
```

**ข้อดี:** เร็วกว่า Ollama 100x, ไม่ต้องรัน server เพิ่ม, รองรับภาษาไทย

---

# 🔵 Qdrant {#qdrant}

## Qdrant คืออะไร
Qdrant คือ Vector Database — เก็บข้อมูลเป็น vectors และค้นหาด้วย similarity search

```
เก็บ:
PDF chunks → Ollama → vectors → Qdrant

ค้นหา:
คำถาม → Ollama → vector → Qdrant cosine similarity → chunks ที่ใกล้เคียงสุด
```

## ติดตั้ง Qdrant

### Docker (แนะนำ)
```bash
# รันด้วย Docker Compose
docker compose up -d qdrant

# หรือรันแบบ standalone
docker run -d -p 6333:6333 -v qdrant_data:/qdrant/storage qdrant/qdrant
```

### Windows (ไม่ใช้ Docker)
```bash
# ดาวน์โหลดจาก https://github.com/qdrant/qdrant/releases
# แตก zip แล้วรัน
./qdrant.exe
```

## Qdrant API — คำสั่งที่ใช้บ่อย

```powershell
# เช็คสถานะ
Invoke-WebRequest -Uri "http://localhost:6333" | Select-Object -ExpandProperty Content

# ดู collections ทั้งหมด
Invoke-WebRequest -Uri "http://localhost:6333/collections" | Select-Object -ExpandProperty Content

# เช็ค collection knowledge
Invoke-WebRequest -Uri "http://localhost:6333/collections/knowledge" | Select-Object -ExpandProperty Content

# ดูจำนวน points
# ดูที่ "points_count" ใน response ด้านบน
```

```bash
# curl (ถ้ามี)
curl http://localhost:6333/collections/knowledge
```

## ทำความเข้าใจ Response

```json
{
  "result": {
    "status": "green",          ← พร้อมใช้งาน
    "points_count": 15980,      ← จำนวน chunks ที่ ingest แล้ว
    "indexed_vectors_count": 13712,
    "config": {
      "params": {
        "vectors": {
          "size": 768,          ← ขนาด vector (nomic-embed-text = 768)
          "distance": "Cosine"  ← วิธีวัดความใกล้เคียง
        }
      }
    }
  }
}
```

**points_count > 0** = มีข้อมูลพร้อมใช้ ✅
**points_count = 0** = ต้อง ingest ก่อน ❌

## Qdrant Dashboard (Web UI)

```
เปิด browser → http://localhost:6333/dashboard
```

ดูได้:
- Collections ทั้งหมด
- จำนวน points
- ค้นหาทดสอบได้
- ดู payload ของแต่ละ point

## Qdrant Collections

```bash
# ลบ collection (ระวัง! ข้อมูลหาย ต้อง ingest ใหม่)
curl -X DELETE http://localhost:6333/collections/knowledge

# PowerShell
Invoke-WebRequest -Uri "http://localhost:6333/collections/knowledge" -Method DELETE

# สร้าง collection ใหม่ (ingest.js ทำให้อัตโนมัติ)
curl -X PUT http://localhost:6333/collections/knowledge \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":768,"distance":"Cosine"}}'
```

## Qdrant Cloud (ฟรี)

ถ้าไม่อยากรัน Qdrant เอง:

1. สมัคร https://cloud.qdrant.io (ฟรี 1GB)
2. สร้าง Cluster
3. copy URL และ API Key
4. แก้ `.env`:
```env
QDRANT_URL=https://xxx.eu-central.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=xxxxxxxxxx
```
5. แก้ `utils/rag.js` เพิ่ม header:
```js
const headers = {};
if (process.env.QDRANT_API_KEY) {
  headers["api-key"] = process.env.QDRANT_API_KEY;
}

// ใช้ใน axios calls
await axios.post(`${QDRANT_URL}/...`, body, { headers, timeout: 5000 });
```

---

# 🔗 ใช้ร่วมกัน — Flow ทั้งระบบ {#together}

## Development (บนเครื่องตัวเอง)

```
Terminal 1: ollama serve (ถ้าไม่ได้ใช้ Docker)
Terminal 2: docker compose up -d qdrant (หรือ qdrant.exe)
Terminal 3: npm run dev
Terminal 4: ngrok http 3000
```

## Production (Docker ทั้งหมด)

```bash
docker compose up -d   # รันทุก services รวมถึง nginx ที่ port 80
```

ไม่ต้องใช้ ngrok เพราะ nginx expose port 80 สู่ internet โดยตรง

## .env สำหรับแต่ละ environment

### Development (รันบน Host)
```env
OLLAMA_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
PORT=3000
```

### Production (Docker)
```env
# .env ยังคงเป็น localhost
# แต่ docker-compose.yml override ด้วย:
# environment:
#   - OLLAMA_URL=http://ollama:11434
#   - QDRANT_URL=http://qdrant:6333
PORT=3000
```

## Checklist ก่อนใช้งาน

```bash
# 1. เช็ค ngrok
curl http://localhost:4040/api/tunnels

# 2. เช็ค Ollama
curl http://localhost:11434/api/tags
# ต้องมี nomic-embed-text ใน models

# 3. เช็ค Qdrant
curl http://localhost:6333/collections/knowledge
# ต้องมี points_count > 0

# 4. เช็ค Bot
curl http://localhost:3000
# ต้องได้ "Bot is running 🚀"

# 5. เช็ค LINE Webhook
# LINE Console → Verify → Success
```

---

# 🔧 ปัญหาที่พบและวิธีแก้ {#troubleshooting}

## ngrok

### ❌ ngrok URL เปลี่ยนทุกครั้ง
**แก้:** ใช้ static domain ฟรี
```bash
ngrok http --domain=your-name.ngrok-free.app 3000
```

### ❌ 401 Unauthorized ใน ngrok log
**สาเหตุ:** LINE_CHANNEL_SECRET ไม่ตรง
**แก้:**
1. เปิด LINE Console → Basic settings → copy Channel secret
2. ใส่ใน .env: `LINE_CHANNEL_SECRET=xxx`
3. restart bot

### ❌ 502 Bad Gateway ใน ngrok log
**สาเหตุ:** bot ไม่ได้รัน
**แก้:** `npm run dev`

### ❌ ngrok forward ไปผิด port
**ตรวจสอบ:** ดูบรรทัด Forwarding ใน ngrok
```
Forwarding: https://xxx → http://localhost:80   ← ผิด ถ้า bot รัน :3000
Forwarding: https://xxx → http://localhost:3000 ← ถูก
```
**แก้:** รัน `ngrok http 3000`

---

## Ollama

### ❌ Ollama ช้ามาก (embed 1 chunk ใช้เวลา 3+ วินาที)
**สาเหตุ:** รันบน CPU ไม่มี GPU
**แก้ระยะสั้น:** ใช้ embedding cache ใน rag.js
**แก้ระยะยาว:** เปลี่ยนใช้ Jina AI API

### ❌ connection refused ที่ port 11434
**สาเหตุ:** Ollama ไม่ได้รัน
**แก้:**
```bash
# Windows
ollama serve

# Docker
docker compose up -d ollama
```

### ❌ model not found
**สาเหตุ:** ยังไม่ได้ pull model
**แก้:**
```bash
ollama pull nomic-embed-text
# หรือใน Docker
docker compose exec ollama ollama pull nomic-embed-text
```

### ❌ OLLAMA_URL=http://ollama:11434/v1 (มี /v1 ต่อท้าย)
**สาเหตุ:** /v1 ใช้สำหรับ OpenAI-compatible API ไม่ใช่ embedding API
**แก้:** ลบ /v1 ออก
```env
OLLAMA_URL=http://localhost:11434
```

---

## Qdrant

### ❌ points_count = 0
**สาเหตุ:** ยังไม่ได้ ingest
**แก้:** `node scripts/ingest.js`

### ❌ collection ไม่มี
**สาเหตุ:** Qdrant เพิ่งติดตั้งใหม่ หรือ volumes ถูกลบ
**แก้:** `node scripts/ingest.js` (จะสร้าง collection ให้อัตโนมัติ)

### ❌ ข้อมูลหายหลัง restart Docker
**สาเหตุ:** ไม่มี volume mount
**แก้:** ตรวจสอบ docker-compose.yml มี:
```yaml
qdrant:
  volumes:
    - qdrant_data:/qdrant/storage
volumes:
  qdrant_data:
```

### ❌ score ต่ำ (< 0.5) ทุก query
**สาเหตุ:** ข้อมูลใน PDF กับคำถามไม่ตรงกัน หรือ embedding model ไม่เหมาะ
**แก้:**
- ลองใช้ multilingual model เช่น `jina-embeddings-v2-base-multilingual`
- เพิ่ม keywords ใน query ก่อนส่ง Qdrant (ทำใน buildRagQuery แล้ว)
- ลด threshold จาก 0.5 เป็น 0.4 ใน rag.js

---

## ทั้งสามระบบ

### ❌ RAG ไม่ทำงาน ทั้งที่ทุกอย่างดูปกติ
**เช็คตามลำดับ:**
```
1. Qdrant points_count > 0?
   → curl http://localhost:6333/collections/knowledge

2. Ollama มี nomic-embed-text?
   → curl http://localhost:11434/api/tags

3. OLLAMA_URL ใน .env ถูกต้อง?
   → ต้องไม่มี /v1 ต่อท้าย
   → ต้องไม่มีบรรทัดซ้ำ

4. Bot log บอกอะไร?
   → [rag] not ready = Qdrant ไม่ได้ connect
   → [rag] Ollama timeout = Ollama ช้าหรือไม่ตอบสนอง
   → [rag] found 0 chunks = score ต่ำเกิน threshold
```

---

## 📊 สรุป Ports ทั้งหมด

| Service | Port | URL | หน้าที่ |
|---------|------|-----|---------|
| Bot (Node.js) | 3000 | http://localhost:3000 | LINE Bot API |
| nginx | 80 | http://localhost | Reverse Proxy |
| Ollama | 11434 | http://localhost:11434 | Embedding API |
| Qdrant | 6333 | http://localhost:6333 | Vector DB API |
| Qdrant Dashboard | 6333 | http://localhost:6333/dashboard | Web UI |
| ngrok Dashboard | 4040 | http://localhost:4040 | ngrok Web UI |

---

*อัปเดตล่าสุด: พฤษภาคม 2026*