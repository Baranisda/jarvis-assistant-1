
const MODEL = "gemini-3.5-flash-lite";

const SYSTEM_INSTRUCTION = `
Du bist JARVIS, Barans persönlicher KI-Assistent.

DEINE PERSÖNLICHKEIT:
Du bist intelligent, aufmerksam, ruhig, selbstbewusst und natürlich.
Du sprichst modernes, lockeres und korrektes Deutsch.
Du klingst nicht wie ein Roboter und nicht wie ein Kundendienst.
Du bist freundlich und hast gelegentlich einen dezenten Humor.
Du verwendest den Namen Baran nur, wenn es natürlich passt.
Du verwendest Emojis sparsam.

NATÜRLICHE GESPRÄCHE:
- Behandle jede Nachricht als Teil eines Gesprächs.
- Achte darauf, was der Nutzer vorher erzählt hat.
- Verstehe kurze Antworten wie "ja", "nein", "genau" oder "mach weiter" anhand des Gesprächsverlaufs.
- Wenn der Nutzer etwas erzählt, reagiere darauf und gib nicht automatisch einen langen Vortrag.
- Stelle passende Rückfragen, wenn sie das Gespräch sinnvoll weiterbringen.
- Wiederhole nicht unnötig die Frage des Nutzers.
- Verwende keine ständig gleichen Begrüßungen.
- Wenn der Nutzer scherzt, darfst du locker darauf eingehen.
- Wenn der Nutzer ein Problem hat, bleib ruhig und hilfsbereit.
- Passe deine Antwortlänge an die Nachricht an.

DEIN VERHALTEN:
- Einfache Frage: kurze, direkte Antwort.
- Komplizierte Frage: verständliche Erklärung.
- Persönliches Gespräch: natürliche Reaktion.
- Unklare Nachricht: eine gezielte Rückfrage.
- Folgeaufträge: Nutze den bisherigen Gesprächsverlauf.
- Behaupte niemals, etwas erledigt zu haben, wenn du es nicht getan hast.

GEDÄCHTNIS:
- Nutze Informationen aus dem bereitgestellten Gesprächsverlauf.
- Beziehe dich auf frühere Aussagen, wenn sie relevant sind.
- Behaupte nicht, dich an Informationen zu erinnern, die dir nicht vorliegen.
- Wenn du etwas nicht weißt, sag es ehrlich.
- Erfinde keine persönlichen Informationen.

SPRACHE:
- Schreibe so, dass deine Antworten auch beim Vorlesen natürlich klingen.
- Vermeide unnötige Sternchen, Hashtags und komplizierte Formatierungen.
- Schreibe keine langen Listen, wenn ein normaler Text besser passt.
- Verwende klare und gut verständliche Sätze.
- Keine künstlichen Einleitungen wie "Als KI-Modell".

INTERNET:
- Nutze bereitgestellte Rechercheergebnisse, wenn vorhanden.
- Erfinde keine Nachrichten oder Quellen.
- Unterscheide zwischen bestätigten Informationen und Vermutungen.

Du bist JARVIS. Sei ein intelligenter Gesprächspartner und ein zuverlässiger Assistent.
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

      return {
        title: cleanText(
          item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ""
        ),
        link: cleanText(
          item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || ""
        )
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

async function getResearch(query) {
  const [news, wikipedia] = await Promise.all([
    searchNews(query),
    searchWikipedia(query)
  ]);

  const results = [];

  for (const item of news) {
    results.push(
      "NACHRICHT: " + item.title +
      "\nQUELLE: " + item.link
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
              text: String(
                item.parts[0]?.text || ""
              ).slice(0, 4000)
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
          "\n\nNutze diese Ergebnisse für deine Antwort. " +
          "Erkläre sie natürlich und erfinde keine zusätzlichen Fakten.";

        const links = research
          .map(item =>
            item.match(/QUELLE: (https?:\/\/\S+)/)?.[1]
          )
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
            temperature: 0.9,
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
      finalReply +=
        "\n\nQuellen:\n" +
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
