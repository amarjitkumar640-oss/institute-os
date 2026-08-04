import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { listAllCenters, updateCenter, listCenterStaff, assignStaffToCenter, removeStaffFromCenter, type CenterStaffMember } from "@/api/centers";
import { listStaff } from "@/api/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/FormField";
import { DataTable } from "@/components/DataTable";
import { toast } from "@/components/ui/use-toast";
import { type ColumnDef } from "@tanstack/react-table";

function AssignStaffDialog({ centerId, open, onClose }: { centerId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: allStaff } = useQuery({ queryKey: ["staff"], queryFn: listStaff });
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState<"admin" | "teacher" | "frontdesk">("frontdesk");
  const [loading, setLoading] = useState(false);

  async function handleAssign() {
    if (!staffId) return;
    setLoading(true);
    try {
      await assignStaffToCenter(centerId, staffId, role);
      qc.invalidateQueries({ queryKey: ["center-staff", centerId] });
      toast({ title: "Staff assigned" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Failed to assign staff" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Assign Staff to Center</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="Staff Member" required>
            <Select onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {(allStaff ?? []).filter((s) => s.isActive).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.fullName} ({s.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Role in Center" required>
            <Select onValueChange={(v) => setRole(v as "admin" | "teacher" | "frontdesk")} defaultValue="frontdesk">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="frontdesk">Front Desk</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAssign} disabled={!staffId || loading}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CenterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const { data: centers } = useQuery({ queryKey: ["centers-all"], queryFn: listAllCenters });
  const center = centers?.find((c) => c.id === id);

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ["center-staff", id],
    queryFn: () => listCenterStaff(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (d: { name?: string; address?: string; phone?: string; isActive?: boolean }) =>
      updateCenter(id!, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["centers-all"] });
      toast({ title: "Center updated" });
      setEditing(false);
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  const removeMutation = useMutation({
    mutationFn: (staffId: string) => removeStaffFromCenter(id!, staffId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["center-staff", id] });
      toast({ title: "Staff removed" });
    },
    onError: () => toast({ variant: "destructive", title: "Remove failed" }),
  });

  if (!center) return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;

  function startEdit() {
    setEditName(center!.name);
    setEditAddress(center!.address ?? "");
    setEditPhone(center!.phone ?? "");
    setEditing(true);
  }

  const staffColumns: ColumnDef<CenterStaffMember>[] = [
    { accessorKey: "fullName", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span> },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "phone", header: "Phone" },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <Badge variant="info" className="capitalize">{row.original.role}</Badge>,
    },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => <Badge variant={row.original.isActive ? "success" : "default"}>{row.original.isActive ? "Yes" : "No"}</Badge>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm("Remove from center?")) removeMutation.mutate(row.original.staffId); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/centers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{center.name}</h1>
          <p className="text-sm text-gray-500">{center.address ?? "No address"}</p>
        </div>
        <Button variant="outline" onClick={startEdit}>Edit</Button>
      </div>

      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Students</p>
              <p className="text-2xl font-bold mt-1">{center.counts?.students ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Batches</p>
              <p className="text-2xl font-bold mt-1">{center.counts?.batches ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Staff</p>
              <p className="text-2xl font-bold mt-1">{center.counts?.staff ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  checked={center.isActive}
                  onCheckedChange={(v) => updateMutation.mutate({ isActive: v })}
                />
                <span className="text-sm">{center.isActive ? "Active" : "Inactive"}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Staff Assignments</CardTitle>
            <Button size="sm" onClick={() => setShowAssign(true)}>
              <Plus className="mr-2 h-4 w-4" /> Assign Staff
            </Button>
          </CardHeader>
          <CardContent>
            {staffLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (staff ?? []).length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No staff assigned yet</div>
            ) : (
              <DataTable columns={staffColumns} data={staff ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Center</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Name">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </FormField>
            <FormField label="Address">
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </FormField>
            <FormField label="Phone">
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate({ name: editName, address: editAddress, phone: editPhone })} disabled={updateMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAssign && id && <AssignStaffDialog centerId={id} open={showAssign} onClose={() => setShowAssign(false)} />}
    </div>
  );
}
