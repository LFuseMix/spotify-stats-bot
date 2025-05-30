# Hershey 🎷 - Spotify Stats Bot

A Discord bot that provides detailed analytics and insights from your Spotify listening history. Hershey allows users to upload their Spotify extended streaming history and get personalized statistics about their music listening habits.

## Features

- 🔗 Spotify account integration with real-time tracking
- 📊 Detailed listening statistics with beautiful progress bars
- 📈 Historical data analysis across multiple time periods
- 🎵 Track, artist, and genre insights
- 👥 Social stats viewing (with privacy controls)
- 🎨 Customizable embed colors and themes
- 📱 User-friendly Discord commands
- 🔒 Privacy controls (public/private profiles)
- 📦 Easy data upload via ZIP files
- 🤖 AI-powered music roasts and comparisons

## Prerequisites

- Node.js v16 or higher
- Discord Bot Token
- Spotify Developer Account
- Discord Server with bot permissions

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/spotify-stats-bot.git
cd spotify-stats-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your credentials:
```env
DISCORD_TOKEN=your-discord-bot-token
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
GEMINI_API_KEY=your-gemini-api-key
PORT=8888
```

4. Deploy the bot commands:
```bash
node deploy-commands.js
```

5. Start the bot:
```bash
node index.js
```

## Usage

1. Connect your Spotify account using `/connect`
2. Upload your Spotify extended streaming history using `/upload`
3. Set your privacy preferences using `/privacy`
4. View your statistics using various commands
5. Explore others' stats (if they have public profiles)

## Commands

### Core Commands
- `/connect` - Connect your Spotify account
- `/upload` - Upload your Spotify extended streaming history
- `/privacy` - Control who can view your stats (public/private)

### Stats Commands
- `/top-songs` - View top songs (add `user:@someone` to view others)
- `/top-artists` - View top artists (add `user:@someone` to view others)
- `/top-genres` - View top genres (add `user:@someone` to view others)
- `/profile` - View your Spotify profile summary

### Customization
- `/config-color` - Customize embed colors and progress bar themes
- `/compare` - Compare your music taste with another user
- `/roast` - Get an AI-powered roast of your music taste

### Help & Support
- `/help` - Get help with commands
- Join our [support server](https://discord.gg/GJKQJjcsGA)

## Privacy Features

Hershey respects your privacy:
- All profiles are **private by default**
- Use `/privacy setting:public` to allow others to view your stats
- Only you can see your stats unless you explicitly make your profile public
- Data is stored securely and never shared with third parties

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- Join our [Discord server](https://discord.gg/GJKQJjcsGA)
- Email: [ntatschool@outlook.com](mailto:ntatschool@outlook.com)

## Acknowledgments

- Spotify Web API
- Discord.js
- Google Gemini AI
- Node.js community 