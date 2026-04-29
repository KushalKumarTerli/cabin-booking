import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { DEPARTMENTS } from "@/lib/booking-utils";

export const Route = createFileRoute("/_authenticated/_admin/admin/users")({
  component: AdminUsers,
});

interface ProfileRow {
  id: string;
  full_name: string;
  employee_id: string;
  department: string;
  is_active: boolean;
}

interface RoleRow { user_id: string; role: "admin" | "manager"; }

interface EditProfileState {
  id: string;
  full_name: string;
  employee_id: string;
  department: string;
}

function AdminUsers() {
  const qc = useQueryClient();
  const [editProfile, setEditProfile] = useState<EditProfileState | null>(null);
  const [saving, setSaving] = useState(false);

  const profilesQ = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data as ProfileRow[];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data as RoleRow[];
    },
  });

  const setRole = async (userId: string, role: "admin" | "manager") => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message);
    else {
      toast.success(`Role set to ${role}`);
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
    }
  };

  const toggleActive = async (p: ProfileRow) => {
    const { error } = await supabase.from("profiles").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin-profiles"] });
  };

  const openEdit = (p: ProfileRow) =>
    setEditProfile({ id: p.id, full_name: p.full_name, employee_id: p.employee_id, department: p.department });

  const saveProfile = async () => {
    if (!editProfile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editProfile.full_name,
        employee_id: editProfile.employee_id,
        department: editProfile.department,
      })
      .eq("id", editProfile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile updated");
      setEditProfile(null);
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    }
  };

  const rolesByUser = new Map<string, "admin" | "manager">();
  (rolesQ.data ?? []).forEach((r) => rolesByUser.set(r.user_id, r.role));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users ({profilesQ.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(profilesQ.data ?? []).map((p) => {
              const role = rolesByUser.get(p.id) ?? "manager";
              return (
                <li key={p.id} className="py-3 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {p.full_name}
                      <Badge variant={role === "admin" ? "default" : "secondary"} className="capitalize">{role}</Badge>
                      {!p.is_active && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.employee_id} · {p.department || "—"}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    {role === "manager" ? (
                      <Button size="sm" variant="outline" onClick={() => setRole(p.id, "admin")}>Promote to Admin</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRole(p.id, "manager")}>Demote to Manager</Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className={p.is_active ? "text-destructive hover:text-destructive" : ""}
                      onClick={() => toggleActive(p)}
                    >
                      {p.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Edit profile dialog */}
      <Dialog open={!!editProfile} onOpenChange={(v) => { if (!v) setEditProfile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          {editProfile && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={editProfile.full_name}
                  onChange={(e) => setEditProfile({ ...editProfile, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Employee ID</Label>
                <Input
                  value={editProfile.employee_id}
                  onChange={(e) => setEditProfile({ ...editProfile, employee_id: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={editProfile.department}
                  onValueChange={(v) => setEditProfile({ ...editProfile, department: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfile(null)}>Cancel</Button>
            <Button onClick={saveProfile} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
