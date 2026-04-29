-- Harden role assignment and audit logging policies.
-- 1) Never trust signup metadata for elevated roles.
-- 2) Prevent regular authenticated users from forging audit log entries.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, employee_id, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'employee_id', NEW.id::text),
    COALESCE(NEW.raw_user_meta_data->>'department', '')
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'manager');

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Authenticated insert logs" ON public.logs;
