import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = ["http://localhost:5173", "https://t0mmylam.github.io"];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);

            if (allowedOrigins.indexOf(origin) === -1) {
                const msg =
                    "The CORS policy for this site does not allow access from the specified Origin.";
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
        credentials: true,
    })
);

let cache = {
    data: null,
    date: null,
};

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

        const startMarker = "window.gameData = ";
        const startIndex = html.indexOf(startMarker);
        if (startIndex === -1) {
            throw new Error("Could not find game data start");
        }

        const jsonStartIndex = startIndex + startMarker.length;

        let endIndex = -1;
        let depth = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = jsonStartIndex; i < html.length; i++) {
            const char = html[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === "\\") {
                escapeNext = true;
                continue;
            }

            if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === "{") depth++;
                if (char === "}") {
                    depth--;
                    if (depth === 0) {
                        endIndex = i + 1;
                        break;
                    }
                }
            }
        }

        if (endIndex === -1) {
            throw new Error("Could not find end of game data");
        }

        const jsonString = html.substring(jsonStartIndex, endIndex);
        console.log("Extracted JSON length:", jsonString.length);

        try {
            const gameData = JSON.parse(jsonString);

            if (!gameData.sides || !Array.isArray(gameData.sides)) {
                throw new Error("Invalid sides data");
            }
            if (!gameData.ourSolution || !Array.isArray(gameData.ourSolution)) {
                throw new Error("Invalid solution data");
            }

            return gameData;
        } catch (parseError) {
            console.error("Parse error:", parseError.message);
            if (parseError.message.includes("position")) {
                const pos = parseInt(
                    parseError.message.match(/position (\d+)/)[1]
                );
                console.error(
                    "Content near error position:",
                    jsonString.substring(Math.max(0, pos - 50), pos + 50)
                );
            }
            throw new Error(`JSON parse error: ${parseError.message}`);
        }
    } catch (error) {
        console.error("Error in fetchNYTData:", error);
        throw error;
    }
}

app.get("/", (req, res) => {
    res.json({ status: "API is running" });
});

app.get("/api/nyt", async (req, res) => {
    try {
        if (isCacheValid()) {
            console.log("Returning cached data");
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
        console.error("Error:", error);
        res.status(500).json({
            error: "Failed to fetch NYT data",
            details: error.message,
            timestamp: new Date().toISOString(),
        });
    }
});

app.get("/api/debug-json", async (req, res) => {
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
        const startIndex = html.indexOf(startMarker);
        const jsonStartIndex = startIndex + startMarker.length;

        let endIndex = -1;
        let depth = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = jsonStartIndex; i < html.length; i++) {
            const char = html[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === "\\") {
                escapeNext = true;
                continue;
            }

            if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === "{") depth++;
                if (char === "}") {
                    depth--;
                    if (depth === 0) {
                        endIndex = i + 1;
                        break;
                    }
                }
            }
        }

        const jsonString = html.substring(jsonStartIndex, endIndex);

        res.json({
            success: true,
            extractedLength: jsonString.length,
            start: jsonString.substring(0, 200),
            end: jsonString.substring(jsonString.length - 200),
            hasValidStart: jsonString.startsWith("{"),
            hasValidEnd: jsonString.endsWith("}"),
            bracketCount: {
                open: (jsonString.match(/{/g) || []).length,
                close: (jsonString.match(/}/g) || []).length,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("Allowed origins:", allowedOrigins);
});
