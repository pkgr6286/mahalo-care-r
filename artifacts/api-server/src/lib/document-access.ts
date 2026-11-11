import type {RecordRow} from "@workspace/db";
/** Discarding a private draft must never turn it into a patient-released document. */
export function isReleasedPatientDocument(r:Pick<RecordRow,"kind"|"status">) {
  return r.kind==="careplans"&&["active","superseded","closed"].includes(r.status)
    ||r.kind==="consents"&&["captured","revoked"].includes(r.status);
}
