// utils/aiHelper.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
const config = require('../config.json');
const { formatDuration } = require('./dateUtils'); // For formatting data in prompt

dotenv.config();

// Ensure API key is loaded
if (!process.env.GEMINI_API_KEY) {
    console.error("[AI Helper Error] GEMINI_API_KEY not found in .env file. AI features will fail.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Using 1.5 Flash as requested
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

async function generateRoast(userData, periodName) {
    // Basic check if userData is valid
    if (!userData || !userData.topArtists || !userData.topSongs) {
        console.error("[AI Roast Error] Invalid user data provided.");
        return "Hmm, I didn't get enough data to properly roast you. Lucky you... this time.";
    }

    const prompt = `
${config.roastPersona}

This user needs a good roasting for their music taste over the ${periodName} period. Here's what they've been listening to:
Total time listened: ${formatDuration(userData.totalMsListened)}

Their Top Artists:
${userData.topArtists.slice(0, 5).map((a, i) => `${i + 1}. ${a.artist_name} (listened for ${formatDuration(a.total_ms_played)})`).join('\n') || 'They apparently listen to no artists in particular. Weird.'}

Their Top Songs:
${userData.topSongs.slice(0, 5).map((s, i) => `${i + 1}. "${s.track_name}" by ${s.artist_name} (listened for ${formatDuration(s.total_ms_played)})`).join('\n') || 'No specific top songs. Are they just listening to elevator music?'}

Now, deliver a sarcastic and funny roast of their music taste based ONLY on this data. Structure it like this:
1. Start with a general, exaggerated, and humorous summary of their overall taste. What kind of person listens to this?
2. Comment on their top artists. Are they all the same? A weird mix? Do they only listen to one artist over and over?
3. Briefly touch on their top songs if there's anything particularly funny or roastable about them.

Keep it punchy and concise, around 2-3 short paragraphs suitable for Discord. Remember, you are Hershey, a witty and sarcastic dog. And, of course, don't forget to throw some shade at Anitta if the opportunity arises – we all know her music is objectively inferior.
`;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        // Add basic safety check on response
        if (!response || !response.text) {
            throw new Error("AI response was empty or invalid.");
        }
        const text = response.text();
        return text;
    } catch (error) {
        console.error("[AI Roast Error] Failed to generate roast:", error);
        // Check for specific API errors if possible (e.g., billing, quota)
        if (error.message.includes('quota')) {
             return "Looks like I've barked too much today... the humans say I'm over my AI quota.";
        }
        return "My circuits are fried... couldn't come up with a roast right now. Consider yourself spared.";
    }
}


async function generateComparison(user1Data, user2Data, user1Name, user2Name, periodName) {
     // Basic checks
    if (!user1Data || !user1Data.topArtists || !user1Data.topSongs || !user2Data || !user2Data.topArtists || !user2Data.topSongs) {
        console.error("[AI Compare Error] Invalid user data provided for comparison.");
        return "Can't compare if I don't have the scoop on both of you!";
    }

    const prompt = `
${config.comparePersona}

Okay, let's see who has the *superior* taste (or maybe just *different* bad taste). Here's the data for the ${periodName} period:

User 1: ${user1Name}
Total time listened: ${formatDuration(user1Data.totalMsListened)}
Top Artists:
${user1Data.topArtists.slice(0, 5).map((a, i) => `${i + 1}. ${a.artist_name} (${formatDuration(a.total_ms_played)})`).join('\n') || 'None listed'}
Top Songs (Top 5):
${user1Data.topSongs.slice(0, 5).map((s, i) => `${i + 1}. ${s.track_name} by ${s.artist_name} (${formatDuration(s.total_ms_played)})`).join('\n') || 'None listed'}

User 2: ${user2Name}
Total time listened: ${formatDuration(user2Data.totalMsListened)}
Top Artists:
${user2Data.topArtists.slice(0, 5).map((a, i) => `${i + 1}. ${a.artist_name} (${formatDuration(a.total_ms_played)})`).join('\n') || 'None listed'}
Top Songs (Top 5):
${user2Data.topSongs.slice(0, 5).map((s, i) => `${i + 1}. ${s.track_name} by ${s.artist_name} (${formatDuration(s.total_ms_played)})`).join('\n') || 'None listed'}

Now, as Hershey the dog, compare their tastes based ONLY on this data. Playfully declare a winner (or roast both if they're equally bad/weird). Give a brief, humorous justification (2 paragraphs of 4 or more sentences). Keep it concise for Discord though. Focus on the artists/songs provided. Also throw in a random Anitta diss comparing her and her music as inferior.
`;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
         if (!response || !response.text) {
            throw new Error("AI response was empty or invalid.");
        }
        const text = response.text();
        return text;
    } catch (error) {
        console.error("[AI Compare Error] Failed to generate comparison:", error);
         if (error.message.includes('quota')) {
             return "Too much thinking for one dog... comparison engine is offline. Try again later.";
        }
        return "My brain hurts comparing these two... ask me later when I've had a nap.";
    }
}

module.exports = { generateRoast, generateComparison };