import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = ["http://localhost:5173", "https://tommylam.github.io"];

app.use(
    cors({
        origin: allowedOrigins,
    })
);

let cache = {
    data: null,
    date: null,
};

async function fetchNYTData() {
    try {
        const response = await fetch(
            "https://www.nytimes.com/puzzles/letter-boxed",
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                },
            }
        );

        let chunks = [];
        for await (const chunk of response.body) {
            chunks.push(Buffer.from(chunk));
        }
        const html = Buffer.concat(chunks).toString("utf8");

        // Look for data markers
        const startMarker = "window.gameData = ";
        const dataStart = html.indexOf(startMarker);
        if (dataStart === -1)
            throw new Error("Could not find data start marker");

        // Find the end of the JSON by searching for semicolon
        const contentStart = dataStart + startMarker.length;
        let content = "";
        let bracketCount = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = contentStart; i < html.length; i++) {
            const char = html[i];

            if (escapeNext) {
                escapeNext = false;
                content += char;
                continue;
            }

            if (char === "\\") {
                escapeNext = true;
                content += char;
                continue;
            }

            if (char === '"' && !escapeNext) {
                inString = !inString;
            }

            if (!inString) {
                if (char === "{") bracketCount++;
                if (char === "}") bracketCount--;

                // We've found the end of the JSON when brackets balance and we hit a semicolon
                if (bracketCount === 0 && char === ";") {
                    break;
                }
            }

            content += char;
        }

        try {
            // Clean any potential trailing characters
            content = content.replace(/;$/, "").trim();
            const gameData = JSON.parse(content);

            // Validate the data
            if (
                !gameData.sides ||
                !Array.isArray(gameData.sides) ||
                gameData.sides.length !== 4
            ) {
                throw new Error("Invalid sides data");
            }
            if (!gameData.ourSolution || !Array.isArray(gameData.ourSolution)) {
                throw new Error("Invalid solution data");
            }
            if (!gameData.dictionary || !Array.isArray(gameData.dictionary)) {
                throw new Error("Invalid dictionary data");
            }

            return gameData;
        } catch (parseError) {
            console.error("Parse error:", parseError);
            console.error("Content preview:", content.substring(0, 100));
            throw new Error(`JSON parse error: ${parseError.message}`);
        }
    } catch (error) {
        console.error("Fetch error:", error);
        throw error;
    }
}

// Better debug endpoint
app.get("/api/debug-content", async (req, res) => {
    try {
        const response = await fetch(
            "https://www.nytimes.com/puzzles/letter-boxed",
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                },
            }
        );

        let chunks = [];
        for await (const chunk of response.body) {
            chunks.push(Buffer.from(chunk));
        }
        const html = Buffer.concat(chunks).toString("utf8");

        const startMarker = "window.gameData = ";
        const dataStart = html.indexOf(startMarker);
        const preview = html.substring(dataStart, dataStart + 200);

        res.json({
            found: dataStart !== -1,
            startIndex: dataStart,
            contentPreview: preview,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            error: "Debug error",
            details: error.message,
        });
    }
});

app.get("/api/nyt", async (req, res) => {
    try {
        if (isCacheValid()) {
            console.log("Using cached data");
            return res.json(cache.data);
        }

        console.log("Fetching fresh data");
        const gameData = await fetchNYTData();

        cache = {
            data: gameData,
            date: new Date().toISOString(),
        };

        return res.json(gameData);
    } catch (error) {
        console.error("API error:", error);
        res.status(500).json({
            error: "Failed to fetch NYT data",
            details: error.message,
            timestamp: new Date().toISOString(),
        });
    }
});

function isCacheValid() {
    if (!cache.data || !cache.date) return false;

    const now = new Date();
    const cacheDate = new Date(cache.date);

    const nyNow = new Date(
        now.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    const nyCacheDate = new Date(
        cacheDate.toLocaleString("en-US", { timeZone: "America/New_York" })
    );

    return nyNow.toDateString() === nyCacheDate.toDateString();
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
