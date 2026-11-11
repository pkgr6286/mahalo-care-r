import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { dependencyReadiness } from "../lib/readiness";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});
router.get("/readyz", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const state=await dependencyReadiness();
    res.status(state.status==="ready"?200:503).json(state);
  } catch {
    res.status(503).json({status:"not_ready",database:"unavailable_or_schema_incomplete",dataClass:"synthetic"});
  }
});

export default router;
