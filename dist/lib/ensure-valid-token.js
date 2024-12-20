"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureValidAccessToken = ensureValidAccessToken;
const db_1 = require("./db");
const twitter_api_v2_1 = require("twitter-api-v2");
const CLIENT_ID = process.env.AUTH_TWITTER_ID;
const CLIENT_SECRET = process.env.AUTH_TWITTER_SECRET;
async function ensureValidAccessToken(accountId) {
    const account = await db_1.db.twitterAccount.findUnique({
        where: { id: accountId },
    });
    if (!account) {
        throw new Error("Account not found");
    }
    const currentTime = Math.floor(Date.now() / 1000);
    if (account.expiresIn && account.expiresIn < currentTime) {
        // Refresh the access token
        const client = new twitter_api_v2_1.TwitterApi({
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
        });
        try {
            const { client: refreshedClient, accessToken, refreshToken, expiresIn, } = await client.refreshOAuth2Token(account.refreshToken);
            await db_1.db.twitterAccount.update({
                where: { id: account.id },
                data: {
                    accessToken,
                    refreshToken: refreshToken ?? null,
                    expiresIn: Math.floor(Date.now() / 1000) + expiresIn,
                },
            });
            // Update the account object with the new tokens
            account.accessToken = accessToken;
            account.refreshToken = refreshToken ?? null;
            account.expiresIn = Math.floor(Date.now() / 1000) + expiresIn;
        }
        catch (error) {
            console.log("Error rotating access token:", error);
            throw new Error("Failed to refresh access token");
        }
    }
    return account.accessToken;
}
//# sourceMappingURL=ensure-valid-token.js.map