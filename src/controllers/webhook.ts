import { eventEmitter } from "@/events";
import { Request, Response } from "express";

export const webhookController = async (req: Request, res: Response) => {
  const { type } = req.body;

  if (type === "twitterAccountLinking") {
    eventEmitter.emit("twitterAccountLinking", {
      type: "twitterAccountLinking",
      twitterAccountId: req.body.twitterAccountId,
    });
  }

  console.log("Webhook received", req.body);

  res.sendStatus(200);
};
