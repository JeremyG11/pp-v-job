import express, { Router } from "express";
import { NotificationsController } from "../controllers/notifications";

const router: Router = express.Router();

router.get("/:userId", NotificationsController);

export default router;
