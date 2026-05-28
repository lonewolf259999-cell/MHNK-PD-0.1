// =================================================================
// 🛡️ utils/discordSafe.js — Discord API Safety + Rate Limit Protection
// =================================================================

/**
 * Discord API Rate Limits:
 * - Global: 50 requests per second
 * - Per route: varies (usually 5-10 requests per 5 seconds)
 * - 429 Too Many Requests = backoff by retry_after seconds
 */

const RATE_LIMIT_STORE = new Map();
const GLOBAL_COOLDOWN_MS = 100; // 100ms between commands globally
let lastRequestTime = 0;
let globalRateLimited = false;
let globalRetryAfter = 0;

/**
 * Get cooldown for a specific Discord endpoint
 * @param {string} route - e.g., 'channels/:id/messages'
 * @returns {number} cooldown in ms
 */
function getRouteCooldown(route) {
    const now = Date.now();
    const data = RATE_LIMIT_STORE.get(route);
    if (!data) return 0;
    if (now >= data.resetTime) {
        RATE_LIMIT_STORE.delete(route);
        return 0;
    }
    return data.resetTime - now;
}

/**
 * Set rate limit data for a specific route
 * @param {string} route
 * @param {number} retryAfter - seconds to wait
 */
function setRouteRateLimit(route, retryAfter) {
    const resetTime = Date.now() + (retryAfter * 1000) + 500; // +500ms buffer
    RATE_LIMIT_STORE.set(route, { resetTime });
    console.warn(`⚠️ [discordSafe] Route ${route} rate limited: waiting ${retryAfter}s`);
}

/**
 * Set global rate limit
 * @param {number} retryAfter - seconds to wait
 */
function setGlobalRateLimit(retryAfter) {
    globalRateLimited = true;
    globalRetryAfter = Date.now() + (retryAfter * 1000) + 500;
    console.warn(`⚠️ [discordSafe] GLOBAL rate limit: waiting ${retryAfter}s`);
}

/**
 * Wait if needed before making a Discord API call
 * @param {string} route - Discord API route for rate limiting
 */
async function waitForDiscordRateLimit(route = 'global') {
    // Check global rate limit first
    if (globalRateLimited) {
        const waitMs = globalRetryAfter - Date.now();
        if (waitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
        globalRateLimited = false;
    }

    // Check route-specific rate limit
    const routeWait = getRouteCooldown(route);
    if (routeWait > 0) {
        await new Promise(resolve => setTimeout(resolve, routeWait));
    }

    // Global command cooldown (100ms between commands)
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < GLOBAL_COOLDOWN_MS) {
        await new Promise(resolve => setTimeout(resolve, GLOBAL_COOLDOWN_MS - elapsed));
    }
    lastRequestTime = Date.now();
}

/**
 * Safe message fetch with rate limit handling
 * @param {import('discord.js').TextChannel} channel
 * @param {string} messageId
 * @returns {Promise<import('discord.js').Message|null>}
 */
async function safeFetchMessage(channel, messageId) {
    try {
        await waitForDiscordRateLimit(`channels/${channel.id}/messages`);
        return await channel.messages.fetch(messageId);
    } catch (error) {
        if (error.code === 429) {
            const retryAfter = error.retryAfter || error.body?.retry_after || 5;
            setRouteRateLimit(`channels/${channel.id}/messages`, retryAfter);
            // Retry once after cooldown
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000 + 1000));
            try {
                return await channel.messages.fetch(messageId);
            } catch (retryErr) {
                console.error(`❌ [discordSafe] Fetch message ${messageId} failed after retry:`, retryErr.message);
                return null;
            }
        }
        if (error.code === 50001 || error.code === 50013) {
            console.warn(`⚠️ [discordSafe] Missing permissions for message ${messageId}`);
            return null;
        }
        if (error.code === 10008) {
            // Message not found, just skip
            return null;
        }
        console.error(`❌ [discordSafe] Fetch message ${messageId} error:`, error.message);
        return null;
    }
}

/**
 * Safe channel messages fetch with pagination and rate limit protection
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} options - { limit, before, after }
 * @returns {Promise<import('discord.js').Collection<string, import('discord.js').Message>>}
 */
