import express, { Router } from "express";
import { webhookController } from "../controllers/webhook";

const router: Router = express.Router();

router.post("/", webhookController);

export default router;
