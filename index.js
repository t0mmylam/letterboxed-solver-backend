import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS for both development and production
const allowedOrigins = [
    "http://localhost:5173",
    "https://t0mmylam.github.io", // Replace with your actual GitHub Pages URL
];

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
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

// Cache structure
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

        // Look for the script section containing the game data
        const scriptSection = html.split("window.gameData = ")[1];
        if (!scriptSection) throw new Error("Could not find game data section");

        // Extract the JSON object
        const jsonPart = scriptSection.split(";\n")[0];
        if (!jsonPart) throw new Error("Could not find game data JSON");

        // Parse the JSON
        const gameData = JSON.parse(jsonPart);

        // Validate the data structure
        if (
            !gameData.sides ||
            !gameData.ourSolution ||
            !Array.isArray(gameData.sides)
        ) {
            throw new Error("Invalid game data structure");
        }

        return gameData;
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

// Debug endpoint to help troubleshoot data fetching
app.get("/api/debug", async (req, res) => {
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
        const dataStart = html.indexOf("window.gameData = ");
        const relevantSection = html.substring(dataStart, dataStart + 1000);

        res.json({
            dataFound: dataStart !== -1,
            sampleSection: relevantSection,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            error: "Debug endpoint error",
            details: error.message,
            timestamp: new Date().toISOString(),
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("Allowed origins:", allowedOrigins);
});
