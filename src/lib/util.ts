import { db } from "../lib/db";

export const getUserTimezone = async (userId: string): Promise<string> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  return user?.timezone || "UTC";
};
