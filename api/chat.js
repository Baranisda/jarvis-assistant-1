
const MODEL = "gemini-3.5-flash-lite";

const SYSTEM_PROMPT = `
Du bist JARVIS, ein intelligenter persönlicher KI-Assistent.

Deine Persönlichkeit:
- Du sprichst natürliches, modernes Deutsch.
- Du bist aufmerksam, freundlich, clever und gelegentlich humorvoll.
- Du antwortest wie ein echter Assistent, nicht wie ein Roboter.
- Du liest keine Markdown-Sternchen oder Formatierungszeichen vor.
- Du verwendest Informationen aus dem gesamten bereitgestellten Gesprächsverlauf.
- Wenn der Nutzer dir seinen Namen oder eine andere Information nennt, merke sie dir innerhalb des Gesprächs.
- Wenn der Nutzer später danach fragt, prüfe zuerst den Gesprächsverlauf.
- Behaupte niemals, dass dir etwas nicht gesagt wurde, wenn es im Verlauf steht.

LIVE-INFORMATIONEN:
- Wenn aktuelle Rechercheergebnisse bereitgestellt werden, verwende sie.
- Erfinde niemals aktuelle Nachrichten, Wetterdaten oder Ergebnisse.
- Unterscheide zwischen bestätigten Fakten und unvollständigen Informationen.
- Nenne bei aktuellen Informationen möglichst die Quelle.
- Wenn kein aktueller Datenzugriff möglich war, sage das ehrlich.
- Bei einer Wetterfrage ohne Ortsangabe frage nach der Stadt.

Antworte immer passend zur Frage und vermeide unnötig lange Antworten.
`;

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function wantsWeather(message) {
  return /wetter|temperatur|regen|regnet|schneit|wettervorhersage/i.test(message);
}

function wantsCurrentInfo(message) {
  return /aktuell|neueste|news|nachrichten|heute|gestern|diese woche|fußball|fussball|galatasaray|bundesliga|champions league|ergebnis|spielstand|recherchiere|recherche|suche im internet|was ist passiert/i.test(message);
}

function extractCity(message) {
  const match = message.match(
    /(?:wetter|temperatur|regen|regnet|schneit)[^.!?]*?\b(?:in|für|bei)\s+([a-zäöüß -]{2,40})/i
  );

  if (!match) return null;

  return match[1]
    .replace(/\b(heute|morgen|jetzt|aktuell|bitte)\b/gi, "")
    .trim();
}

async function getWeather(city) {
  if (!city) {
    return "Für die Wetterabfrage wurde keine Stadt angegeben. Bitte frage den Nutzer nach seiner Stadt.";
  }

  try {
    const geoUrl =
      "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({
        name: city,
        count: "1",
        language: "de",
        format: "json"
      });

    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) throw new Error("Geocoding fehlgeschlagen");

    const geoData = await geoResponse.json();
    const place = geoData.results?.[0];

    if (!place) {
      return "Für " + city + " wurde kein passender Ort gefunden.";
    }

    const weatherUrl =
      "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        timezone: "auto",
        forecast_days: "1"
      });

    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) throw new Error("Wetterabfrage fehlgeschlagen");

    const weather = await weatherResponse.json();
    const current = weather.current;
    const daily = weather.daily;

    return `
AKTUELLES WETTER:
Ort: ${place.name}, ${place.country}
Zeitpunkt: ${current.time}
Temperatur: ${current.temperature_2m} °C
Gefühlte Temperatur: ${current.apparent_temperature} °C
Luftfeuchtigkeit: ${current.relative_humidity_2m} %
Windgeschwindigkeit: ${current.wind_speed_10m} km/h
Niederschlag aktuell: ${current.precipitation} mm
Tageshöchsttemperatur: ${daily.temperature_2m_max[0]} °C
Tagestiefsttemperatur: ${daily.temperature_2m_min[0]} °C
Regenwahrscheinlichkeit: ${daily.precipitation_probability_max[0]} %
Quelle: Open-Meteo
    `.trim();

  } catch (error) {
    return "Die Wetterdaten konnten gerade nicht abgerufen werden: " + error.message;
  }
}

