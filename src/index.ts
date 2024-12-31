import cors from "cors";
import dotenv from "dotenv";
import express, { Application } from "express";
import { scheduleJobs } from "./scheduler";
import webhookRouter from "./routes/webhook";

const port = process.env.PORT || 3000;
const app: Application = express();
dotenv.config();

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

scheduleJobs();
app.use("/api", webhookRouter);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
