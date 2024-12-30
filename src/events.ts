import { EventEmitter } from "events";
import { fetchTweetsForAccount } from "./jobs/fetch-tweet";

const eventEmitter = new EventEmitter();

eventEmitter.on("twitterAccountLinking", async (data) => {
  await fetchTweetsForAccount(data.twitterAccountId);
});
export { eventEmitter };
