import { Router } from "express";
import { db } from "@workspace/db";
import { GetClinicalProfileParams } from "@workspace/api-zod";
import { clinicalProfile, updateClinicalProfile } from "../lib/clinical-profile";
import { programProgress } from "../lib/program-progress";
import { getPatientRow, writeAudit, type Actor } from "../lib/store";

export const clinicalRouter = Router();
clinicalRouter.get("/patients/:id/clinical-profile", async (req, res) => {
  const { id } = GetClinicalProfileParams.parse(req.params), actor = res.locals.actor as Actor;
  const result = await db.transaction(s=>clinicalProfile(s,id),{isolationLevel:"repeatable read",accessMode:"read only"});
  await writeAudit(db, actor, "read_clinical_profile", id, id);
  res.json(result);
});
clinicalRouter.patch("/patients/:id/clinical-profile", async (req, res) => {
  const { id } = GetClinicalProfileParams.parse(req.params);
  res.json(await updateClinicalProfile(res.locals.actor as Actor, id, req.body));
});
clinicalRouter.get("/patients/:id/program-progress", async (req, res) => {
  const { id } = GetClinicalProfileParams.parse(req.params), actor = res.locals.actor as Actor;
  const result = await programProgress(db, await getPatientRow(db, id));
  await writeAudit(db, actor, "read_program_progress", id, id);
  res.json(result);
});
