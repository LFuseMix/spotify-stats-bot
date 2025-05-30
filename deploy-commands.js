// deploy-commands.js
const fs = require('node:fs');
const path = require('node:path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js'); // Correct import for v14+
const dotenv = require('dotenv');
const config = require('./config.json'); // Make sure this path is correct

dotenv.config();

// --- Ensure required variables are present ---
const requiredEnv = ['DISCORD_TOKEN'];
const requiredConfig = ['clientId']; // guildId is optional for global deployment

const missingEnv = requiredEnv.filter(envVar => !process.env[envVar]);
const missingConfig = requiredConfig.filter(configVar => !config[configVar]);

if (missingEnv.length > 0) {
    console.error(`[Deploy Error] Missing required environment variables in .env: ${missingEnv.join(', ')}`);
    process.exit(1);
}
if (missingConfig.length > 0) {
    console.error(`[Deploy Error] Missing required configuration in config.json: ${missingConfig.join(', ')}`);
    process.exit(1);
}
// --- End Checks ---


const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Function to recursively find all .js files in a directory
function findCommandFiles(directory) {
    let commandFiles = [];
    const files = fs.readdirSync(directory, { withFileTypes: true });

    for (const file of files) {
        const filePath = path.join(directory, file.name);
        if (file.isDirectory()) {
            commandFiles = commandFiles.concat(findCommandFiles(filePath));
        } else if (file.name.endsWith('.js')) {
            commandFiles.push(filePath);
        }
    }
    return commandFiles;
}

const commandFiles = findCommandFiles(commandsPath);

console.log('[Deploy] Loading command files...');
for (const filePath of commandFiles) { // Iterate over full file paths
	try {
		const command = require(filePath);
		if ('data' in command && typeof command.data.toJSON === 'function') {
			 commands.push(command.data.toJSON());
			 console.log(`[Deploy] Loaded command: ${command.data.name}`);
		} else {
			 console.warn(`[Deploy Warning] The command at ${filePath} is missing a required "data" property or "toJSON" method.`);
		}
	} catch (error) {
		console.error(`[Deploy Error] Failed to load command at ${filePath}:`, error);
	}
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
	try {
		console.log(`[Deploy] Started refreshing ${commands.length} application (/) commands.`);

        let route;
        // Decide whether to deploy globally or to a specific guild
        if (config.guildId) {
            // Guild deployment (updates instantly, good for testing)
            console.log(`[Deploy] Deploying to guild: ${config.guildId}`);
             route = Routes.applicationGuildCommands(config.clientId, config.guildId);
        } else {
            // Global deployment (can take up to an hour to propagate)
            console.log('[Deploy] Deploying globally.');
             route = Routes.applicationCommands(config.clientId);
        }


		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			route,
			{ body: commands },
		);

		console.log(`[Deploy] Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error('[Deploy Error] Failed to refresh commands:', error);
	}
})();