import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'

const app = express()
const PORT = process.env.PORT || 3000

const allowedOrigins = [
  'http://localhost:5173',
  'https://tommylam.github.io'
];

app.use(cors({
  origin: allowedOrigins
}));

let cache = {
  data: null,
  date: null
}

async function fetchNYTData() {
  try {
    const response = await fetch('https://www.nytimes.com/puzzles/letter-boxed', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    
    // Find the start of the game data
    const dataStart = html.indexOf('window.gameData = ');
    if (dataStart === -1) throw new Error('Could not find game data start');
    
    // Find the end of the game data (looking for the next semicolon)
    const jsonStart = dataStart + 'window.gameData = '.length;
    let jsonEnd = html.indexOf(';</script>', jsonStart);
    if (jsonEnd === -1) {
      jsonEnd = html.indexOf(';\n', jsonStart); // try alternative ending
    }
    if (jsonEnd === -1) throw new Error('Could not find game data end');
    
    // Extract and parse the JSON
    const jsonStr = html.substring(jsonStart, jsonEnd);
    
    try {
      const gameData = JSON.parse(jsonStr);
      
      // Validate required fields
      if (!gameData.sides || !Array.isArray(gameData.sides) || gameData.sides.length !== 4) {
        throw new Error('Invalid game data structure - missing or invalid sides');
      }
      if (!gameData.ourSolution || !Array.isArray(gameData.ourSolution)) {
        throw new Error('Invalid game data structure - missing or invalid solution');
      }
      if (!gameData.dictionary || !Array.isArray(gameData.dictionary)) {
        throw new Error('Invalid game data structure - missing or invalid dictionary');
      }
      
      return gameData;
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw JSON string:', jsonStr.substring(0, 100) + '...');
      throw new Error(`Failed to parse game data: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in fetchNYTData:', error);
    throw error;
  }
}

app.get('/api/nyt', async (req, res) => {
  try {
    if (isCacheValid()) {
      console.log('Returning cached data');
      return res.json(cache.data);
    }

    console.log('Fetching fresh data');
    const gameData = await fetchNYTData();
    
    cache = {
      data: gameData,
      date: new Date().toISOString()
    };

    return res.json(gameData);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch NYT data',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Updated debug endpoint
app.get('/api/debug', async (req, res) => {
  try {
    const response = await fetch('https://www.nytimes.com/puzzles/letter-boxed', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    const dataStart = html.indexOf('window.gameData = ');
    
    let debugInfo = {
      dataFound: dataStart !== -1,
      dataStartIndex: dataStart,
      timestamp: new Date().toISOString()
    };

    if (dataStart !== -1) {
      const jsonStart = dataStart + 'window.gameData = '.length;
      let jsonEnd = html.indexOf(';</script>', jsonStart);
      if (jsonEnd === -1) {
        jsonEnd = html.indexOf(';\n', jsonStart);
      }
      
      if (jsonEnd !== -1) {
        const jsonStr = html.substring(jsonStart, jsonEnd);
        try {
          const data = JSON.parse(jsonStr);
          debugInfo.parsedSuccessfully = true;
          debugInfo.dataStructure = {
            hasSides: !!data.sides,
            sidesLength: data.sides?.length,
            hasSolution: !!data.ourSolution,
            solutionLength: data.ourSolution?.length,
            hasDictionary: !!data.dictionary,
            dictionaryLength: data.dictionary?.length
          };
        } catch (e) {
          debugInfo.parsedSuccessfully = false;
          debugInfo.parseError = e.message;
        }
      }
    }

    res.json(debugInfo);
  } catch (error) {
    res.status(500).json({
      error: 'Debug endpoint error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

function isCacheValid() {
  if (!cache.data || !cache.date) return false;
  
  const now = new Date();
  const cacheDate = new Date(cache.date);
  
  const nyNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const nyCacheDate = new Date(cacheDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  return nyNow.toDateString() === nyCacheDate.toDateString();
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});