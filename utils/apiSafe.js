// =================================================================
// 🛡️ utils/apiSafe.js — Centralized Google Sheets API Client with Retry + Rate Limit Handling
// =================================================================

const { google } = require('googleapis');
const path = require('path');

const keys = require(path.join(__dirname, '../credentials.json'));

// --- Constants for Google Sheets API limits ---
// Google Sheets API: 100 requests per 100 seconds per user (60 req/min)
const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // 1 second base delay
const RATE_LIMIT_WINDOW = 100 * 1000; // 100 seconds
const MAX_REQUESTS_PER_WINDOW = 90; // Keep 10 under limit for safety

// --- Rate limiting state ---
const requestTimestamps = [];

/**
 * Track request timestamp for rate limiting
 */
function trackRequest() {
    const now = Date.now();
    requestTimestamps.push(now);
    // Clean old entries outside the window
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW) {
        requestTimestamps.shift();
    }
}

/**
 * Check if we're approaching rate limit and wait if needed
 */
async function respectRateLimit() {
    const now = Date.now();
    // Clean old entries
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW) {
        requestTimestamps.shift();
    }

    if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
        const oldestInWindow = requestTimestamps[0];
        const waitTime = (oldestInWindow + RATE_LIMIT_WINDOW) - now + 500; // +500ms buffer
        console.warn(`⚠️ [apiSafe] Approaching rate limit (${requestTimestamps.length}/${MAX_REQUESTS_PER_WINDOW}). Waiting ${Math.round(waitTime / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Clean again after waiting
        while (requestTimestamps.length > 0 && requestTimestamps[0] < Date.now() - RATE_LIMIT_WINDOW) {
            requestTimestamps.shift();
        }
    }
}

/**
 * Create authenticated Google Sheets client
 */
function createSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: keys.client_email,
            private_key: keys.private_key
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
}

/**
 * Execute a Google Sheets API call with full retry + rate limit protection
 * @param {Function} apiCall - Async function that makes the actual API call
 * @param {Object} options
 * @param {number} options.maxRetries - Max retry attempts (default: MAX_RETRIES)
 * @param {string} options.operation - Name of operation for logging
 * @returns {Promise<any>} API response
 */
async function safeSheetsCall(apiCall, options = {}) {
    const maxRetries = options.maxRetries || MAX_RETRIES;
    const operation = options.operation || 'sheetsAPI';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Respect rate limits before making the call
            await respectRateLimit();

            const result = await apiCall();
            trackRequest();
            return result;
        } catch (error) {
            const isRateLimit = error.code === 429 ||
                error.code === 403 ||
                (error.message && error.message.includes('RATE_LIMIT')) ||
                (error.message && error.message.includes('Quota exceeded')) ||
                (error.message && error.message.includes('rateLimitExceeded'));

            const isServerError = error.code === 500 ||
                error.code === 502 ||
                error.code === 503 ||
                error.code === 504;

            const isAuthError = error.message &&
                (error.message.includes('Invalid JWT') ||
                 error.message.includes('Token expired') ||
                 error.message.includes('Authentication failed') ||
                 error.message.includes('invalid_grant') ||
                 error.message.includes('Not valid form'));

            // Handle JWT/auth errors - might need to recreate client
            if (isAuthError && attempt < maxRetries) {
                const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), 16000);
                console.warn(`⚠️ [apiSafe] ${operation} Auth error (attempt ${attempt}/${maxRetries}): ${error.message}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Rate limit or server error - retry with exponential backoff
            if ((isRateLimit || isServerError) && attempt < maxRetries) {
                const delay = isRateLimit
                    ? Math.min(BASE_DELAY * Math.pow(4, attempt), 30000) // Faster backoff for rate limits
                    : Math.min(BASE_DELAY * Math.pow(2, attempt), 16000); // Standard backoff for server errors

                console.warn(`⚠️ [apiSafe] ${operation} ${isRateLimit ? 'rate limited' : 'server error'} (attempt ${attempt}/${maxRetries}). Waiting ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Non-retryable error or out of retries
            if (attempt === maxRetries) {
                console.error(`❌ [apiSafe] ${operation} failed after ${maxRetries} attempts:`, error.message);
                throw error;
            }

            throw error;
        }
    }
}

/**
 * Read values from Google Sheets with safe retry
 */
async function safeGetValues(spreadsheetId, range, options = {}) {
    const sheets = createSheetsClient();
    return safeSheetsCall(
        () => sheets.spreadsheets.values.get({ spreadsheetId, range }),
        { operation: `getValues(${range})`, ...options }
    );
}

/**
 * Update values in Google Sheets with safe retry
 */
async function safeUpdateValues(spreadsheetId, range, values, options = {}) {
    const sheets = createSheetsClient();
    return safeSheetsCall(
        () => sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        }),
        { operation: `updateValues(${range})`, ...options }
    );
}

/**
 * Batch update values in Google Sheets with safe retry
 */
async function safeBatchUpdateValues(spreadsheetId, data, options = {}) {
    const sheets = createSheetsClient();
    return safeSheetsCall(
        () => sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: { valueInputOption: 'USER_ENTERED', data }
        }),
        { operation: `batchUpdate(${data.length} ranges)`, ...options }
    );
}

/**
 * Clear values in Google Sheets with safe retry
 */
async function safeClearValues(spreadsheetId, range, options = {}) {
    const sheets = createSheetsClient();
    return safeSheetsCall(
        () => sheets.spreadsheets.values.clear({
            spreadsheetId,
            range
        }),
        { operation: `clearValues(${range})`, ...options }
    );
}

/**
 * Append values to Google Sheets with safe retry
 */
async function safeAppendValues(spreadsheetId, range, values, options = {}) {
    const sheets = createSheetsClient();
    return safeSheetsCall(
        () => sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        }),
        { operation: `appendValues(${range})`, ...options }
    );
}

module.exports = {
    safeSheetsCall,
    safeGetValues,
    safeUpdateValues,
    safeBatchUpdateValues,
    safeClearValues,
    safeAppendValues,
    createSheetsClient,
    // Export for testing/monitoring
    getRateLimitStats: () => ({
        currentRequests: requestTimestamps.length,
        maxPerWindow: MAX_REQUESTS_PER_WINDOW,
        windowMs: RATE_LIMIT_WINDOW
    })
};