# 🐳 FIET LINE Bot — Docker Guide ฉบับสมบูรณ์
### ตั้งแต่ต้นจนจบ + ปัญหาที่พบ

---

## 📋 สารบัญ
1. [Docker Architecture](#architecture)
2. [ไฟล์ที่เกี่ยวข้อง](#files)
3. [docker-compose.yml อธิบาย](#compose)
4. [Dockerfile อธิบาย](#dockerfile)
5. [คำสั่งที่ใช้บ่อย](#commands)
6. [Flow การ Deploy](#flow)
7. [Deploy บน Server มหาลัย](#server)
8. [ปัญหาที่พบและวิธีแก้](#troubleshooting)

---

## 🏗️ Docker Architecture {#architecture}

```
docker compose up -d
        ↓
┌─────────────────────────────────────────┐
│           Docker Network                │
│                                         │
│  ┌──────────┐    ┌──────────────────┐   │
│  │   app    │───▶│     ollama       │   │
│  │ :3000    │    │ :11434           │   │
│  │ Node.js  │    │ nomic-embed-text │   │
│  └────┬─────┘    └──────────────────┘   │
│       │                                  │
│       ▼          ┌──────────────────┐   │
│  ┌──────────┐    │     qdrant       │   │
│  │  nginx   │───▶│ :6333            │   │
│  │  :80     │    │ Vector DB        │   │
│  └──────────┘    └──────────────────┘   │
│                                         │
│  ┌──────────┐                           │
│  │ watchdog │  Monitor + Notify Users   │
│  └──────────┘                           │
└─────────────────────────────────────────┘
        ↓
  Port 80 → Internet → LINE Platform
```

**5 Services:**
| Service | Image | Port | หน้าที่ |
|---------|-------|------|---------|
| app | Dockerfile | 3000 | LINE Bot หลัก |
| nginx | nginx:alpine | 80 | Reverse Proxy |
| ollama | ollama/ollama | 11434 | Embedding Model |
| qdrant | qdrant/qdrant | 6333 | Vector Database |
| watchdog | Dockerfile.watchdog | — | Monitor + แจ้งเตือน |

---

## 📁 ไฟล์ที่เกี่ยวข้อง {#files}

```
line-bot/
├── docker-compose.yml       ← ตั้งค่า services ทั้งหมด
├── Dockerfile               ← build image สำหรับ app
├── Dockerfile.watchdog      ← build image สำหรับ watchdog
├── nginx/
│   └── nginx.conf           ← config reverse proxy
├── .env                     ← environment variables
└── .dockerignore            ← ไฟล์ที่ไม่ต้อง copy เข้า image
```

---

## 📄 docker-compose.yml อธิบาย {#compose}

```yaml
version: "3.8"

services:

  # ── LINE Bot หลัก ────────────────────────────────
  app:
    build: .                          # ใช้ Dockerfile ใน root
    restart: unless-stopped           # restart อัตโนมัติถ้า crash
    env_file: .env                    # โหลด .env
    environment:
      - OLLAMA_URL=http://ollama:11434   # ใช้ hostname ภายใน Docker
      - QDRANT_URL=http://qdrant:6333    # ใช้ hostname ภายใน Docker
    volumes:
      - ./public:/app/public          # share รูป richmenu
      - ./db:/app/db                  # share knowledge base
      - ./pdfs:/app/pdfs              # share PDF files
    depends_on:
      - ollama
      - qdrant
    networks:
      - botnet

  # ── Nginx Reverse Proxy ──────────────────────────
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"                       # expose port 80 สู่ internet
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
    networks:
      - botnet
    restart: unless-stopped

  # ── Ollama (Embedding Model) ─────────────────────
  ollama:
    image: ollama/ollama
    volumes:
      - ollama_data:/root/.ollama     # เก็บ model ไว้ไม่ต้อง pull ใหม่
    networks:
      - botnet
    restart: unless-stopped
    # ถ้ามี GPU เพิ่ม:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - capabilities: [gpu]

  # ── Qdrant Vector Database ───────────────────────
  qdrant:
    image: qdrant/qdrant
    volumes:
      - qdrant_data:/qdrant/storage   # เก็บ vectors ไว้ไม่หายเมื่อ restart
    networks:
      - botnet
    restart: unless-stopped

  # ── Watchdog Monitor ─────────────────────────────
  watchdog:
    build:
      context: .
      dockerfile: Dockerfile.watchdog
    env_file: .env
    depends_on:
      - app
    networks:
      - botnet
    restart: unless-stopped

# ── Volumes (persistent storage) ────────────────────
volumes:
  ollama_data:    # เก็บ AI models
  qdrant_data:    # เก็บ vector embeddings

# ── Network ──────────────────────────────────────────
networks:
  botnet:
    driver: bridge
```

---

## 📄 Dockerfile อธิบาย {#dockerfile}

```dockerfile
# ใช้ Node.js 20 Alpine (เบาที่สุด)
FROM node:20-alpine

# ติดตั้ง dependencies สำหรับ canvas (Rich Menu)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev

# กำหนด working directory
WORKDIR /app

# copy package.json ก่อน (cache layer)
COPY package*.json ./

# ติดตั้ง npm packages
RUN npm ci --only=production

# copy โค้ดทั้งหมด
COPY . .

# expose port
EXPOSE 3000

# รัน bot
CMD ["node", "index.js"]
```

---

## 🔧 nginx/nginx.conf อธิบาย

```nginx
events {}

http {
    server {
        listen 80;

        # forward ทุก request ไปที่ app:3000
        location / {
            proxy_pass http://app:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;

            # สำคัญมาก — ส่ง raw body ให้ LINE signature verify ได้
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}
```

---

## ⌨️ คำสั่งที่ใช้บ่อย {#commands}

### รัน / หยุด
```bash
# รันทุก services
docker compose up -d

# รันแค่บาง services
docker compose up -d qdrant ollama

# หยุดทุก services
docker compose down

# หยุดและลบ volumes (ระวัง! ข้อมูลหาย)
docker compose down -v

# restart service เดียว
docker compose restart app
```

### Build
```bash
# build ใหม่หลังแก้โค้ด
docker compose up -d --build

# build เฉพาะ service
docker compose build app
```

### Logs
```bash
# ดู log ทุก services
docker compose logs -f

# ดู log เฉพาะ app
docker compose logs -f app

# ดู log watchdog
docker compose logs -f watchdog

# ดู log 100 บรรทัดล่าสุด
docker compose logs --tail=100 app
```

### เช็คสถานะ
```bash
# เช็คว่า services รันอยู่ไหม
docker compose ps

# เช็ค resource usage
docker stats
```

### Ollama
```bash
# pull model (ครั้งแรก)
docker compose exec ollama ollama pull nomic-embed-text

# ดู models ที่มี
docker compose exec ollama ollama list

# ทดสอบ embedding
docker compose exec ollama ollama run nomic-embed-text
```

### Ingest PDF (ใน Docker)
```bash
# รัน ingest script ใน container app
docker compose exec app node scripts/ingest.js

# หรือรันบน host ตรงๆ (ถ้า QDRANT_URL และ OLLAMA_URL ชี้ localhost)
node scripts/ingest.js
```

### เข้า Shell
```bash
# เข้า shell ของ app container
docker compose exec app sh

# เข้า shell ของ qdrant
docker compose exec qdrant sh
```

---

## 🚀 Flow การ Deploy ตั้งแต่ต้น {#flow}

```
1. git clone repo
        ↓
2. สร้าง .env (ใส่ LINE_TOKEN, LINE_CHANNEL_SECRET, GROQ_API_KEY)
        ↓
3. วาง PDF ใน pdfs/
        ↓
4. วาง richmenu.png ใน public/ (ขนาด 2500x1686, < 1MB)
        ↓
5. docker compose up -d qdrant ollama
        ↓
6. docker compose exec ollama ollama pull nomic-embed-text
        ↓
7. node scripts/ingest.js  (หรือ docker compose exec app node scripts/ingest.js)
        ↓
8. docker compose up -d --build  (รันทุก services)
        ↓
9. ตั้ง Webhook URL ใน LINE Console
        ↓
10. ทดสอบ → ✅
```

---

## 🖥️ Deploy บน Server มหาลัย (Windows Server) {#server}

### สิ่งที่ต้องติดตั้งบน Server
- Git for Windows
- Docker Desktop for Windows
- Node.js (สำหรับรัน ingest โดยตรง)

### ขั้นตอน

```bash
# 1. Clone repo
git clone https://github.com/domecrazynow-cpu/line-bot.git
cd line-bot

# 2. copy .env จากเครื่อง dev มาวาง
# (ใช้ USB, network share, หรือ copy-paste)

# 3. copy pdfs/ จากเครื่อง dev มาวาง

# 4. copy public/richmenu.png มาวาง

# 5. รัน Qdrant + Ollama ก่อน
docker compose up -d qdrant ollama

# 6. รอ 1 นาที แล้ว pull model
docker compose exec ollama ollama pull nomic-embed-text

# 7. Ingest PDF (ใช้เวลานาน ~30-60 นาที)
node scripts/ingest.js

# 8. รัน ทุก services
docker compose up -d --build

# 9. ตั้ง LINE Webhook URL เป็น IP server
# http://[IP-SERVER]/webhook
```

### ทำให้ Auto-start เมื่อ Windows reboot
```
Docker Desktop → Settings → General
✅ เปิด "Start Docker Desktop when you log in"
```

Docker Compose จะ auto-start services ที่มี `restart: unless-stopped` ให้อัตโนมัติ

### เช็คสถานะบน Server
```powershell
# เช็ค services
docker compose ps

# เช็ค Qdrant
Invoke-WebRequest -Uri "http://localhost:6333/collections/knowledge" | Select-Object -ExpandProperty Content

# เช็ค Bot
Invoke-WebRequest -Uri "http://localhost:3000" | Select-Object -ExpandProperty Content
```

---

## 🔧 ปัญหาที่พบและวิธีแก้ {#troubleshooting}

### ❌ OLLAMA_URL ผิดเมื่อรันใน Docker
**สาเหตุ:** ใน Docker ต้องใช้ hostname ของ service ไม่ใช่ localhost
```env
# ผิด (ใช้สำหรับรันบน host โดยตรง)
OLLAMA_URL=http://localhost:11434

# ถูก (ใช้ใน Docker)
OLLAMA_URL=http://ollama:11434
QDRANT_URL=http://qdrant:6333
```
**แก้:** docker-compose.yml ควร override ค่าใน environment:
```yaml
app:
  env_file: .env
  environment:
    - OLLAMA_URL=http://ollama:11434
    - QDRANT_URL=http://qdrant:6333
```

---

### ❌ canvas ติดตั้งไม่ได้ใน Docker Alpine
**สาเหตุ:** canvas ต้องการ native libraries
**แก้:** เพิ่มใน Dockerfile:
```dockerfile
RUN apk add --no-cache cairo-dev pango-dev jpeg-dev giflib-dev python3 make g++
```

---

### ❌ Ollama ช้ามากบน CPU
**สาเหตุ:** ไม่มี GPU
**แก้ระยะสั้น:** ใช้ embedding cache ใน rag.js
**แก้ระยะยาว:** ใช้ Jina AI embedding API แทน (ฟรี 1M tokens/เดือน)
```env
JINA_API_KEY=ใส่ key จาก jina.ai
```

---

### ❌ Volumes หายหลัง docker compose down -v
**สาเหตุ:** `-v` flag ลบ volumes ด้วย
**แก้:** ใช้แค่ `docker compose down` (ไม่มี -v)
```bash
# ปลอดภัย — ข้อมูลไม่หาย
docker compose down

# อันตราย — ข้อมูลหาย ต้อง ingest ใหม่
docker compose down -v
```

---

### ❌ Port 80 ถูกใช้งานอยู่แล้ว
**แก้:** เปลี่ยน port ใน docker-compose.yml:
```yaml
nginx:
  ports:
    - "8080:80"   # เปลี่ยนจาก 80 เป็น 8080
```

---

### ❌ Watchdog spam แจ้ง "ระบบขัดข้อง" ทุกครั้งที่ restart
**สาเหตุ:** watchdog detect ว่า app หยุดแล้วแจ้ง users
**แก้ระหว่าง dev:** หยุด watchdog ก่อน
```bash
docker compose stop watchdog
npm run dev
```
**แก้ถาวร:** เพิ่ม delay ใน watchdog ก่อนแจ้ง (รอให้ bot พร้อมก่อน)

---

### ❌ ingest.js เชื่อม Ollama ไม่ได้เมื่อรันบน host
**สาเหตุ:** ingest.js รันบน host แต่ Ollama อยู่ใน Docker
**แก้:** ตรวจสอบ `.env` มี:
```env
OLLAMA_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
```
Docker expose port ออกมาที่ localhost อยู่แล้ว ถ้า compose ตั้งค่าถูกต้อง

---

## 📊 Checklist Docker ก่อน Deploy

- [ ] `docker compose ps` — ทุก services status = `Up`
- [ ] `docker compose logs app` — ไม่มี error
- [ ] Ollama มี nomic-embed-text (`docker compose exec ollama ollama list`)
- [ ] Qdrant มี points > 0
- [ ] nginx forward ถึง app (เปิด http://localhost ได้)
- [ ] LINE Webhook URL อัปเดตแล้ว
- [ ] OLLAMA_URL และ QDRANT_URL ใช้ Docker hostname (ไม่ใช่ localhost) ใน docker-compose environment

---

*อัปเดตล่าสุด: พฤษภาคม 2026*