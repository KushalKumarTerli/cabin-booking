import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building, Loader2 } from "lucide-react";
import { verifyAdminCode } from "@/features/auth/admin-code.functions";
import { DEPARTMENTS } from "@/lib/booking-utils";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    employee_id: "",
    email: "",
    password: "",
    department: "",
    role: "manager" as "manager" | "admin",
    admin_code: "",
  });

  const update = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const isAdmin = form.role === "admin";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (!isAdmin && !form.department) {
      toast.error("Please select your department");
      return;
    }
    setLoading(true);

    if (isAdmin) {
      const ok = await verifyAdminCode({ data: { code: form.admin_code } });
      if (!ok.valid) {
        setLoading(false);
        toast.error("Invalid admin signup code");
        return;
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          full_name: form.full_name,
          employee_id: form.employee_id,
          department: form.department || "",
          role: form.role,
        },
      },
    });

    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    // Prevent auto-login — sign out if a session was created
    if (data.session) {
      await supabase.auth.signOut();
    }

    setLoading(false);

    if (data.user) {
      toast.success("Account created! Please sign in to continue.");
      navigate({ to: "/login" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted/40 to-background p-4">
      <Card className="w-full max-w-lg shadow-lg my-8">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Register as a Capability Manager or Admin</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input required value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Your full name" />
              </div>
              <div className="space-y-2">
                <Label>Employee ID</Label>
                <Input required value={form.employee_id} onChange={(e) => update("employee_id", e.target.value)} placeholder="e.g. EMP001" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@company.com" />
            </div>

            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" required minLength={6} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Min. 6 characters" />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <RadioGroup value={form.role} onValueChange={(v) => update("role", v)} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="r-manager" value="manager" />
                  <Label htmlFor="r-manager" className="font-normal cursor-pointer">Capability Manager</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="r-admin" value="admin" />
                  <Label htmlFor="r-admin" className="font-normal cursor-pointer">Admin</Label>
                </div>
              </RadioGroup>
            </div>

            {!isAdmin && (
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={form.department} onValueChange={(v) => update("department", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isAdmin && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <div className="space-y-2">
                  <Label>
                    Department{" "}
                    <span className="text-xs text-muted-foreground">(optional for admins)</span>
                  </Label>
                  <Select value={form.department} onValueChange={(v) => update("department", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Admin signup code</Label>
                  <Input
                    required
                    value={form.admin_code}
                    onChange={(e) => update("admin_code", e.target.value)}
                    placeholder="Enter the secure admin code"
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">Required to register an admin account.</p>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create account
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
