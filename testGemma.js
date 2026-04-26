

async function testGemma() {
  const apiKey = "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"; // from .env
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b:free",
      messages: [{role: "user", content: "Say hello!"}]
    })
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.log("Error Status:", res.status);
    console.log("Error Body:", errorText);
  } else {
    const data = await res.json();
    console.log("Success! Reply:", data.choices[0].message.content);
  }
}

testGemma();
