REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_team_invite(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_invite_preview(text) TO anon, authenticated;