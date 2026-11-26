
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Methode nicht erlaubt." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { message } = req.body || {};

    if (!apiKey) {
      return res.status(500).json({ error: "API-Schlüssel fehlt." });
    }

    if (!message) {
      return res.status(400).json({ error: "Nachricht fehlt." });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          model: "gemini-3.5-flash-lite",
          input: message,
          system_instruction:
            "Du bist JARVIS, ein intelligenter deutscher KI-Assistent. Antworte hilfreich, natürlich und präzise. Nenne deinen Besitzer Baran, wenn es passt.",
          store: false
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Google API:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Google API Fehler."
      });
    }

    const reply =
      data.output_text ||
      data.output?.map(item =>
        item.content?.map(part => part.text || "").join("")
      ).join("\n") ||
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "").join("\n") ||
      "";

    if (!reply.trim()) {
      console.error("Unerwartete Google-Antwort:", data);
      return res.status(502).json({
        error: "Google hat keinen lesbaren Antworttext geliefert."
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("JARVIS:", error);
    return res.status(500).json({
      error: "Serverfehler: " + error.message
    });
  }
}
