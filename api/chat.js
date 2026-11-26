export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Nachricht fehlt" });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: "Du bist JARVIS, ein intelligenter deutscher KI-Assistent. Antworte hilfreich, natürlich und präzise. Sprich den Besitzer mit Baran an."
            }]
          },
          contents: [{
            parts: [{ text: message }]
          }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Gemini-Fehler"
      });
    }

    return res.status(200).json({
      reply: data.candidates?.[0]?.content?.parts?.[0]?.text || "Keine Antwort erhalten."
    });

  } catch (error) {
    return res.status(500).json({ error: "Serverfehler" });
  }
}
