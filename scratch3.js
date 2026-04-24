require("dotenv").config();
const fetch = require("node-fetch");
const h = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
const models = [
  "google/gemini-2.5-flash",
  "nvidia/nemotron-nano-12b-v2-vl:free"
];

async function test() {
  const messages = [
    { role: "user", content: [
        { type: "text", text: "What flower is this?" },
        { type: "image_url", image_url: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Rosa_rubiginosa_1.jpg/1200px-Rosa_rubiginosa_1.jpg" } }
      ]
    }
  ];
  for (const m of models) {
    try {
      console.log("Trying", m);
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: m, messages, max_tokens: 100 }) });
      const d = await r.json();
      console.log(m, "=>", JSON.stringify(d).substring(0, 200));
    } catch(e) { console.error(e); }
  }
}
test();
