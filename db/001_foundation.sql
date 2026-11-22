create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('teacher','student')),
  created_at timestamptz not null default now()
);
create table if not exists public.teacher_accounts (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  salt text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.app_sessions (
  token_hash text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists app_sessions_expiry on public.app_sessions(expires_at);
create table if not exists public.teacher_login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists teacher_login_attempts_email on public.teacher_login_attempts(email,attempted_at desc);
create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references public.app_users(id),
  code_hash text not null unique,
  code_display text not null,
  code_expires_at timestamptz not null default now()+interval '24 hours',
  projection_hash text not null unique,
  name text not null check(char_length(name) between 3 and 80),
  version bigint not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists game_rooms_teacher on public.game_rooms(teacher_user_id, created_at desc);
create table if not exists public.game_presence (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key(room_id,user_id)
);
create table if not exists public.game_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists game_join_attempts_user on public.game_join_attempts(user_id,attempted_at desc);
create table if not exists public.game_requests (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  request_id uuid not null,
  actor_user_id uuid,
  action text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(room_id,request_id)
);
create table if not exists public.game_audit (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists game_audit_room on public.game_audit(room_id,id);
create table if not exists public.financial_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  team_id uuid not null,
  action text not null,
  amount_signed integer not null,
  balance_after integer not null check(balance_after>=0),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(room_id,request_id,action,team_id)
);
create index if not exists financial_events_team on public.financial_events(team_id,id);

create or replace function public.commit_game_room(
  p_room_id uuid, p_expected_version bigint, p_request_id uuid,
  p_actor uuid, p_action text, p_new_data jsonb, p_response jsonb,
  p_audit jsonb default '{}'::jsonb,
  p_financial jsonb default '[]'::jsonb
) returns jsonb language plpgsql as $$
declare v_room public.game_rooms%rowtype; v_existing jsonb; v_existing_actor uuid; v_item jsonb;
begin
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then return jsonb_build_object('ok',false,'code','ROOM_NOT_FOUND'); end if;
  select response,actor_user_id into v_existing,v_existing_actor from public.game_requests where room_id=p_room_id and request_id=p_request_id;
  if found then
    if v_existing_actor is distinct from p_actor then return jsonb_build_object('ok',false,'code','NOT_AUTHORIZED'); end if;
    return v_existing;
  end if;
  if v_room.version<>p_expected_version then
    return jsonb_build_object('ok',false,'code','CONFLICT_RELOAD_REQUIRED','current_version',v_room.version);
  end if;
  update public.game_rooms set data=p_new_data,version=version+1,
    closed_at=case when p_new_data->>'phase'='CLOSED' then coalesce(closed_at,now()) else closed_at end
    where id=p_room_id;
  insert into public.game_requests(room_id,request_id,actor_user_id,action,response)
    values(p_room_id,p_request_id,p_actor,p_action,p_response || jsonb_build_object('current_version',v_room.version+1));
  insert into public.game_audit(room_id,actor_user_id,action,details)
    values(p_room_id,p_actor,p_action,p_audit);
  for v_item in select * from jsonb_array_elements(p_financial) loop
    insert into public.financial_events(room_id,team_id,action,amount_signed,balance_after,request_id)
      values(p_room_id,(v_item->>'team_id')::uuid,v_item->>'action',(v_item->>'amount')::integer,
        (v_item->>'balance')::integer,p_request_id);
  end loop;
  return p_response || jsonb_build_object('current_version',v_room.version+1);
end $$;

create or replace function public.rotate_game_access(
  p_room_id uuid,p_teacher uuid,p_kind text,p_new_hash text,p_new_display text default null
) returns boolean language plpgsql as $$
declare v_teacher uuid;
begin
  select teacher_user_id into v_teacher from public.game_rooms where id=p_room_id for update;
  if v_teacher is distinct from p_teacher then return false; end if;
  if p_kind='code' then
    update public.game_rooms set code_hash=p_new_hash,code_display=p_new_display,
      code_expires_at=now()+interval '24 hours' where id=p_room_id;
  elsif p_kind='projection' then
    update public.game_rooms set projection_hash=p_new_hash where id=p_room_id;
  else return false;
  end if;
  insert into public.game_audit(room_id,actor_user_id,action,details)
    values(p_room_id,p_teacher,'access.rotated',jsonb_build_object('kind',p_kind));
  return true;
end $$;
