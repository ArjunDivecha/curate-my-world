-- Enable Row Level Security on event_sources table
ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;

-- Create policies for event_sources table
-- Only authenticated admin users can view event sources
CREATE POLICY "Admin users can view event sources" 
ON public.event_sources 
FOR SELECT 
USING (auth.uid() IN (
  SELECT user_id FROM public.user_roles 
  WHERE role = 'admin'
));

-- Only authenticated admin users can insert event sources
CREATE POLICY "Admin users can insert event sources" 
ON public.event_sources 
FOR INSERT 
WITH CHECK (auth.uid() IN (
  SELECT user_id FROM public.user_roles 
  WHERE role = 'admin'
));

-- Only authenticated admin users can update event sources
CREATE POLICY "Admin users can update event sources" 
ON public.event_sources 
FOR UPDATE 
USING (auth.uid() IN (
  SELECT user_id FROM public.user_roles 
  WHERE role = 'admin'
));

-- Only authenticated admin users can delete event sources
CREATE POLICY "Admin users can delete event sources" 
ON public.event_sources 
FOR DELETE 
USING (auth.uid() IN (
  SELECT user_id FROM public.user_roles 
  WHERE role = 'admin'
));

-- Create user_roles table and enum if they don't exist
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Policy for user_roles table
CREATE POLICY "Users can view their own roles" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Update events table policies to include user tracking for new events
CREATE POLICY "System can insert events" 
ON public.events 
FOR INSERT 
WITH CHECK (true);

-- Update events table to track which user requested the fetch
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS requested_by_user_id UUID;