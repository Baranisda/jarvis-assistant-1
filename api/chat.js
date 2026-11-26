
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Methode nicht erlaubt"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "API-Schlüssel fehlt in Vercel."
      });
    }

    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Keine Nachricht erhalten."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: "Du bist JARVIS, ein intelligenter, freundlicher KI-Assistent. Du sprichst Deutsch, antwortest natürlich, hilfreich und präzise. Du bist der persönliche Assistent des Besitzers. Nenne ihn Baran, wenn es passt."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: message }]
          }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Fehler:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Fehler bei der KI-Verbindung."
      });
    }

    const reply =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    return res.status(200).json({
      reply: reply || "Ich habe leider keine Antwort erhalten."
    });

  } catch (error) {
    console.error("JARVIS Fehler:", error);

    return res.status(500).json({
      error: "Serverfehler: " + error.message
    });
  }
}