async function safeFetchMessages(channel, options = {}) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await waitForDiscordRateLimit(`channels/${channel.id}/messages`);
            return await channel.messages.fetch(options);
        } catch (error) {
            if (error.code === 429) {
                const retryAfter = error.retryAfter || error.body?.retry_after || 5;
                setRouteRateLimit(`channels/${channel.id}/messages`, retryAfter);
                const waitMs = retryAfter * 1000 + 1000;
                console.warn(`⚠️ [discordSafe] Rate limited fetching messages (attempt ${attempt}/${maxRetries}). Waiting ${waitMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }
            if (error.code === 50001 || error.code === 50013) {
                console.warn(`⚠️ [discordSafe] Missing permissions for channel ${channel.id}`);
                return new (require('discord.js').Collection)();
            }
            if (attempt === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    return new (require('discord.js').Collection)();
}

/**
 * Safe message send with rate limit protection
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} options - { content, embeds, components }
 * @returns {Promise<import('discord.js').Message|null>}
 */
async function safeSendMessage(channel, options = {}) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await waitForDiscordRateLimit(`channels/${channel.id}/messages`);
            return await channel.send(options);
        } catch (error) {
            if (error.code === 429) {
                const retryAfter = error.retryAfter || error.body?.retry_after || 5;
                setRouteRateLimit(`channels/${channel.id}/messages`, retryAfter);
                const waitMs = retryAfter * 1000 + 1000;
                console.warn(`⚠️ [discordSafe] Rate limited sending message (attempt ${attempt}/${maxRetries}). Waiting ${waitMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }
            if (error.code === 50001 || error.code === 50013) {
                console.warn(`⚠️ [discordSafe] Missing permissions to send in channel ${channel.id}`);
                return null;
            }
            if (attempt === maxRetries) {
                console.error(`❌ [discordSafe] Send message failed after ${maxRetries} attempts:`, error.message);
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    return null;
}

/**
 * Safe message edit with rate limit protection
 * @param {import('discord.js').Message} message
 * @param {Object} options - { content, embeds, components }
 * @returns {Promise<import('discord.js').Message|null>}
 */
async function safeEditMessage(message, options = {}) {
    try {
        await waitForDiscordRateLimit(`channels/${message.channel.id}/messages`);
        return await message.edit(options);
    } catch (error) {
        if (error.code === 429) {
            const retryAfter = error.retryAfter || error.body?.retry_after || 5;
            setRouteRateLimit(`channels/${message.channel.id}/messages`, retryAfter);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000 + 1000));
            try {
                return await message.edit(options);
            } catch (retryErr) {
                console.error(`❌ [discordSafe] Edit message failed after retry:`, retryErr.message);
                return null;
            }
        }
        if (error.code === 10008) {
            // Message deleted, skip
            return null;
        }
        console.error(`❌ [discordSafe] Edit message error:`, error.message);
        return null;
    }
}

/**
 * Safe reaction add with rate limit protection
 * @param {import('discord.js').Message} message
 * @param {string} emoji
 */
async function safeReact(message, emoji) {
    try {
        await waitForDiscordRateLimit(`channels/${message.channel.id}/messages/${message.id}/reactions`);
        await message.react(emoji);
        return true;
    } catch (error) {
        if (error.code === 429) {
            const retryAfter = error.retryAfter || error.body?.retry_after || 5;
            setRouteRateLimit(`channels/${message.channel.id}/messages/${message.id}/reactions`, retryAfter);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000 + 1000));
            try {
                await message.react(emoji);
                return true;
            } catch (retryErr) {
                return false;
            }
        }
        // 10008 = message deleted, 50013 = missing perms, 90001 = reaction blocked
        if (error.code === 10008 || error.code === 50013 || error.code === 90001) return false;
        return false;
    }
}

module.exports = {
    safeFetchMessage,
    safeFetchMessages,
    safeSendMessage,
    safeEditMessage,
    safeReact,
    waitForDiscordRateLimit,
    getRateLimitStats: () => ({
        globalRateLimited,
        routeRateLimits: Array.from(RATE_LIMIT_STORE.entries()).map(([route, data]) => ({
            route,
            resetIn: Math.max(0, data.resetTime - Date.now())
        }))
    })
};