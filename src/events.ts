import { EventEmitter } from "events";
import { fetchTweetsForAccount } from "./jobs/fetch-tweet";
import { generateResponsesForTopTweets } from "./jobs/generate-tweet-content";
import { fetchTwitterData } from "./jobs/fetchTwitterData";

const eventEmitter = new EventEmitter();

eventEmitter.on("twitterAccountLinking", async (data) => {
  await fetchTweetsForAccount(data.twitterAccountId);
  await generateResponsesForTopTweets();
  await fetchTwitterData(data.twitterAccountId);
});
export { eventEmitter };
