import type { PatientRow, RecordRow } from "@workspace/db";
import { policyCatalog, selectRulepack, bundledPolicyId } from "./program-policies";
import { allRecords, type Store } from "./store";
import { countDeviceDays, localDay, rollingSupplyWindow } from "./periods";
import { isCountedMonitoring } from "./counted-monitoring";

/** Uses billing's source, credential, activity and local-period predicates, never raw observation counts. */
export async function programProgress(s: Store, p: PatientRow, clock = new Date()) {
  const rs = await allRecords(s), catalog = await policyCatalog(s);
  return rs.filter(r => r.kind === "enrollments" && r.patientId === p.id && ["active", "paused"].includes(r.status)).map(enrollment => {
    const program = enrollment.program!, period = localDay(clock, p.timezone).slice(0, 7);
    const selected = selectRulepack(catalog, program, String(enrollment.metadata.rulepackId ?? bundledPolicyId(program)), p.payer, localDay(clock, p.timezone));
    const mine = rs.filter(r => r.patientId === p.id && r.program === program && Date.parse(r.date) <= clock.getTime());
    const current = mine.filter(r => localDay(r.date, p.timezone).startsWith(period));
    const credentials = selected.body.time_rules.counts_for_management;
    const eligible = current.filter(r => r.kind === "time" && r.status === "committed" && selected.body.time_rules.activities.includes(String(r.metadata.activity)) &&
      [...credentials.clinical_staff_general_supervision, ...credentials.practitioner_only].includes(String(r.metadata.credential)));
    const staff = eligible.filter(r => !credentials.practitioner_only.includes(String(r.metadata.credential)));
    const minutes = (["RPM", "RTM"].includes(program) ? eligible : staff).reduce((n, r) => n + r.value, 0);
    const window = rollingSupplyWindow(String(enrollment.metadata.supplyAnchor ?? enrollment.date), clock, p.timezone);
    const readings = mine.filter(r => localDay(r.date, p.timezone) >= window.startDay && localDay(r.date, p.timezone) < window.endDayExclusive && isCountedMonitoring(r, program, selected.body));
    const deviceDays = countDeviceDays(readings, p.timezone);
    const signedPlan = mine.some(r => r.kind === "careplans" && ["active", "superseded", "closed"].includes(r.status) && Date.parse(String(r.metadata.signedAt ?? r.date)) <= clock.getTime());
    const consent = mine.some(r => r.kind === "consents" && (r.status === "captured" || r.status === "revoked" && Date.parse(String(r.metadata.revokedAt)) > clock.getTime()));
    const liveInteractions = current.filter(r => r.kind === "interactions" && r.status === "completed" && r.metadata.isLiveTwoWay === true && !["stub", "console", "simulated"].includes(String(r.metadata.driver))).length;
    const initialMonth = localDay(enrollment.date, p.timezone).startsWith(period);
    const family = enrollment.metadata.cocm === true ? "cocm" : "standard";
    let management = selected.body.codes.filter(c => c.kind === "management" && c.family === family && c.minutes_bucket !== "practitioner");
    if (program === "BHI" && family === "cocm") management = management.filter(c => c.cpt !== (initialMonth ? "99493" : "99492"));
    const minuteTarget = Math.max(0, ...management.map(c => c.requires.minutes_min ?? 0));
    const variant = enrollment.metadata.variant === "respiratory" ? "respiratory" : "msk";
    const deviceDayTarget = Math.max(0, ...selected.body.codes.filter(c => c.kind === "supply" && (c.applies_to === "all" || c.applies_to === variant)).map(c => c.requires.device_days_min ?? 0));
    const nextSteps: string[] = [];
    if (!consent) nextSteps.push("Capture current program consent");
    if (!signedPlan) nextSteps.push("Review and sign the care plan");
    if (minuteTarget && minutes < minuteTarget) nextSteps.push(`${Number((minuteTarget - minutes).toFixed(2))} additional documented care minutes to the configured threshold`);
    if (deviceDayTarget && deviceDays < deviceDayTarget) nextSteps.push(`${deviceDayTarget - deviceDays} more eligible monitoring days in the displayed window`);
    if (["RPM", "RTM"].includes(program) && liveInteractions === 0) nextSteps.push("Document a live two-way care interaction");
    return { enrollmentId: enrollment.id, program, periodLabel: period, windowStart: window.startDay, windowEnd: window.endDayExclusive, supplyWindowComplete: window.complete, minutes, minuteTarget, deviceDays, deviceDayTarget, liveInteractions, signedPlan, consent, policyLabel: selected.body.version, nextSteps };
  });
}
