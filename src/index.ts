import cors from "cors";
import dotenv from "dotenv";
import express, { Application } from "express";
import { scheduleJobs } from "./scheduler";
import webhookRouter from "./routes/webhook";
import analyzeRouter from "./routes/analyze";
import tweetRouter from "./routes/tweet";

const port = process.env.PORT || 3000;
const app: Application = express();
dotenv.config();

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: ALLOW_ORIGIN || "*", credentials: true }));
app.use(express.json());

scheduleJobs();
app.use("/api/v1/webhooks", webhookRouter);
app.use("/api/v1/analyze", analyzeRouter);
app.use("/api/v1/tweets", tweetRouter);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
