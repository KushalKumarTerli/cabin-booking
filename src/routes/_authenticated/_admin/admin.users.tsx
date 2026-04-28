import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_admin/admin/users")({
  component: AdminUsers,
});

interface ProfileRow { id: string; full_name: string; employee_id: string; department: string; is_active: boolean; }
interface RoleRow { user_id: string; role: "admin" | "manager"; }

function AdminUsers() {
  const qc = useQueryClient();

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
    // Remove existing roles, then insert the new one
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

  const rolesByUser = new Map<string, "admin" | "manager">();
  (rolesQ.data ?? []).forEach((r) => rolesByUser.set(r.user_id, r.role));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">All users ({profilesQ.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(profilesQ.data ?? []).map((p) => {
              const role = rolesByUser.get(p.id) ?? "manager";
              return (
                <li key={p.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {p.full_name}
                      <Badge variant={role === "admin" ? "default" : "secondary"} className="capitalize">{role}</Badge>
                      {!p.is_active && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.employee_id} · {p.department}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {role === "manager" ? (
                      <Button size="sm" variant="outline" onClick={() => setRole(p.id, "admin")}>Promote to admin</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRole(p.id, "manager")}>Demote to manager</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>
                      {p.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}