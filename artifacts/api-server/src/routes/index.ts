import { Router, type IRouter } from "express";
import healthRouter from "./health";
import senseiRouter from "./sensei";

const router: IRouter = Router();

router.use(healthRouter);
router.use(senseiRouter);

export default router;
