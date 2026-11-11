import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { authRouter, sessionRouter, requireAuth } from "./auth";
import { careRouter } from "./care";
import {aiRouter} from "./ai";
import { exportsRouter } from "./exports";
import { patientScope } from "../middlewares/patient-scope";
import { staffAuthorization } from "../middlewares/authorize";
import { accountsRouter } from "./accounts";
import { policiesRouter } from "./policies";
import { operationsRouter, deviceWebhookRouter } from "./operations";
import {worklistsRouter} from "./worklists";
import {attachmentsRouter} from "./attachments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(deviceWebhookRouter);
router.use(requireAuth);
router.use(patientScope);
router.use(sessionRouter);
router.use(staffAuthorization);
router.use(accountsRouter);
router.use(policiesRouter);
router.use(operationsRouter);
router.use(worklistsRouter);
router.use(attachmentsRouter);
router.use(careRouter);
router.use(aiRouter);
router.use(exportsRouter);

export default router;
