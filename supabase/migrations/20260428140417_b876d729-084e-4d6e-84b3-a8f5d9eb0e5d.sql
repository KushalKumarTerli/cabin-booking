
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'manager');
CREATE TYPE public.booking_status AS ENUM ('active', 'cancelled', 'overridden');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  employee_id TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Cabins
CREATE TABLE public.cabins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  floor TEXT NOT NULL,
  wing TEXT,
  capacity INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bookings
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cabin_id UUID NOT NULL REFERENCES public.cabins(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  candidate_count INTEGER NOT NULL CHECK (candidate_count > 0),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  purpose TEXT NOT NULL,
  status booking_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- Exclusion constraint preventing time overlap per cabin/date for active bookings
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.bookings
  ADD CONSTRAINT no_overlap_active EXCLUDE USING gist (
    cabin_id WITH =,
    booking_date WITH =,
    tsrange(
      (booking_date + start_time)::timestamp,
      (booking_date + end_time)::timestamp,
      '[)'
    ) WITH &&
  ) WHERE (status = 'active');

CREATE INDEX idx_bookings_cabin_date ON public.bookings(cabin_id, booking_date);
CREATE INDEX idx_bookings_user ON public.bookings(user_id);

-- Logs
CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_booking_id UUID,
  target_cabin_id UUID,
  target_user_id UUID,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_created ON public.logs(created_at DESC);

-- Security definer function for role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cabins_updated BEFORE UPDATE ON public.cabins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + role on signup using user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, employee_id, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'employee_id', NEW.id::text),
    COALESCE(NEW.raw_user_meta_data->>'department', '')
  );

  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'manager');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Booking log triggers
CREATE OR REPLACE FUNCTION public.log_booking_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.logs(action_type, performed_by, target_booking_id, target_cabin_id, remarks)
    VALUES ('booking_created', NEW.user_id, NEW.id, NEW.cabin_id,
            'Created booking for ' || NEW.booking_date || ' ' || NEW.start_time || '-' || NEW.end_time);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.logs(action_type, performed_by, target_booking_id, target_cabin_id, remarks)
    VALUES ('booking_updated', auth.uid(), NEW.id, NEW.cabin_id,
            'Status: ' || OLD.status || ' -> ' || NEW.status);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.logs(action_type, performed_by, target_booking_id, target_cabin_id, remarks)
    VALUES ('booking_deleted', auth.uid(), OLD.id, OLD.cabin_id, 'Booking deleted');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_log_bookings
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_change();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Authenticated read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins update any profile" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete profiles" ON public.profiles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Authenticated read roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- cabins
CREATE POLICY "Authenticated read cabins" ON public.cabins
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage cabins" ON public.cabins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- bookings
CREATE POLICY "Authenticated read bookings" ON public.bookings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create own bookings" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users cancel own future bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND booking_date >= CURRENT_DATE);
CREATE POLICY "Admins manage bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- logs
CREATE POLICY "Admins read logs" ON public.logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated insert logs" ON public.logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Seed cabins
INSERT INTO public.cabins (name, floor, wing, capacity) VALUES
  ('CEO Chamber', '2F', NULL, 4),
  ('Cabin-1', '2F', NULL, 2),
  ('Cabin-1', '4F', 'West', 2),
  ('Cabin-5', '4F', 'East', 2),
  ('Cabin-1', 'Ground', NULL, 2),
  ('Cabin-2', 'Ground', NULL, 2);
