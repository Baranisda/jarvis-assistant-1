
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Methode nicht erlaubt."
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { message, history = [] } = req.body || {};

    if (!apiKey) {
      return res.status(500).json({
        error: "API-Schlüssel fehlt."
      });
    }

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 4000
    ) {
      return res.status(400).json({
        error: "Nachricht ungültig oder zu lang."
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(item =>
            item &&
            ["user", "model"].includes(item.role) &&
            typeof item.text === "string"
          )
          .slice(-12)
          .map(item => ({
            role: item.role,
            parts: [{ text: item.text.slice(0, 4000) }]
          }))
      : [];

    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [{ text: message.trim() }]
      }
    ];

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: "Du bist JARVIS, ein intelligenter deutscher KI-Assistent. Nutze den Gesprächsverlauf. Bei aktuellen Fragen nutze Google Search. Erfinde keine Quellen oder Fakten. Erkläre deine Ergebnisse verständlich."
            }]
          },
          contents,
          tools: [
            {
              google_search: {}
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Google API Fehler."
      });
    }

    const candidate = data.candidates?.[0];

    let reply = candidate?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "Keine KI-Antwort erhalten."
      });
    }

    const chunks =
      candidate?.groundingMetadata?.groundingChunks || [];

    const sources = chunks
      .map(item => item.web)
      .filter(item =>
        item &&
        typeof item.uri === "string" &&
        item.uri.startsWith("https://")
      );

    const uniqueSources = [
      ...new Map(
        sources.map(source => [source.uri, source])
      ).values()
    ].slice(0, 5);

    if (uniqueSources.length) {
      reply += "\n\nQuellen:\n";
      reply += uniqueSources
        .map(source =>
          `• ${source.title || "Quelle"}: ${source.uri}`
        )
        .join("\n");
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("JARVIS:", error);

    return res.status(500).json({
      error: "Serverfehler: " + error.message
    });
  }
}
