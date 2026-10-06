CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''));
  RETURN NEW;
END $$;