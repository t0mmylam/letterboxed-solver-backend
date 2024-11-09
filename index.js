import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = ["http://localhost:5173", "https://tommylay1.github.io"];

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

        const html = await response.text();
        console.log("Fetched HTML length:", html.length);

        const startMarker = "window.gameData = ";
        const endMarker = ";</script>";

        const dataStart = html.indexOf(startMarker);
        if (dataStart === -1) throw new Error("Could not find data start");

        const searchStart = dataStart + startMarker.length;
        const dataEnd = html.indexOf(endMarker, searchStart);
        if (dataEnd === -1) throw new Error("Could not find data end");

        const jsonStr = html.substring(searchStart, dataEnd);
        console.log("Extracted JSON length:", jsonStr.length);

        try {
            const gameData = JSON.parse(jsonStr);
            console.log("Successfully parsed game data");
            return gameData;
        } catch (parseError) {
            const firstErrorPos =
                parseError.message.match(/position (\d+)/)?.[1];
            const problemArea = firstErrorPos
                ? jsonStr.substring(
                      Math.max(0, Number(firstErrorPos) - 50),
                      Math.min(jsonStr.length, Number(firstErrorPos) + 50)
                  )
                : "No position info";

            console.error("Parse Error near:", problemArea);
            throw parseError;
        }
    } catch (error) {
        console.error("Fetch error:", error);
        throw error;
    }
}

// New debug endpoint that shows chunks of data
app.get("/api/debug-chunks", async (req, res) => {
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

        const html = await response.text();
        const startMarker = "window.gameData = ";
        const dataStart = html.indexOf(startMarker);

        if (dataStart === -1) {
            return res.json({ error: "Data start not found" });
        }

        const jsonStart = dataStart + startMarker.length;
        const chunks = [];
        let currentPos = jsonStart;
        let bracketCount = 1; // Start at 1 because we expect to start with an opening bracket

        // Read until we find the matching closing bracket
        while (bracketCount > 0 && currentPos < html.length) {
            const char = html[currentPos];
            if (char === "{") bracketCount++;
            if (char === "}") bracketCount--;
            currentPos++;
        }

        const jsonStr = html.substring(jsonStart, currentPos);

        res.json({
            totalLength: html.length,
            dataStartIndex: dataStart,
            extractedLength: jsonStr.length,
            // Show the first and last 100 characters of the extracted JSON
            start: jsonStr.substring(0, 100),
            end: jsonStr.substring(jsonStr.length - 100),
            // Add some debug counts
            openBrackets: (jsonStr.match(/{/g) || []).length,
            closeBrackets: (jsonStr.match(/}/g) || []).length,
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
