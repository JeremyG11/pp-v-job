import { EventEmitter } from "events";
import { fetchTweetsForAccount } from "./jobs/fetch-tweet";
import { fetchUserTimeline } from "./jobs/fetchUserTimeline";
import { generateResponsesForTopTweets } from "./jobs/generate-tweet-content";

const eventEmitter = new EventEmitter();

eventEmitter.on(
  "twitterAccountLinking",
  async ({ twitterAccountId, userId }) => {
    await fetchTweetsForAccount(twitterAccountId);
    await generateResponsesForTopTweets(userId);
    await fetchUserTimeline(twitterAccountId);
  }
);
export { eventEmitter };
