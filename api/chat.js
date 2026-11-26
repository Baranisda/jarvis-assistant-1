
function decodeHtml(text = "") {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, "")
    .trim();
}

async function searchNews(query) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=de&gl=DE&ceid=DE:de";

  const response = await fetch(url, {
    headers: { "User-Agent": "JARVIS/1.0" }
  });

  if (!response.ok) throw new Error("News-Suche fehlgeschlagen");

  const xml = await response.text();

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 5)
    .map(match => {
      const item = match[1];
      const get = tag =>
        item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
          ? decodeHtml(
              item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))[1]
            )
          : "";

      return {
        title: get("title"),
        link: get("link"),
        description: get("description")
      };
    })
    .filter(item => item.title && item.link);
}

async function searchWikipedia(query) {
  const url =
    "https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
    encodeURIComponent(query) +
    "&format=json&utf8=1";

  const response = await fetch(url);
  if (!response.ok) throw new Error("Wikipedia-Suche fehlgeschlagen");

  const data = await response.json();

  return (data.query?.search || []).slice(0, 4).map(item => ({
    title: item.title,
    description: decodeHtml(item.snippet),
    link:
      "https://de.wikipedia.org/wiki/" +
      encodeURIComponent(item.title.replace(/ /g, "_"))
  }));
}

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

    const needsSearch =
      /aktuell|heute|neueste|neuesten|news|nachrichten|recherch|internet|stand heute|2026|gestern/i
        .test(message);

    let research = "";
    let sources = [];

    if (needsSearch) {
      const results = await Promise.allSettled([
        searchNews(message),
        searchWikipedia(message)
      ]);

      const news =
        results[0].status === "fulfilled" ? results[0].value : [];

      const wiki =
        results[1].status === "fulfilled" ? results[1].value : [];

      sources = [...news, ...wiki];

      research = sources.map((item, index) =>
        `${index + 1}. ${item.title}\n${item.description}\n${item.link}`
      ).join("\n\n");

      if (!research) {
        research =
          "Die externen Suchdienste haben gerade keine Ergebnisse geliefert.";
      }
    }

    const finalContents = [...contents];

    if (needsSearch) {
      finalContents.push({
        role: "user",
        parts: [{
          text:
            "Zusätzliche Recherche-Ergebnisse:\n" +
            research +
            "\nNutze diese Informationen kritisch. Erfinde keine Fakten. " +
            "Wenn keine Ergebnisse vorhanden sind, sage das offen."
        }]
      });
    }

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
              text:
                "Du bist JARVIS, ein intelligenter deutscher KI-Assistent. " +
                "Nutze den Gesprächsverlauf. Bei Recherchefragen verwende " +
                "die bereitgestellten Suchergebnisse. Unterscheide aktuelle " +
                "Informationen von älterem Wissen. Erfinde keine Quellen."
            }]
          },
          contents: finalContents
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Google API Fehler."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "Keine KI-Antwort erhalten."
      });
    }

    const uniqueSources = [
      ...new Map(sources.map(item => [item.link, item])).values()
    ].slice(0, 6);

    const sourceText = uniqueSources.length
      ? "\n\nQuellen:\n" +
        uniqueSources.map(item =>
          `• ${item.title}: ${item.link}`
        ).join("\n")
      : "";

    return res.status(200).json({
      reply: reply + sourceText
    });

  } catch (error) {
    console.error("JARVIS:", error);

    return res.status(500).json({
      error: "Serverfehler: " + error.message
    });
  }
}
