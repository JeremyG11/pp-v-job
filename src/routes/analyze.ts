import express, { Router } from "express";
import { AnalyzeSiteController } from "../controllers/analysis";

const router: Router = express.Router();

router.post("/", AnalyzeSiteController);

export default router;
