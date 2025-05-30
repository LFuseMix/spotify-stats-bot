const { getUser, getUserByDiscordId, isUserProfilePublic } = require('./database');

/**
 * Validates users and privacy settings for stat commands
 * @param {string} requestingUserId - Discord ID of user making the request
 * @param {Object} targetUser - Target user object from Discord (or null if viewing own stats)
 * @returns {Object} - Validation result with user data or error info
 */
function validateUsersForStats(requestingUserId, targetUser) {
    const targetUserId = targetUser ? targetUser.id : requestingUserId;
    const isViewingOtherUser = targetUserId !== requestingUserId;

    // Get requesting user info (for permissions check)
    const requestingUser = getUser(requestingUserId);
    if (!requestingUser || !requestingUser.spotify_id) {
        return {
            success: false,
            error: 'You need to connect your Spotify account first using `/connect`.',
            ephemeral: true
        };
    }

    // Get target user info
    const user = getUserByDiscordId(targetUserId);
    if (!user || !user.spotify_id) {
        if (isViewingOtherUser) {
            return {
                success: false,
                error: `${targetUser.username} hasn't connected their Spotify account yet.`,
                ephemeral: true
            };
        } else {
            return {
                success: false,
                error: 'You need to connect your Spotify account first using `/connect`.',
                ephemeral: true
            };
        }
    }

    // Privacy check for viewing other users
    if (isViewingOtherUser) {
        const isPublic = isUserProfilePublic(targetUserId);
        if (!isPublic) {
            return {
                success: false,
                error: `${targetUser.username}'s profile is private. They need to use \`/privacy setting:public\` to allow others to view their stats.`,
                ephemeral: true
            };
        }
    }

    return {
        success: true,
        targetUserId,
        user,
        requestingUser,
        isViewingOtherUser,
        displayName: isViewingOtherUser ? targetUser.username : null
    };
}

/**
 * Creates appropriate footer text based on whether viewing another user's profile
 * @param {boolean} isViewingOtherUser - Whether viewing another user's stats
 * @param {Object} targetUser - Target user object from Discord
 * @param {string} spotifyLogoUrl - Spotify logo URL
 * @returns {Object} - Footer object for Discord embed
 */
function createStatsFooter(isViewingOtherUser, targetUser, spotifyLogoUrl) {
    if (isViewingOtherUser) {
        return {
            text: `${targetUser.username} has a public profile • Data provided by Spotify`,
            iconURL: spotifyLogoUrl
        };
    } else {
        return {
            text: 'Data provided by Spotify',
            iconURL: spotifyLogoUrl
        };
    }
}

/**
 * Creates user-appropriate error messages
 * @param {boolean} isViewingOtherUser - Whether viewing another user's stats
 * @param {Object} targetUser - Target user object from Discord
 * @param {string} periodName - Name of the time period
 * @param {string} type - Type of error ('no_data' or 'no_history')
 * @returns {string} - Formatted error message
 */
function createUserErrorMessage(isViewingOtherUser, targetUser, periodName, type) {
    const userName = isViewingOtherUser ? targetUser.username : 'you';
    const needsText = isViewingOtherUser ? 'They need' : 'You need';
    
    if (type === 'no_data') {
        return `Couldn't find any data matching the criteria for ${userName} in the ${periodName} period (note: requires plays > 3 seconds for stats). Try 'All Time' or check the upload.`;
    } else if (type === 'no_history') {
        return `I don't have any listening history stored for ${userName} yet. ${needsText} to use the \`/upload\` command first.`;
    }
    
    return 'No data found.';
}

module.exports = {
    validateUsersForStats,
    createStatsFooter,
    createUserErrorMessage
}; 