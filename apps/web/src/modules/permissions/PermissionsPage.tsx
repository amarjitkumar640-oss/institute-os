import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import {
  getPermissions, updatePermissions,
  type PermissionScreen, type PermissionActions, type StaffRole,
} from "@/api/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

const ROLES: StaffRole[] = ["admin", "teacher", "frontdesk"];
const ACTIONS: (keyof PermissionActions)[] = ["canRead", "canWrite", "canEdit", "canDelete"];
const ACTION_LABEL: Record<keyof PermissionActions, string> = {
  canRead: "Read", canWrite: "Write", canEdit: "Edit", canDelete: "Delete",
};

// screenKey -> role -> actions — the editable working copy, seeded from the
// server response and only written back to it when a module's Save button
// is pressed (not on every checkbox click).
type Grid = Record<string, Record<StaffRole, PermissionActions>>;

function toGrid(screens: PermissionScreen[]): Grid {
  return Object.fromEntries(screens.map((s) => [s.key, s.roles]));
}

function ModuleCard({
  moduleName, screens, grid, onToggle, onSave, saving,
}: {
  moduleName: string;
  screens: PermissionScreen[];
  grid: Grid;
  onToggle: (screenKey: string, role: StaffRole, action: keyof PermissionActions) => void;
  onSave: (screens: PermissionScreen[]) => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{moduleName}</CardTitle>
        <Button size="sm" onClick={() => onSave(screens)} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 font-medium text-gray-500">Screen</th>
                {ROLES.map((role) => (
                  <th key={role} colSpan={ACTIONS.length} className="text-center py-2 font-medium text-gray-500 capitalize border-l border-gray-100">
                    {role}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <th />
                {ROLES.map((role) => (
                  ACTIONS.map((action) => (
                    <th key={`${role}-${action}`} className="text-center pb-1 text-[10px] font-medium text-gray-400 border-l border-gray-50 first:border-l-gray-100">
                      {ACTION_LABEL[action]}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {screens.map((screen) => (
                <tr key={screen.key} className="border-b border-gray-50">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-800">{screen.label}</p>
                    <p className="text-[11px] text-gray-400">{screen.platforms.join(" · ")}</p>
                  </td>
                  {ROLES.map((role) => (
                    ACTIONS.map((action) => (
                      <td key={`${role}-${action}`} className="text-center py-3 border-l border-gray-50">
                        <Checkbox
                          checked={grid[screen.key]?.[role]?.[action] ?? false}
                          onCheckedChange={() => onToggle(screen.key, role, action)}
                        />
                      </td>
                    ))
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function PermissionsPage() {
  const qc = useQueryClient();
  const { data: screens, isLoading } = useQuery({ queryKey: ["permissions"], queryFn: getPermissions });
  const [grid, setGrid] = useState<Grid>({});
  const [savingModule, setSavingModule] = useState<string | null>(null);

  useEffect(() => {
    if (screens) setGrid(toGrid(screens));
  }, [screens]);

  const mutation = useMutation({
    mutationFn: updatePermissions,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions"] });
      toast({ title: "Permissions updated", description: "Staff will see this the next time they log in or switch centers." });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to save" }),
    onSettled: () => setSavingModule(null),
  });

  function toggle(screenKey: string, role: StaffRole, action: keyof PermissionActions) {
    setGrid((prev) => ({
      ...prev,
      [screenKey]: {
        ...prev[screenKey],
        [role]: { ...prev[screenKey][role], [action]: !prev[screenKey][role][action] },
      },
    }));
  }

  function save(moduleScreens: PermissionScreen[]) {
    setSavingModule(moduleScreens[0]?.module ?? null);
    const grants = moduleScreens.flatMap((s) =>
      ROLES.map((role) => ({ screenKey: s.key, role, ...grid[s.key][role] })),
    );
    mutation.mutate(grants);
  }

  if (isLoading || !screens) {
    return (
      <div className="p-7 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const modules = Array.from(new Set(screens.map((s) => s.module)));

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center gap-3 bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <ShieldCheck className="h-5 w-5 text-violet-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Access Control</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Decide what each role can Read, Write, Edit, or Delete on every screen — applies to both web and mobile.
          </p>
        </div>
      </div>
      <div className="flex-1 p-7 space-y-6">
        {modules.map((moduleName) => {
          const moduleScreens = screens.filter((s) => s.module === moduleName);
          return (
            <ModuleCard
              key={moduleName}
              moduleName={moduleName}
              screens={moduleScreens}
              grid={grid}
              onToggle={toggle}
              onSave={save}
              saving={mutation.isPending && savingModule === moduleName}
            />
          );
        })}
      </div>
    </div>
  );
}
