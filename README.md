# Spotify Stats Bot

A Discord bot that provides detailed analytics and insights from your Spotify listening history. This bot allows users to upload their Spotify extended streaming history and get personalized statistics about their music listening habits.

## Features

- 🔗 Spotify account integration
- 📊 Detailed listening statistics
- 📈 Historical data analysis
- 🎵 Track and artist insights
- 📱 User-friendly Discord commands
- 🔒 Secure data handling
- 📦 Easy data upload via ZIP files

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

3. Create a `config.json` file with your credentials:
```json
{
    "clientId": "your-discord-client-id",
    "token": "your-discord-bot-token",
    "spotifyClientId": "your-spotify-client-id",
    "spotifyClientSecret": "your-spotify-client-secret"
}
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
3. View your statistics using various commands

## Commands

- `/connect` - Connect your Spotify account
- `/upload` - Upload your Spotify extended streaming history
- `/stats` - View your listening statistics
- `/help` - Get help with commands

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Spotify Web API
- Discord.js
- Node.js community 