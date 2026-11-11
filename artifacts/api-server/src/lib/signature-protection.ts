import {db} from "@workspace/db";
import {sql} from "drizzle-orm";
/** Protect signed clinical content while permitting explicit lifecycle-only updates. */
export async function installSignatureProtection() {
  await db.execute(sql`CREATE OR REPLACE FUNCTION care_protect_signed_record() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE retained boolean; permitted text[];
    BEGIN
      retained:=(OLD.kind='notes' AND OLD.status IN ('signed','amended','superseded'))
        OR (OLD.kind='careplans' AND OLD.status IN ('active','superseded','closed'))
        OR (OLD.kind='consents' AND OLD.status IN ('captured','revoked'))
        OR (OLD.kind='interactions' AND OLD.metadata->>'kind'='consultant_review')
        OR (OLD.kind='tasks' AND OLD.metadata->>'kind'='education_acknowledgment')
        OR OLD.kind='drafts';
      IF NOT COALESCE(retained,false) THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Signed clinical history cannot be deleted' USING ERRCODE='23514',CONSTRAINT='care_clinical_signature_immutable'; END IF;
      IF (to_jsonb(OLD)-ARRAY['status','metadata','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','metadata','updated_at'])
        THEN RAISE EXCEPTION 'Signed clinical content is immutable' USING ERRCODE='23514',CONSTRAINT='care_clinical_signature_immutable'; END IF;
      permitted:=CASE WHEN OLD.kind='careplans' THEN ARRAY['supersededAt','closedAt','closedReason']
        WHEN OLD.kind='consents' AND OLD.status='captured' THEN ARRAY['revokedAt','revokedBy','revokedById','reason']
        WHEN OLD.kind='drafts' AND OLD.status='pending' THEN ARRAY['acceptedBy','acceptedById','acceptedAt','acceptedRecordId','humanReviewConfirmed','reviewedText','acceptedTextHash','acceptedTextLength','edited','editDistance','editRatio','acceptanceNumericCheck','numericOverrideReason','rejectedBy','rejectedById','rejectedAt','rejectionReason'] ELSE ARRAY[]::text[] END;
      IF (OLD.metadata-permitted) IS DISTINCT FROM (NEW.metadata-permitted)
        THEN RAISE EXCEPTION 'Signed clinical metadata is immutable' USING ERRCODE='23514',CONSTRAINT='care_clinical_signature_immutable'; END IF;
      IF NEW.status<>OLD.status AND NOT (
        OLD.kind='careplans' AND OLD.status='active' AND NEW.status IN ('superseded','closed')
        OR OLD.kind='careplans' AND OLD.status='superseded' AND NEW.status='closed'
        OR OLD.kind='notes' AND OLD.status='signed' AND NEW.status IN ('amended','superseded')
        OR OLD.kind='consents' AND OLD.status='captured' AND NEW.status='revoked'
        OR OLD.kind='drafts' AND OLD.status='pending' AND NEW.status IN ('accepted','rejected'))
        THEN RAISE EXCEPTION 'Invalid signed record lifecycle transition' USING ERRCODE='23514',CONSTRAINT='care_clinical_signature_immutable'; END IF;
      RETURN NEW;
    END $$`);
  await db.execute(sql`CREATE OR REPLACE TRIGGER care_clinical_signature_guard BEFORE UPDATE OR DELETE ON care_records FOR EACH ROW EXECUTE FUNCTION care_protect_signed_record()`);
}
