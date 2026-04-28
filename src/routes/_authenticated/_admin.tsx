import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/AuthProvider";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin")({
  component: AdminGuard,
});

function AdminGuard() {
  const { isAdmin, loading, roles } = useAuth();
  if (loading || roles.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" />;
  return <Outlet />;
}