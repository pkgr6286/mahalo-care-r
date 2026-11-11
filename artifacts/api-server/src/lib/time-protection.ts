import {db} from "@workspace/db";
import {sql} from "drizzle-orm";

/** Local bootstrap, like audit protection. Install via a privileged migration in production. */
export async function installTimeProtection() {
  await db.execute(sql`CREATE OR REPLACE FUNCTION care_time_guard() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE started timestamptz; ended timestamptz;
  BEGIN
    IF NEW.kind <> 'time' OR NEW.status NOT IN ('running','committed') THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
      IF OLD.kind=NEW.kind AND OLD.status=NEW.status AND OLD.patient_id IS NOT DISTINCT FROM NEW.patient_id
        AND OLD.value=NEW.value AND OLD.metadata->>'startedAt' IS NOT DISTINCT FROM NEW.metadata->>'startedAt'
        AND OLD.metadata->>'endedAt' IS NOT DISTINCT FROM NEW.metadata->>'endedAt'
        AND OLD.metadata->>'userId' IS NOT DISTINCT FROM NEW.metadata->>'userId' THEN RETURN NEW; END IF;
    END IF;
    PERFORM pg_advisory_xact_lock(7348202);
    started := (NEW.metadata->>'startedAt')::timestamptz;
    IF started IS NULL OR NEW.patient_id IS NULL THEN RAISE EXCEPTION 'Time requires a patient and start' USING ERRCODE='23514',CONSTRAINT='care_time_valid'; END IF;
    IF NEW.status='running' THEN
      IF COALESCE(NEW.metadata->>'userId','')='' THEN RAISE EXCEPTION 'A timer requires a user' USING ERRCODE='23514',CONSTRAINT='care_time_valid'; END IF;
      IF EXISTS(SELECT 1 FROM care_records r WHERE r.kind='time' AND r.status='running' AND r.id<>NEW.id AND r.metadata->>'userId'=NEW.metadata->>'userId')
      THEN RAISE EXCEPTION 'Only one running timer is allowed per user' USING ERRCODE='23P01'; END IF;
      RETURN NEW;
    END IF;
    ended := (NEW.metadata->>'endedAt')::timestamptz;
    IF ended IS NULL OR ended<=started OR abs(NEW.value-extract(epoch from(ended-started))/60)>0.0001
    THEN RAISE EXCEPTION 'Time duration must match its exact interval' USING ERRCODE='23514',CONSTRAINT='care_time_valid'; END IF;
    IF EXISTS(SELECT 1 FROM care_records r WHERE r.kind='time' AND r.status='committed' AND r.id<>NEW.id
      AND (r.patient_id=NEW.patient_id OR (COALESCE(NEW.metadata->>'userId','')<>'' AND r.metadata->>'userId'=NEW.metadata->>'userId'))
      AND tstzrange((r.metadata->>'startedAt')::timestamptz,(r.metadata->>'endedAt')::timestamptz,'[)') && tstzrange(started,ended,'[)'))
    THEN RAISE EXCEPTION 'Committed time overlaps existing patient or user time' USING ERRCODE='23P01'; END IF;
    RETURN NEW;
  END; $$`);
  await db.execute(sql`CREATE OR REPLACE TRIGGER care_records_time_guard BEFORE INSERT OR UPDATE ON care_records FOR EACH ROW EXECUTE FUNCTION care_time_guard()`);
}
