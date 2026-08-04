DO $$
DECLARE a uuid; b uuid; cnt int; sid uuid;
BEGIN
  SELECT id INTO a FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO b FROM auth.users ORDER BY created_at DESC LIMIT 1;
  IF a IS NULL OR b IS NULL OR a = b THEN RAISE EXCEPTION 'need two users to test'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  INSERT INTO public.team_members(owner_id, email, full_name, role, status)
  VALUES (a, 'rls-test-analyst@example.com', 'RLS Tester', 'analyst', 'invited') RETURNING id INTO sid;
  SELECT count(*) INTO cnt FROM public.team_members WHERE id = sid;
  IF cnt <> 1 THEN RAISE EXCEPTION 'FAIL: owner cannot read own seat'; END IF;

  BEGIN
    INSERT INTO public.team_members(owner_id, email, role) VALUES (b, 'spoof@example.com', 'admin');
    RAISE EXCEPTION 'FAIL: assigned a seat under another owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  SELECT count(*) INTO cnt FROM public.team_members WHERE id = sid;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FAIL: другой account can read the seat'; END IF;
  DELETE FROM public.team_members WHERE id = sid;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN RAISE EXCEPTION 'FAIL: other account released the seat'; END IF;
  SELECT count(*) INTO cnt FROM public.subscriptions;
  IF cnt > 1 THEN RAISE EXCEPTION 'FAIL: subscriptions of other accounts visible'; END IF;
  BEGIN
    UPDATE public.subscriptions SET seats = 99 WHERE user_id = b;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    IF cnt <> 0 THEN RAISE EXCEPTION 'FAIL: client self-granted seats'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  DELETE FROM public.team_members WHERE id = sid;
  RESET ROLE;
  RAISE NOTICE 'All seat/subscription access tests passed';
END $$;