import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, X, Mail, Phone, AtSign, Building2, CalendarDays } from "lucide-react";
import { getMyProfile, uploadMyPhoto, deleteMyPhoto } from "@/api/staff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatDate, initials } from "@/lib/utils";

const ROLE_COLORS: Record<string, "default" | "info" | "warning"> = {
  admin: "info",
  teacher: "warning",
  frontdesk: "default",
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-900 truncate">{value ?? "—"}</p>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: profile, isLoading } = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile });

  const uploadMutation = useMutation({
    mutationFn: uploadMyPhoto,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Photo updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Photo upload failed" }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteMyPhoto,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Photo removed" });
    },
    onError: () => toast({ variant: "destructive", title: "Could not remove photo" }),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadMutation.mutate(file);
  }

  if (isLoading || !profile) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">My Profile</h1>
      </div>

      <div className="flex-1 p-6 max-w-2xl space-y-6">
        <Card>
          <CardContent className="p-6 flex items-center gap-5">
            <div className="relative shrink-0">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={profile.fullName} className="h-20 w-20 rounded-2xl object-cover" />
              ) : (
                <div className="h-20 w-20 rounded-2xl bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-2xl">
                  {initials(profile.fullName)}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-gray-50"
                title={profile.photoUrl ? "Replace photo" : "Add photo"}
              >
                {uploadMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
                  : <Camera className="h-3.5 w-3.5 text-gray-600" />}
              </button>
              {profile.photoUrl && (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="absolute -bottom-1 -left-1 h-7 w-7 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-red-50"
                  title="Remove photo"
                >
                  <X className="h-3.5 w-3.5 text-red-500" />
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>

            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{profile.fullName}</h2>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {profile.roles.map((r) => (
                  <Badge key={r} variant={ROLE_COLORS[r] ?? "default"} className="capitalize">{r}</Badge>
                ))}
                <Badge variant={profile.isActive ? "success" : "default"}>{profile.isActive ? "Active" : "Inactive"}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Contact Information</CardTitle></CardHeader>
          <CardContent>
            <InfoRow icon={Mail} label="Email" value={profile.email} />
            <InfoRow icon={Phone} label="Phone" value={profile.phone} />
            <InfoRow icon={AtSign} label="Username" value={profile.username} />
            <InfoRow icon={CalendarDays} label="Member Since" value={formatDate(profile.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Center Assignments</CardTitle></CardHeader>
          <CardContent>
            {profile.centerAssignments.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Not assigned to any specific center.</p>
            ) : (
              profile.centerAssignments.map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-gray-400" />
                  </div>
                  <span className="flex-1 text-sm text-gray-900">{a.center.name}</span>
                  <div className="flex flex-wrap gap-1">
                    {a.roles.map((r) => (
                      <Badge key={r} variant={ROLE_COLORS[r] ?? "default"} className="capitalize">{r}</Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
