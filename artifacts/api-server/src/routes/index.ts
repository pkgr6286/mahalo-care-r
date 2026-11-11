import { Router, type IRouter } from "express";
import {securityReportsRouter} from "./security-reports";
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
import {clinicalRouter} from "./clinical";
import {patientExportRouter} from "./patient-export";
import {demonstrationRouter} from "./demonstration";
import {caregiversRouter} from "./caregivers";
import {emergencyAccessRouter,emergencyReadAudit} from "./emergency-access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(deviceWebhookRouter);
router.use(requireAuth);
router.use(patientScope);
router.use(sessionRouter);
router.use(emergencyAccessRouter);
// These narrowly scoped handlers enforce their own staff/consent checks after authentication.
router.use(caregiversRouter);
router.use(staffAuthorization);
router.use(emergencyReadAudit);
router.use(accountsRouter);
router.use(policiesRouter);
router.use(operationsRouter);
router.use(worklistsRouter);
router.use(attachmentsRouter);
router.use(clinicalRouter);
router.use(patientExportRouter);
router.use(demonstrationRouter);
router.use(careRouter);
router.use(aiRouter);
router.use(exportsRouter);
router.use(securityReportsRouter);

export default router;
