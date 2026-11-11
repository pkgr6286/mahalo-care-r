import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWorkspacePreferencesQueryKey, useGetCurrentUser, getGetCurrentUserQueryKey, useGetWorkspacePreferences, useUpdateWorkspacePreferences,
  type WorkspacePreferences, type WorklistFilters, type WorklistKind,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/api";

export type Density = "comfortable" | "compact";

/** Preferences are scoped by signed-in user id in the cache key so an account switch never shows another user's views. */
export function usePrefs() {
  const me = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const uid = me.data?.id;
  const enabled = !!uid && !["patient","caregiver","emergency_read_only"].includes(me.data?.role??"");
  const key = [...getGetWorkspacePreferencesQueryKey(), uid ?? "anon"];
  const q = useGetWorkspacePreferences({ query: { enabled, queryKey: key, staleTime: 5 * 60_000, retry: false } });
  return { q, key, uid, enabled };
}

export function useDensity() {
  const { q, key } = usePrefs();
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useUpdateWorkspacePreferences();
  const density: Density = q.data?.density === "compact" ? "compact" : "comfortable";
  const set = (d: Density) => {
    const prev = qc.getQueryData(key) as WorkspacePreferences | undefined;
    if (prev) qc.setQueryData(key, { ...prev, density: d });
    m.mutate({ data: { density: d } }, {
      onSuccess: (p) => qc.setQueryData(key, p),
      onError: (e) => { if (prev) qc.setQueryData(key, prev); toast({ title: "Density not saved", description: errMsg(e), variant: "destructive" }); },
    });
  };
  return { density, set, pending: m.isPending, ready: q.isSuccess };
}

export function useSaveWorklistView() {
  const { key } = usePrefs();
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useUpdateWorkspacePreferences();
  const save = (kind: WorklistKind, filters: WorklistFilters, msg = "View saved") =>
    m.mutate({ data: { worklist: { kind, filters } } }, {
      onSuccess: (p) => { qc.setQueryData(key, p); toast({ title: msg, description: "Restored next time you open this view." }); },
      onError: (e) => toast({ title: "View not saved", description: errMsg(e), variant: "destructive" }),
    });
  return { save, pending: m.isPending };
}
