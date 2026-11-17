/**
 * Read-only clinical-record verification against the prepared synthetic practice.
 * Does not create, replace, sign, or delete any clinical record or retained file.
 * Run: pnpm --filter @workspace/api-server exec tsx src/check-patient-plan-documents.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import "./validation-fetch";

type Plan = { id: string; patientId: string; status: string };
type Version = { id: string; recordId: string; sha256: string; size: number };

function client() {
  let cookie = "";
  return {
    async request(path: string, expected = 200, body?: unknown) {
      const res = await fetch(`http://localhost:80/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.some((c) => c.startsWith("mahalo_session="))) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
      assert.equal(res.status, expected, `${path}: expected ${expected}, got ${res.status}`);
      return res;
    },
    async json<T>(path: string) {
      return (await this.request(path)).json() as Promise<T>;
    },
  };
}

async function main() {
  const staff = client(), patient = client(), guest = client();
  try {
    await staff.request("/auth/login", 200, { email: "demo@mahalo.care", password: "MahaloDemo2026!" });
    await patient.request("/auth/login", 200, { email: "patient@mahalo.care", password: "MahaloDemo2026!" });
    const roster = await patient.json<{ id: string }[]>("/patients");
    assert.equal(roster.length, 1, "Patient must see only their own chart");
    const ownId = roster[0]!.id;
    const plans = await patient.json<Plan[]>("/records/careplans");
    assert.ok(plans.length, "Prepare the synthetic practice with signed patient plans before running this check");
    assert.ok(plans.every((p) => p.patientId === ownId && ["active", "superseded", "closed"].includes(p.status)));
    const allPlans = await staff.json<Plan[]>("/records/careplans");
    const outside = allPlans.find((p) => p.patientId !== ownId && p.status === "active");
    assert.ok(outside, "A second patient's signed plan is required for denial verification");
    const outsideHistory = await staff.json<Version[]>(`/documents/${outside.id}/versions`);
    assert.ok(outsideHistory.length, "The second patient's plan must already have a retained PDF");

    let delivered = 0;
    for (const plan of plans) {
      const before = await staff.json<Version[]>(`/documents/${plan.id}/versions`);
      assert.ok(before.length, "This read-only check requires already-retained signed plans");
      const history = await patient.json<Version[]>(`/documents/${plan.id}/versions`);
      assert.deepEqual(history, before);
      const pdf = await patient.request(`/documents/${plan.id}`);
      assert.match(pdf.headers.get("content-type") ?? "", /application\/pdf/);
      assert.equal(pdf.headers.get("x-document-retained"), "true");
      const bytes = Buffer.from(await pdf.arrayBuffer());
      assert.ok(bytes.length > 100);
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      assert.equal(createHash("sha256").update(bytes).digest("hex"), pdf.headers.get("x-document-sha256"));
      delivered++;
      for (const version of history) {
        const retained = await patient.request(`/documents/${version.recordId}/versions/${version.id}`);
        assert.match(retained.headers.get("content-type") ?? "", /application\/pdf/);
        const data = Buffer.from(await retained.arrayBuffer());
        assert.equal(data.subarray(0, 5).toString(), "%PDF-");
        assert.equal(data.length, version.size);
        assert.equal(createHash("sha256").update(data).digest("hex"), version.sha256);
        delivered++;
      }
      await patient.request(`/documents/${plan.id}/versions/${outsideHistory[0]!.id}`, 404);
      assert.deepEqual(await staff.json(`/documents/${plan.id}/versions`), before, "Downloading must not replace or delete retained files");
    }
    for (const suffix of ["", "/versions", `/versions/${outsideHistory[0]!.id}`, `/versions/${outsideHistory[0]!.id}/source`]) {
      await patient.request(`/documents/${outside.id}${suffix}`, 403);
    }
    const privatePlan = allPlans.find((p) => p.patientId === ownId && !["active", "superseded", "closed"].includes(p.status));
    if (privatePlan) {
      await patient.request(`/documents/${privatePlan.id}`, 403);
      await patient.request(`/documents/${privatePlan.id}/versions`, 403);
    }
    await guest.request(`/documents/${plans[0]!.id}`, 401);
    assert.deepEqual(await staff.json(`/documents/${outside.id}/versions`), outsideHistory);
    console.log(`PASS: ${delivered} nonempty, checksum-verified patient PDFs; cross-patient PDF/history/source, mismatched-version and anonymous denials; retained history unchanged.`);
  } finally {
    await Promise.all([staff.request("/auth/logout", 200, {}), patient.request("/auth/logout", 200, {})]);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
