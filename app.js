const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const databaseAndCollection = { db: "CMSC335DB", collection: "sleepData" };

const mongoURI = `mongodb+srv://${process.env.MONGO_DB_USERNAME}:${process.env.MONGO_DB_PASSWORD}@cluster0.ypvtw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

let db;

MongoClient.connect(mongoURI, { serverApi: ServerApiVersion.v1 })
  .then(client => {
    console.log('MongoDB connected');
    db = client.db(databaseAndCollection.db); 
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Form Page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <title id="titlesleep">Sleep Tracker</title>
            <link href="https://fonts.googleapis.com/css2?family=Bubblegum+Sans&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <h1>Sleep Tracker</h1>
            <form action="/submit" method="POST">
                <label>Bedtime:</label>
                <input type="time" name="bedtime" required><br>
                <label>Wake-up Time:</label>
                <input type="time" name="wakeupTime" required><br>
                <label>Mood:</label>
                <select name="mood">
                    <option value="happy">Happy</option>
                    <option value="tired">Tired</option>
                    <option value="stressed">Stressed</option>
                </select><br>
                <button type="submit">Submit</button>
            </form>
            <form action="/clear" method="POST">
                <button type="submit">Clear All Records</button>
            </form>
            <p id="name">Ryan Lac</p>
        </body>
        </html>
    `);
});

// Submit Route: Save Data and Render Results
app.post('/submit', async (req, res) => {
    const sleepCollection = db.collection(databaseAndCollection.collection);

    const { bedtime, wakeupTime, mood } = req.body;

    const duration = calculateSleepDuration(bedtime, wakeupTime);

    let songRecommendation = '';
    let playlistType = ''; 

    try {
        const token = await getSpotifyToken();

        if (duration < 6) {
            playlistType = 'sleep';
        } else if (mood === 'happy') {
            playlistType = 'Electronic Dance Music';
        } else if (mood === 'tired') {
            playlistType = 'Ambient';
        } else {
            playlistType = 'Relaxing';
        }

        songRecommendation = await fetchSpotifyPlaylist(token, duration, mood);

        const sleepEntry = {
            bedtime,
            wakeupTime,
            mood,
            duration,
            songRecommendation,
            submissionDate: new Date().toISOString(),
        };

        await sleepCollection.insertOne(sleepEntry);

        const allSleepData = await sleepCollection.find({}).toArray();

        res.send(generateResultsHTML(bedtime, wakeupTime, mood, duration, playlistType, songRecommendation, allSleepData));
    } catch (error) {
        console.error("Error processing submission:", error);
        res.status(500).send("An error occurred while processing your request.");
    }
});

app.post('/clear', async (req, res) => {
    const sleepCollection = db.collection(databaseAndCollection.collection);

    try {
        const result = await sleepCollection.deleteMany({});
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Clear Records</title>
            </head>
            <body>
                <h1>All Records Cleared</h1>
                <p>Number of records removed: ${result.deletedCount}</p>
                <a href="/">Back to Home</a>
            </body>
            </html>
        `);
    } catch (err) {
        console.error("Error clearing records:", err);
        res.status(500).send("An error occurred while clearing records.");
    }
});


function calculateSleepDuration(bedtime, wakeupTime) {
    const [bedHour, bedMin] = bedtime.split(':').map(Number);
    const [wakeHour, wakeMin] = wakeupTime.split(':').map(Number);
    const bedInMinutes = bedHour * 60 + bedMin;
    const wakeInMinutes = wakeHour * 60 + wakeMin;
    let duration = wakeInMinutes - bedInMinutes;
    if (duration < 0) duration += 24 * 60; 
    return (duration / 60).toFixed(1); 
}

async function getSpotifyToken() {
    const clientID = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientID}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
    });

    const data = await response.json();
    return data.access_token;
}

async function fetchSpotifyPlaylist(token, duration, mood) {
    let query;

    if (duration < 6) query = 'sleep';
    else if (mood === 'happy') query = 'Electronic Dance Music';
    else if (mood === 'tired') query = 'Ambient';
    else query = 'Relaxing';

    const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=playlist&limit=1`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    const data = await response.json();
    return data.playlists.items[0]?.external_urls.spotify || 'No playlist available';
}

function generateResultsHTML(bedtime, wakeupTime, mood, duration, playlistType, songRecommendation, allSleepData) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <title>Sleep Results</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <h1>Sleep Results</h1>
            <div class ="results">
            ${bedtime ? `
                <p>Bedtime: ${bedtime}</p>
                <p>Wake-up Time: ${wakeupTime}</p>
                <p>Mood: ${mood}</p>
                <p>Sleep Duration: ${duration} hours</p>
                <p>You were recommended the <strong>${playlistType}</strong> playlist: <a href="${songRecommendation}" target="_blank">Listen here</a></p>
            ` : ''}
            <h2>Saved Records</h2>
            <ul>
                ${allSleepData.map(entry => `
                    <li>${entry.bedtime} to ${entry.wakeupTime} - ${entry.mood} (${entry.duration} hours)</li>
                `).join('')}
            </ul>
            </div>
            <a href="/">Back to Home</a>
        </body>
        </html>
    `;
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
