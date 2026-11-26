
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

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Nachricht fehlt." });
    }

    let lastError = "Google ist gerade nicht erreichbar.";

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve =>
          setTimeout(resolve, attempt * 3000)
        );
      }

      try {
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
                "Du bist JARVIS, ein intelligenter deutscher KI-Assistent. Antworte hilfreich, natürlich und präzise. Nenne den Besitzer Baran, wenn es passt.",
              store: false
            })
          }
        );

        const data = await response.json();

        if (response.ok && data.output_text) {
          return res.status(200).json({
            reply: data.output_text
          });
        }

        lastError =
          data.error?.message || "Unbekannter Gemini-Fehler.";

        const temporary =
          [408, 429, 500, 502, 503, 504].includes(response.status);

        if (!temporary) {
          return res.status(response.status).json({
            error: lastError
          });
        }

      } catch (error) {
        lastError = error.message;
      }
    }

    return res.status(503).json({
      error: "Google ist weiterhin überlastet. Bitte versuche es später erneut. " + lastError
    });

  } catch (error) {
    return res.status(500).json({
      error: "Serverfehler: " + error.message
    });
  }
}
