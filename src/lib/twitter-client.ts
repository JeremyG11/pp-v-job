import { TwitterApi } from "twitter-api-v2";

export const TwitterRoClient = (accessToken: string) => {
  const client = new TwitterApi(accessToken);
  const roClient = client.readOnly;

  return roClient;
};
