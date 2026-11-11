import {db} from "@workspace/db";
import {sql} from "drizzle-orm";
export async function installPolicyProtection() {
  await db.execute(sql`CREATE OR REPLACE FUNCTION care_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN
      IF OLD.status<>'draft' THEN RAISE EXCEPTION 'Reviewed policy documents cannot be deleted' USING ERRCODE='23514',CONSTRAINT='care_policy_immutable'; END IF;
      RETURN OLD;
    END IF;
    IF TG_OP='INSERT' THEN
      IF NEW.status<>'draft' THEN RAISE EXCEPTION 'New policies must be drafts' USING ERRCODE='23514',CONSTRAINT='care_policy_immutable'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.status<>'draft' AND (OLD.body IS DISTINCT FROM NEW.body OR OLD.kind<>NEW.kind OR OLD.program<>NEW.program OR OLD.version<>NEW.version OR OLD.payer<>NEW.payer OR OLD.effective_from<>NEW.effective_from
      OR OLD.source_ref<>NEW.source_ref OR OLD.review_note<>NEW.review_note OR OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by OR OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
      OR OLD.created_by<>NEW.created_by OR OLD.created_at IS DISTINCT FROM NEW.created_at)
    THEN RAISE EXCEPTION 'Reviewed policy documents are immutable' USING ERRCODE='23514',CONSTRAINT='care_policy_immutable'; END IF;
    IF OLD.status IN('published','retired') AND OLD.published_at IS DISTINCT FROM NEW.published_at OR OLD.status='retired' AND OLD.retired_at IS DISTINCT FROM NEW.retired_at
    THEN RAISE EXCEPTION 'Policy publication timestamps are immutable' USING ERRCODE='23514',CONSTRAINT='care_policy_immutable'; END IF;
    IF OLD.status='published' AND NEW.status NOT IN('published','retired') OR OLD.status='retired' AND NEW.status<>'retired'
      OR OLD.status='reviewed' AND NEW.status NOT IN('reviewed','published') OR OLD.status='draft' AND NEW.status NOT IN('draft','reviewed')
    THEN RAISE EXCEPTION 'Invalid policy lifecycle transition' USING ERRCODE='23514',CONSTRAINT='care_policy_immutable'; END IF;
    IF NEW.status IN('reviewed','published','retired') AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR length(NEW.review_note)<20 OR length(NEW.source_ref)=0)
    THEN RAISE EXCEPTION 'A policy requires documented review' USING ERRCODE='23514',CONSTRAINT='care_policy_immutable'; END IF;
    RETURN NEW;
  END; $$`);
  await db.execute(sql`CREATE OR REPLACE TRIGGER care_program_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON care_program_policies FOR EACH ROW EXECUTE FUNCTION care_policy_guard()`);
}
