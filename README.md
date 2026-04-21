# Chat Bot

Simple web chatbot with an Express backend and a masked API key setup.

## 1) Install

```bash
npm install
```

## 2) Add your key (masked pattern)

Create a `.env` file by copying `.env.example`, then replace the masked key with your real API key:

```env
OPENAI_API_KEY=sk-********************************
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

## 3) Run

```bash
npm start
```

Open: http://localhost:3000

## Notes

- The API key is never exposed in frontend JavaScript.
- Frontend calls `/api/chat`, backend calls the model API.
# KAIRO
