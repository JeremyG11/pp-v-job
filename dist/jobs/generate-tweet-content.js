"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResponseForTweet = generateResponseForTweet;
exports.generateResponsesForTopTweets = generateResponsesForTopTweets;
const openai_1 = __importDefault(require("openai"));
const db_1 = require("@/lib/db");
const client_1 = require("@prisma/client");
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
function getEngagementTone(engagementType) {
    switch (engagementType) {
        case "agreeableness_agree":
            return `
        Strong Agreement: Wholeheartedly endorsing the viewpoint ("Absolutely, this is spot on!").
        Moderate Agreement: Expressing general concurrence with slight reservations ("I agree with most of your points, especially regarding...").
      `;
        case "agreeableness_disagree":
            return `
        Moderate Disagreement: Gently challenging the viewpoint with respect ("I see where you're coming from, though I have a different take on...").
        Strong Disagreement: Respectfully opposing the viewpoint ("I understand your perspective, but I believe...").
      `;
        case "authority":
            return `
        Informative Insights: Sharing relevant information or experiences ("In our experience, implementing X can lead to...").
        Expert Opinions: Providing professional viewpoints or interpretations ("From an industry standpoint, this trend indicates...").
        Guidance and Advice: Offering actionable recommendations ("A practical approach to this issue is...").
        Clarifications: Elucidating complex concepts or misconceptions ("To clarify, the process involves...").
        Thought Leadership: Presenting forward-thinking ideas or predictions ("Looking ahead, we anticipate that...").
      `;
        case "empathy":
            return `
        Simple Empathy: "I understand how frustrating this can be."
        Detailed Compassion: "Here's how we've seen businesses navigate this situation successfully."
      `;
        case "solution":
            return `
        Broad Suggestions: "A possible solution to this could be..."
        Detailed Actionable Tips: "Here's a step-by-step approach that has worked in similar cases..."
      `;
        case "humor":
            return "Use lighthearted or witty responses to create a memorable interaction.";
        case "question":
            return "Pose thoughtful and context-relevant questions to spark conversation.";
        case "contrarian":
            return "Provide respectful counterpoints or alternative views.";
        case "trend":
            return "Align the tweet topic with current, relevant industry trends.";
        case "what_if":
            return "Use imaginative scenarios or hypotheticals to engage users creatively.";
        default:
            return "Neutral, professional tone.";
    }
}
async function fetchAppPainpoint(accountId) {
    const appPainpoint = await db_1.db.painPoint.findFirst({
        where: { twitterAccountId: accountId },
    });
    if (!appPainpoint || appPainpoint.description === "N/A")
        throw new Error("App's pain point is not properly configured.");
    return appPainpoint.description ?? "";
}
async function generatePromptResponse(prompt) {
    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
            { role: "system", content: "You generate engaging tweet responses." },
            { role: "user", content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
    });
    return response.choices[0]?.message?.content || "";
}
function parseGeneratedResponse(generatedResponse) {
    const match = generatedResponse.match(/^\d+\. \[(.+?)\]: (.+)$/);
    return match
        ? { responseType: match[1].trim(), responseText: match[2].trim() }
        : null;
}
async function saveGeneratedResponse(tweetId, response, engagementType) {
    await db_1.db.generatedTweetResponse.create({
        data: {
            tweetId,
            response: response.responseText,
            engagementType: client_1.EngagementType[engagementType.toUpperCase()],
            responseType: response.responseType,
        },
    });
}
async function generateResponseForTweet(tweetId, tweetText, engagementType, accountId) {
    const description = await fetchAppPainpoint(accountId);
    const engagementTone = getEngagementTone(engagementType);
    const prompt = `
    Create a response for the following tweet:
    Tweet: "${tweetText}"
    Engagement Type: ${engagementType}
    Tone Guidelines: ${engagementTone}
    Business Context: "${description}"
    Format the response as:
    1. [Response Type]: [Response Text]
  `;
    const generatedResponse = await generatePromptResponse(prompt);
    const response = parseGeneratedResponse(generatedResponse);
    if (response) {
        await saveGeneratedResponse(tweetId, response, engagementType);
    }
    return response;
}
async function fetchLatestTweets() {
    return await db_1.db.tweet.findMany({
        where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: {
            createdAt: "desc",
        },
        take: 50,
    });
}
function getTopTweets(tweets) {
    return tweets
        .sort((a, b) => b.impressionCount - a.impressionCount)
        .slice(0, 10);
}
async function generateResponsesForTopTweets() {
    try {
        const latestTweets = await fetchLatestTweets();
        const bestTweets = getTopTweets(latestTweets);
        const engagementTypes = [
            client_1.EngagementType.AUTHORITY,
            client_1.EngagementType.EMPATHY,
            client_1.EngagementType.SOLUTION_ORIENTED,
            client_1.EngagementType.HUMOR,
            client_1.EngagementType.QUESTION,
            client_1.EngagementType.CONTRARIAN,
            client_1.EngagementType.TREND_BASED,
            client_1.EngagementType.WHAT_IF,
        ];
        for (let i = 0; i < bestTweets.length; i++) {
            const tweet = bestTweets[i];
            const engagementType = engagementTypes[i % engagementTypes.length];
            const { id: tweetId, text: tweetText, twitterAccountId: accountId, } = tweet;
            try {
                console.log(`Processing tweet ${tweetId} with engagement type ${engagementType}...`);
                await generateResponseForTweet(tweetId, tweetText, engagementType, accountId);
                console.log(`Successfully generated response for tweet ${tweetId} with engagement type ${engagementType}.`);
            }
            catch (err) {
                console.error(`Error processing tweet ${tweetId} with engagement type ${engagementType}:`, err);
            }
        }
    }
    catch (err) {
        console.error("Error in cron job:", err);
    }
}
//# sourceMappingURL=generate-tweet-content.js.map