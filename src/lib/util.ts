import { db } from "../lib/db";

export const getUserTimezone = async (userId: string): Promise<string> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  return user?.timezone || "UTC";
};

export async function callAPI<
  Output extends Record<string, any> = Record<string, any>
>({
  endpoint,
  params,
}: {
  endpoint: string;
  params: Record<string, string>;
}): Promise<Output> {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY is not set");
  }

  const baseURL = "https://api.someurl.com";
  const queryParams = new URLSearchParams(params).toString();
  const url = `${baseURL}${endpoint}?${queryParams}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-KEY": process.env.API_KEY,
    },
  });

  if (!response.ok) {
    let res: string;
    try {
      res = JSON.stringify(await response.json(), null, 2);
    } catch (_) {
      res = await response.text();
    }
    throw new Error(`Failed to fetch data from ${endpoint}.
Response: ${res}`);
  }

  return response.json();
}
