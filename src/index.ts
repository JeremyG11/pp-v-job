import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import { Server } from "socket.io";
import express, { Application } from "express";

// Local imports
import { setupSocket } from "./socket";
import tweetRouter from "./routes/tweet";
import { scheduleJobs } from "./scheduler";
import webhookRouter from "./routes/webhook";
import analyzeRouter from "./routes/analyze";
import notificationRouter from "./routes/notifications";

dotenv.config();

const port = process.env.PORT || 3000;
const app: Application = express();

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: ALLOW_ORIGIN, credentials: true }));
app.use(express.json());

scheduleJobs();

// Create HTTP server with Express
const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  path: "/socket.io/",
});

// Initialize WebSockets
setupSocket(io);

// Define API routes
app.use("/api/v1/webhooks", webhookRouter);
app.use("/api/v1/analyze", analyzeRouter);
app.use("/api/v1/tweets", tweetRouter);
app.use("/api/v1/notifications", notificationRouter);

// Start the server
server.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
