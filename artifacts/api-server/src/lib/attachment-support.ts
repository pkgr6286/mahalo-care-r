import {db} from "@workspace/db";
import {sql} from "drizzle-orm";
export async function installAttachmentSupport(){
  await db.execute(sql`create table if not exists care_attachments(
    id text primary key,patient_id text not null references care_patients(id),filename text not null,size_bytes integer not null,mime_type text not null,
    status text not null default 'awaiting_upload',sha256 text,object_path text,generation text,
    uploaded_by_id text not null,uploaded_by_name text not null,reviewed_by_id text,reviewed_by_name text,reviewed_at timestamptz,review_reason text,validation_error text,
    created_at timestamptz not null default now(),updated_at timestamptz not null default now())`);
  await db.execute(sql`create index if not exists care_attachments_patient_idx on care_attachments(patient_id,created_at)`);
  await db.execute(sql`create unique index if not exists care_attachments_object_idx on care_attachments(object_path) where object_path is not null`);
  await db.execute(sql`create or replace function protect_care_attachment() returns trigger language plpgsql as $$
    begin
      if TG_OP='DELETE' then raise exception 'Supporting file history cannot be deleted' using errcode='23514'; end if;
      if row(NEW.id,NEW.patient_id,NEW.filename,NEW.size_bytes,NEW.mime_type,NEW.uploaded_by_id,NEW.uploaded_by_name,NEW.created_at)
        is distinct from row(OLD.id,OLD.patient_id,OLD.filename,OLD.size_bytes,OLD.mime_type,OLD.uploaded_by_id,OLD.uploaded_by_name,OLD.created_at)
        then raise exception 'Supporting file provenance is immutable' using errcode='23514'; end if;
      if OLD.sha256 is not null and row(NEW.sha256,NEW.object_path,NEW.generation) is distinct from row(OLD.sha256,OLD.object_path,OLD.generation)
        then raise exception 'Sealed supporting file bytes cannot be replaced' using errcode='23514'; end if;
      if NEW.status in ('quarantined','released_demo','revoked') and
        (NEW.sha256 is null or NEW.sha256 !~ '^[a-f0-9]{64}$' or NEW.object_path is null or NEW.generation is null)
        then raise exception 'Sealed private bytes are required' using errcode='23514'; end if;
      if not ((OLD.status='awaiting_upload' and NEW.status in ('quarantined','rejected','canceled'))
        or(OLD.status='quarantined' and NEW.status in ('released_demo','rejected','canceled'))
        or(OLD.status='released_demo' and NEW.status='revoked'))
        then raise exception 'Invalid supporting file transition' using errcode='23514'; end if;
      return NEW;
    end $$`);
  await db.execute(sql`drop trigger if exists protect_care_attachment on care_attachments`);
  await db.execute(sql`create trigger protect_care_attachment before update or delete on care_attachments for each row execute function protect_care_attachment()`);
}
