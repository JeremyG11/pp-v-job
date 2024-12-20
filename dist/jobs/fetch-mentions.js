"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchMentions = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const node_cron_1 = __importDefault(require("node-cron"));
const twitter_api_v2_1 = require("twitter-api-v2");
const ensure_valid_token_1 = require("../lib/ensure-valid-token");
const db_1 = require("../lib/db");
const client_1 = require("@prisma/client");
dotenv_1.default.config();
/**
 * Fetches mentions for all active Twitter accounts
 * @returns
 */
const fetchMentions = async () => {
    try {
        const twitterAccounts = await db_1.db.twitterAccount.findMany({
            where: { status: client_1.TweetAccountStatus.ACTIVE },
        });
        if (!twitterAccounts.length) {
            console.log("No active Twitter accounts found.");
            return;
        }
        for (const account of twitterAccounts) {
            const accessToken = await (0, ensure_valid_token_1.ensureValidAccessToken)(account.id);
            const client = new twitter_api_v2_1.TwitterApi(accessToken);
            const roClient = client.readOnly;
            let nextToken = undefined;
            if (!account || !account.twitterUserId) {
                console.log(`No Twitter user ID found for account ID: ${account.id}`);
                continue;
            }
            do {
                const { data: mentions, meta } = await roClient.v2.userMentionTimeline(account.twitterUserId, {
                    pagination_token: nextToken,
                    expansions: ["author_id"],
                    "user.fields": ["username", "name", "profile_image_url"],
                });
                const users = mentions.includes?.users || [];
                const userMap = users.reduce((acc, user) => {
                    acc[user.id] = user;
                    return acc;
                }, {});
                for (const mention of mentions.data) {
                    const user = userMap[mention.author_id];
                    if (!user) {
                        console.warn(`No user found for mention ID: ${mention.id}`);
                        continue;
                    }
                    await db_1.db.mention.upsert({
                        where: { mentionId: mention.id },
                        update: {},
                        create: {
                            mentionId: mention.id,
                            tweetId: mention.id,
                            mentionText: mention.text,
                            twitterAccount: { connect: { id: account.id } },
                            authorId: user.id,
                            authorUsername: user.username,
                            authorName: user.name,
                            authorProfileImageUrl: user.profile_image_url,
                        },
                    });
                    console.log(`Stored mention with ID: ${mention.id}`);
                }
                nextToken = meta?.next_token;
            } while (nextToken);
        }
    }
    catch (error) {
        console.error("Error fetching mentions:", error);
    }
};
exports.fetchMentions = fetchMentions;
// Set up a CRON job to poll Twitter every minute
node_cron_1.default.schedule("* * * * *", () => {
    console.log("Checking for mentions...");
    (0, exports.fetchMentions)();
});
//# sourceMappingURL=fetch-mentions.js.map