
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Methode nicht erlaubt."
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { message } = req.body || {};

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY fehlt in Vercel."
      });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Nachricht fehlt."
      });
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
          model: "gemini-3.8-flash",
          input: message,
          system_instruction:
            "Du bist JARVIS, ein intelligenter deutscher KI-Assistent. Antworte hilfreich, natürlich und präzise. Du bist der persönliche Assistent des Besitzers. Nenne ihn Baran, wenn es passt.",
          store: false
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini Fehler:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Gemini API Fehler."
      });
    }

    const reply = data.output_text;

    if (!reply) {
      return res.status(502).json({
        error: "Gemini hat keinen Antworttext geliefert."
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("JARVIS Fehler:", error);

    return res.status(500).json({
      error: "Serverfehler: " + error.message
    });
  }
}
