import express, { Router } from "express";
import { webhookController } from "../controllers/webhook";

const router: Router = express.Router();

router.post("/webhooks", webhookController);

export default router;
