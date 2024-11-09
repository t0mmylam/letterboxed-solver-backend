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

    // Check if it's the same calendar day in Eastern Time (NYT's timezone)
    const nyNow = new Date(
        now.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    const nyCacheDate = new Date(
        cacheDate.toLocaleString("en-US", { timeZone: "America/New_York" })
    );

    return nyNow.toDateString() === nyCacheDate.toDateString();
}

async function fetchNYTData() {
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
    const dataMatch = html.match(/gameData\s*=\s*({[\s\S]+?}})/);

    if (!dataMatch) {
        throw new Error("Could not find game data");
    }

    const gameData = JSON.parse(dataMatch[1]);
    return gameData;
}

app.get("/api/nyt", async (req, res) => {
    try {
        // Check if cache is valid
        if (isCacheValid()) {
            console.log("Returning cached data");
            return res.json(cache.data);
        }

        // If cache is invalid, fetch new data
        console.log("Fetching fresh data");
        const gameData = await fetchNYTData();

        // Update cache
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
        });
    }
});

// Debug endpoint to check cache status
app.get("/api/cache-status", (req, res) => {
    res.json({
        hasCachedData: !!cache.data,
        cacheDate: cache.date,
        isCacheValid: isCacheValid(),
        currentNYTime: new Date().toLocaleString("en-US", {
            timeZone: "America/New_York",
        }),
    });
});

app.get("/health", (req, res) => {
    res.json({ status: "healthy" });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