async function getNews(message) {
  try {
    const query = message
      .replace(/^(jarvis[, ]*)/i, "")
      .slice(0, 180);

    const url =
      "https://news.google.com/rss/search?" +
      new URLSearchParams({
        q: query,
        hl: "de",
        gl: "DE",
        ceid: "DE:de"
      });

    const response = await fetch(url);
    if (!response.ok) throw new Error("Nachrichtensuche fehlgeschlagen");

    const xml = await response.text();

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 6)
      .map(match => {
        const item = match[1];

        const getTag = tag => {
          const found = item.match(
            new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")
          );
          return found ? cleanText(found[1]) : "";
        };

        return {
          title: getTag("title"),
          link: getTag("link"),
          date: getTag("pubDate"),
          description: getTag("description"),
          source: getTag("source")
        };
      })
      .filter(item => item.title);

    if (!items.length) {
      return "Die Nachrichtensuche hat keine passenden Ergebnisse geliefert.";
    }

    return "AKTUELLE NACHRICHTEN UND SUCHERGEBNISSE:\n\n" +
      items.map((item, index) =>
        `${index + 1}. ${item.title}\nQuelle: ${item.source || "Google News"}\nDatum: ${item.date}\nLink: ${item.link}\nZusammenfassung: ${item.description}`
      ).join("\n\n");

  } catch (error) {
    return "Die Nachrichtensuche ist momentan nicht verfügbar: " + error.message;
  }
}

async function getWikipedia(message) {
  try {
    const query = message
      .replace(/^(jarvis[, ]*)/i, "")
      .slice(0, 120);

    const url =
      "https://de.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrlimit: "3",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        format: "json",
        origin: "*"
      });

    const response = await fetch(url);
    if (!response.ok) throw new Error("Wikipedia nicht erreichbar");

    const data = await response.json();
    const pages = Object.values(data.query?.pages || {});

    if (!pages.length) return "";

    return "WIKIPEDIA-HINTERGRUNDINFORMATIONEN:\n\n" +
      pages.map(page =>
        `${page.title}: ${(page.extract || "").slice(0, 900)}`
      ).join("\n\n");

  } catch (error) {
    return "";
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Bitte gib eine Nachricht ein."
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "Die Nachricht ist zu lang."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY fehlt in den Vercel-Umgebungsvariablen."
      });
    }

    let liveInformation = "";

    if (wantsWeather(message)) {
      const city = extractCity(message);
      liveInformation += await getWeather(city);
      liveInformation += "\n\n";
    }

    if (wantsCurrentInfo(message)) {
      liveInformation += await getNews(message);
      liveInformation += "\n\n";

      const background = await getWikipedia(message);
      if (background) {
        liveInformation += background;
      }
    }

    // GESPRÄCHSVERLAUF: Unterstützt beide Nachrichtenformate.
    const contents = [];

    if (Array.isArray(history)) {
      history
        .filter(item =>
          item &&
          (item.role === "user" || item.role === "model")
        )
        .slice(-12)
        .forEach(item => {
          const text =
            typeof item.content === "string"
              ? item.content
              : typeof item.parts?.[0]?.text === "string"
                ? item.parts[0].text
                : null;

          if (text) {
            contents.push({
              role: item.role,
              parts: [{ text: text.slice(0, 4000) }]
            });
          }
        });
    }

    let finalMessage = message;

    if (liveInformation) {
      finalMessage +=
        "\n\nLIVE-INFORMATIONEN FÜR DEINE ANTWORT:\n" +
        liveInformation +
        "\n\nVerwende diese Daten sorgfältig. Erfinde keine zusätzlichen Fakten.";
    }

    contents.push({
      role: "user",
      parts: [{ text: finalMessage }]
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
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
      console.error("Gemini API error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Fehler bei der KI-Anfrage."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "Die KI hat keinen lesbaren Antworttext geliefert."
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("JARVIS error:", error);

    return res.status(500).json({
      error: "JARVIS konnte die Anfrage nicht verarbeiten."
    });
  }
};
