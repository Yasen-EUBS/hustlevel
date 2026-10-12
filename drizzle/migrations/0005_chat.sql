ALTER TABLE public.profiles ADD COLUMN share_workouts boolean NOT NULL DEFAULT true;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('group','dm')),
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON public.conversation_members(user_id);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  media_path text,
  media_type text CHECK (media_type IN ('image','video')),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','workout')),
  workout_session_id uuid REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_created_idx ON public.messages(conversation_id, created_at DESC);
CREATE UNIQUE INDEX messages_one_workout_post ON public.messages(workout_session_id) WHERE workout_session_id IS NOT NULL;
CREATE TABLE public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  emoji text NOT NULL CHECK (emoji IN ('🔥','💪','😂','👏','❤️')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT ON public.conversation_members TO authenticated;
GRANT UPDATE (last_read_at) ON public.conversation_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.conversations, public.conversation_members, public.messages, public.message_reactions TO service_role;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_member(_conversation_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = _conversation_id AND user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.can_see_message(_message_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.messages m JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
                 WHERE m.id = _message_id AND cm.user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.is_member_path(_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.is_member(split_part(_path, '/', 1)::uuid);
EXCEPTION WHEN others THEN RETURN false;
END $$;

CREATE POLICY "members read conversation" ON public.conversations FOR SELECT TO authenticated USING (public.is_member(id));
CREATE POLICY "members read members" ON public.conversation_members FOR SELECT TO authenticated USING (public.is_member(conversation_id));
CREATE POLICY "update own read marker" ON public.conversation_members FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "members read messages" ON public.messages FOR SELECT TO authenticated USING (public.is_member(conversation_id));
CREATE POLICY "members send as self" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND public.is_member(conversation_id)
  AND (media_path IS NULL OR split_part(media_path, '/', 1) = conversation_id::text)
  AND (workout_session_id IS NULL OR EXISTS (SELECT 1 FROM public.workout_sessions ws WHERE ws.id = workout_session_id AND ws.user_id = auth.uid()))
);
CREATE POLICY "delete own messages" ON public.messages FOR DELETE TO authenticated USING (sender_id = auth.uid());
CREATE POLICY "members read reactions" ON public.message_reactions FOR SELECT TO authenticated USING (public.can_see_message(message_id));
CREATE POLICY "react as self" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.can_see_message(message_id));
CREATE POLICY "remove own reaction" ON public.message_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_or_create_dm(other_user_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); cid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF other_user_id IS NULL OR other_user_id = me THEN RAISE EXCEPTION 'Pick another person'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = other_user_id) THEN RAISE EXCEPTION 'User not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(least(me::text, other_user_id::text) || greatest(me::text, other_user_id::text)));
  SELECT c.id INTO cid FROM public.conversations c
   WHERE c.type = 'dm'
     AND EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = c.id AND user_id = me)
     AND EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = c.id AND user_id = other_user_id)
   LIMIT 1;
  IF cid IS NULL THEN
    INSERT INTO public.conversations (type) VALUES ('dm') RETURNING id INTO cid;
    INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (cid, me), (cid, other_user_id);
  END IF;
  RETURN cid;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_or_create_dm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_conversations()
RETURNS TABLE (id uuid, type text, name text, other_user_id uuid, other_name text, last_body text, last_kind text, last_media_type text, last_sender uuid, last_at timestamptz, unread int)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.id, c.type, c.name, o.user_id, p.display_name, lm.body, lm.kind, lm.media_type, lm.sender_id,
         COALESCE(lm.created_at, c.created_at),
         (SELECT count(*)::int FROM public.messages m WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid() AND m.created_at > me.last_read_at)
  FROM public.conversation_members me
  JOIN public.conversations c ON c.id = me.conversation_id
  LEFT JOIN LATERAL (SELECT x.user_id FROM public.conversation_members x WHERE x.conversation_id = c.id AND x.user_id <> auth.uid() LIMIT 1) o ON c.type = 'dm'
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN LATERAL (SELECT m.body, m.kind, m.media_type, m.sender_id, m.created_at FROM public.messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) lm ON true
  WHERE me.user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.my_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_conversations() TO authenticated;

INSERT INTO public.conversations (id, type, name) VALUES ('11111111-1111-4111-8111-111111111111', 'group', 'NSS Squad');
INSERT INTO public.conversation_members (conversation_id, user_id) SELECT '11111111-1111-4111-8111-111111111111', id FROM public.profiles ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''));
  INSERT INTO public.conversation_members (conversation_id, user_id)
    SELECT c.id, NEW.id FROM public.conversations c WHERE c.type = 'group' ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

CREATE POLICY "chat members read media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-media' AND public.is_member_path(name));
CREATE POLICY "chat members upload media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media' AND public.is_member_path(name));
CREATE POLICY "chat delete own media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat-media' AND owner = auth.uid());