import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { authRouter, sessionRouter, requireAuth } from "./auth";
import { careRouter } from "./care";
import { exportsRouter } from "./exports";
import { patientScope } from "../middlewares/patient-scope";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth);
router.use(patientScope);
router.use(sessionRouter);
router.use(careRouter);
router.use(exportsRouter);

export default router;
