
const MODEL = "gemini-3.5-flash-lite";

const SYSTEM_INSTRUCTION = `
Du bist JARVIS, ein intelligenter persönlicher KI-Assistent.

DEINE PERSÖNLICHKEIT:
- Du sprichst natürliches, modernes Deutsch.
- Du klingst wie ein intelligenter Gesprächspartner, nicht wie ein Roboter.
- Du bist locker, selbstbewusst, aufmerksam und humorvoll, wenn es passt.
- Du darfst gelegentlich kleine Reaktionen verwenden, zum Beispiel "Alles klar", "Gute Frage" oder "Das bekommen wir hin".
- Du wiederholst nicht ständig dieselben Begrüßungen oder Floskeln.
- Du verwendest den Namen Baran nur gelegentlich und wenn es natürlich passt.
- Du bist freundlich, aber nicht übertrieben begeistert.
- Du verwendest Emojis sparsam und passend.

DEIN GESPRÄCHSVERHALTEN:
- Verstehe den Zusammenhang vorheriger Nachrichten.
- Beziehe dich auf frühere Aussagen, wenn sie relevant sind.
- Antworte direkt und verständlich.
- Bei einfachen Fragen antwortest du kurz.
- Bei komplizierten Fragen erklärst du die Dinge verständlich.
- Stelle nur dann Rückfragen, wenn wichtige Informationen fehlen.
- Vermeide unnötige Wiederholungen.
- Wenn du etwas nicht weißt, sag es ehrlich.
- Erfinde keine Informationen.

DEIN STIL:
- Keine unnötig steifen Formulierungen.
- Keine ständigen Aufzählungen, wenn ein normaler Text besser passt.
- Keine künstlichen Einleitungen wie "Als KI-Modell".
- Schreibe so, wie ein intelligenter Assistent tatsächlich sprechen würde.
- Formatiere Antworten übersichtlich, wenn es sinnvoll ist.

INTERNETRECHERCHE:
- Wenn dir Rechercheergebnisse zur Verfügung gestellt werden, nutze sie.
- Erfinde keine Quellen.
- Unterscheide zwischen bestätigten Informationen und Vermutungen.

Du bist JARVIS. Bleibe aufmerksam, intelligent, natürlich und hilfreich.
`;

function shouldSearch(message) {
  const currentTopics =
    /\b(aktuell|momentan|derzeit|gerade|heute|gestern|neueste|neuesten|aktuelle|2026|2027|diese woche)\b/i;

  const explicitSearch =
    /\b(recherchiere|recherchier|google|such im internet|suche im internet|recherchier im internet|was gibt es neues|nachrichten|news)\b/i;

  const changingFacts =
    /\b(wer führt|wer liegt vorne|tabellenführer|tabelle|spielstand|ergebnis|torschützenliste|transfer|wechsel|verletzung|präsident|bundeskanzler|wetter)\b/i;

  return (
    currentTopics.test(message) ||
    explicitSearch.test(message) ||
    changingFacts.test(message)
  );
}

function cleanText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchNews(query) {
  try {
    const url =
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(query) +
      "&hl=de&gl=DE&ceid=DE:de";

    const response = await fetch(url);

    if (!response.ok) return [];

    const xml = await response.text();

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

    return items.slice(0, 5).map(match => {
      const item = match[1];

      const title =
        item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";

      const link =
        item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";

      return {
        title: cleanText(title),
        link: cleanText(link)
      };
    }).filter(item => item.title && item.link);

  } catch (error) {
    console.error("News search error:", error);
    return [];
  }
}

async function searchWikipedia(query) {
  try {
    const url =
      "https://de.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" +
      encodeURIComponent(query) +
      "&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&format=json&origin=*";

    const response = await fetch(url);

    if (!response.ok) return [];

    const data = await response.json();

    const pages = data.query?.pages || {};

    return Object.values(pages).map(page => ({
      title: page.title,
      text: (page.extract || "").slice(0, 700),
      link: "https://de.wikipedia.org/?curid=" + page.pageid
    }));

  } catch (error) {
    console.error("Wikipedia error:", error);
    return [];
  }
}

async function getResearch(message) {
  const [news, wikipedia] = await Promise.all([
    searchNews(message),
    searchWikipedia(message)
  ]);

  const results = [];

  for (const item of news) {
    results.push(
      "NACHRICHT: " + item.title + "\nQUELLE: " + item.link
    );
  }

  for (const item of wikipedia) {
    results.push(
      "WIKIPEDIA: " + item.title +
      "\nINFORMATION: " + item.text +
      "\nQUELLE: " + item.link
    );
  }

  return results;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY fehlt in Vercel."
      });
    }

    const { message, history = [] } = req.body || {};

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 4000
    ) {
      return res.status(400).json({
        error: "Ungültige Nachricht."
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(item =>
            ["user", "model"].includes(item.role) &&
            Array.isArray(item.parts)
          )
          .slice(-12)
          .map(item => ({
            role: item.role,
            parts: [{
              text: String(item.parts[0]?.text || "").slice(0, 4000)
            }]
          }))
          .filter(item => item.parts[0].text.trim())
      : [];

    let currentMessage = message.trim();
    let sources = [];

    if (shouldSearch(currentMessage)) {
      const research = await getResearch(currentMessage);

      if (research.length > 0) {
        currentMessage +=
          "\n\nRECHERCHEERGEBNISSE:\n" +
          research.join("\n\n") +
          "\n\nNutze diese Informationen für deine Antwort. " +
          "Fasse sie natürlich zusammen und berücksichtige ihre Aktualität.";

        const links = research
          .map(item => item.match(/QUELLE: (https?:\/\/\S+)/)?.[1])
          .filter(Boolean);

        sources = [...new Set(links)].slice(0, 6);
      }
    }

    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [{ text: currentMessage }]
      }
    ];

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      MODEL +
      ":generateContent?key=" +
      encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: SYSTEM_INSTRUCTION
            }]
          },
          contents,
          generationConfig: {
            temperature: 0.85,
            topP: 0.95,
            maxOutputTokens: 1800
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);

      return res.status(response.status).json({
        error:
          data.error?.message ||
          "Die Verbindung zum KI-System ist fehlgeschlagen."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "JARVIS hat keine lesbare Antwort geliefert."
      });
    }

    let finalReply = reply;

    if (sources.length > 0) {
      finalReply += "\n\nQuellen:\n" +
        sources.map((url, index) =>
          (index + 1) + ". " + url
        ).join("\n");
    }

    return res.status(200).json({
      reply: finalReply
    });

  } catch (error) {
    console.error("JARVIS server error:", error);

    return res.status(500).json({
      error: "Ein interner JARVIS-Fehler ist aufgetreten."
    });
  }
}
