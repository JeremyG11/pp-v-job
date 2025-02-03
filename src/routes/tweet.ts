import express, { Router } from "express";
import { TweetsController } from "../controllers/tweet";

const router: Router = express.Router();

router.post("/generate", TweetsController);

export default router;
