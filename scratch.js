require("dotenv").config();
const fetch = require("node-fetch");
const h = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
const providers = [
  { url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-1.5-flash", headers: h },
  { url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-2.0-flash-exp:free", headers: h }
];

async function test() {
  const messages = [
    { role: "user", content: [
        { type: "text", text: "What is this?" },
        { type: "image_url", image_url: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Rosa_rubiginosa_1.jpg/1200px-Rosa_rubiginosa_1.jpg" } }
      ]
    }
  ];
  for (const p of providers) {
    try {
      console.log("Trying", p.model);
      const r = await fetch(p.url, { method: "POST", headers: p.headers, body: JSON.stringify({ model: p.model, messages, max_tokens: 100 }) });
      const d = await r.json();
      console.log(p.model, "=>", JSON.stringify(d).substring(0, 200));
    } catch(e) { console.error(e); }
  }
}
test();
