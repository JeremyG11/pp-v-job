import { EventEmitter } from "events";
import { fetchTweetsForAccount } from "./jobs/fetch-tweet";
import { fetchUserTimeline } from "./jobs/fetchUserTimeline";
import { generateResponsesForTopTweets } from "./jobs/generate-tweet-content";

const eventEmitter = new EventEmitter();

eventEmitter.on(
  "twitterAccountLinking",
  async ({ twitterAccountId, userId }) => {
    try {
      await fetchTweetsForAccount(twitterAccountId);

      await generateResponsesForTopTweets(userId);

      await fetchUserTimeline(twitterAccountId);
    } catch (error) {
      console.error("Error handling twitterAccountLinking event:", error);
    }
  }
);

export { eventEmitter };

export async function notifyKeywordsRefined(
  refinedKeywords: string[],
  userId: string
) {
  eventEmitter.emit("keywordsRefined", { userId, refinedKeywords });
}
