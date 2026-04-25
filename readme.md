## Setup

1. Clone repo
   git clone https://github.com/domecrazynow-cpu/line-bot.git
   cd line-bot

2. Install dependencies
   npm install

3. Install Ollama
   - Windows:  winget install Ollama.Ollama
   - macOS:    brew install ollama
   - Linux:    curl -fsSL https://ollama.com/install.sh | sh

4. Pull the model (ครั้งแรกครั้งเดียว)
   ollama pull llama3.2

5. Create `.env`
   LINE_TOKEN=<channel access token จาก LINE Developers Console>
   OLLAMA_MODEL=llama3.2

6. Run the bot
   npm run dev

## Test (no LINE needed)

   Open http://localhost:3000/ai-test?msg=สวัสดี

## Test with LINE

1. Install ngrok:  winget install Ngrok.Ngrok
2. New terminal:   ngrok http 3000
    - if not work run `ngrok update` to use new version
3. Copy the https URL → LINE Console → Messaging API
   → Webhook URL = <ngrok URL>/webhook → Update → Verify → enable "Use webhook"
4. Disable "Auto-reply messages" in LINE Console
5. Add the bot via QR code, send a message