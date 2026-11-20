-- RCSU Student Union Election 2026-2027
-- Database author: Reinhardson Sangma
-- Ballot secrecy model: voter registry is separate from anonymous ballot rows.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists election_private;
revoke all on schema election_private from public, anon, authenticated;
grant usage on schema election_private to service_role;

create table if not exists election_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists election_private.settings (
  id boolean primary key default true check (id),
  election_name text not null default 'Raha College Student Union Election',
  election_year text not null default '2026-2027',
  voting_open boolean not null default false,
  results_released boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into election_private.settings(id) values (true) on conflict (id) do nothing;

create table if not exists election_private.positions (
  position_key text primary key,
  label text not null,
  sort_order integer not null unique,
  active boolean not null default true
);

insert into election_private.positions(position_key,label,sort_order) values
 ('president','President',1),
 ('vice-president','Vice President',2),
 ('general-secretary','General Secretary',3),
 ('assistant-general-secretary','Assistant General Secretary',4),
 ('games-secretary','Games Secretary',5),
 ('cultural-secretary','Cultural Secretary',6),
 ('magazine-secretary','Magazine Secretary',7),
 ('girls-common-room-secretary','Girls’ Common Room Secretary',8),
 ('boys-common-room-secretary','Boys’ Common Room Secretary',9)
on conflict (position_key) do update set label=excluded.label, sort_order=excluded.sort_order;

create table if not exists election_private.candidates (
  id uuid primary key default gen_random_uuid(),
  position_key text not null references election_private.positions(position_key),
  full_name text not null,
  photo_url text,
  group_name text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(id, position_key)
);

-- Names are transliterated from the supplied Assamese poster. The admin can edit these.
insert into election_private.candidates(id,position_key,full_name,photo_url,sort_order) values
 ('f0000000-0000-4000-8000-000000000001','president','Pallab Nath','assets/candidates/candidate-01.jpg',1),
 ('f0000000-0000-4000-8000-000000000002','vice-president','Ahikta Chahuma','assets/candidates/candidate-02.jpg',1),
 ('f0000000-0000-4000-8000-000000000003','general-secretary','Chaniya Chultana','assets/candidates/candidate-03.jpg',1),
 ('f0000000-0000-4000-8000-000000000004','cultural-secretary','Puja Das','assets/candidates/candidate-04.jpg',1),
 ('f0000000-0000-4000-8000-000000000005','magazine-secretary','Jubi Bora','assets/candidates/candidate-05.jpg',1),
 ('f0000000-0000-4000-8000-000000000006','girls-common-room-secretary','Shivani Bangthai','assets/candidates/candidate-06.jpg',1),
 ('f0000000-0000-4000-8000-000000000007','games-secretary','Animesh Bora','assets/candidates/candidate-07.jpg',1),
 ('f0000000-0000-4000-8000-000000000008','boys-common-room-secretary','Rupjyoti Gogoi','assets/candidates/candidate-08.jpg',1),
 ('f0000000-0000-4000-8000-000000000009','assistant-general-secretary','Santosh Gaonkhoya','assets/candidates/candidate-09.jpg',1)
on conflict (id) do update set position_key=excluded.position_key,full_name=excluded.full_name,photo_url=excluded.photo_url,sort_order=excluded.sort_order;

create table if not exists election_private.voters (
  id uuid primary key default gen_random_uuid(),
  source_ref text not null unique,
  full_name text not null,
  full_name_norm text not null,
  course text,
  enrollment_no text,
  mobile_no text,
  eligible boolean not null default true,
  voting_status text not null default 'not_voted'
    check (voting_status in ('not_voted','in_progress','voted')),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists voters_name_norm_idx on election_private.voters(full_name_norm);
create index if not exists voters_enrollment_idx on election_private.voters(enrollment_no) where enrollment_no is not null;
create index if not exists voters_mobile_idx on election_private.voters(mobile_no) where mobile_no is not null;

create table if not exists election_private.vote_authorizations (
  id uuid primary key default gen_random_uuid(),
  voter_id uuid not null unique references election_private.voters(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Each ballot is grouped by a random ballot_id; it is never stored with voter identity.
create table if not exists election_private.ballots (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null,
  position_key text not null references election_private.positions(position_key),
  candidate_id uuid not null,
  cast_at timestamptz not null default now(),
  foreign key(candidate_id,position_key)
    references election_private.candidates(id,position_key),
  unique(ballot_id, position_key)
);
create index if not exists ballots_candidate_idx on election_private.ballots(candidate_id);
create index if not exists ballots_ballot_idx on election_private.ballots(ballot_id);

alter table election_private.admins enable row level security;
alter table election_private.settings enable row level security;
alter table election_private.positions enable row level security;
alter table election_private.candidates enable row level security;
alter table election_private.voters enable row level security;
alter table election_private.vote_authorizations enable row level security;
alter table election_private.ballots enable row level security;

revoke all on all tables in schema election_private from public, anon, authenticated;
revoke all on all sequences in schema election_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema election_private to service_role;
alter default privileges in schema election_private grant select, insert, update, delete on tables to service_role;

-- Function: exact-match verification with safe ambiguity handling and one-use ticket.
create or replace function public.rcsu_verify_voter(
  p_identifier text,
  p_confirm_name text default null,
  p_course text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_matches integer;
  v_voter election_private.voters%rowtype;
  v_token text;
  v_hash text;
  v_identifier text := lower(regexp_replace(btrim(coalesce(p_identifier,'')), '\s+', ' ', 'g'));
  v_name text := lower(regexp_replace(btrim(coalesce(p_confirm_name,'')), '\s+', ' ', 'g'));
  v_course text := lower(btrim(coalesce(p_course,'')));
begin
  if not exists(select 1 from election_private.settings where id=true and voting_open=true) then
    return jsonb_build_object('status','paused','message','Voting is not open at this time. Please contact the election administrator.');
  end if;
  if length(v_identifier) < 2 or length(v_identifier) > 120 then
    return jsonb_build_object('status','invalid','message','Enter a valid name, enrolment number or mobile number.');
  end if;
  select count(*) into v_matches
  from election_private.voters v
  where (v.full_name_norm = v_identifier
      or v.enrollment_no = btrim(coalesce(p_identifier,''))
      or v.mobile_no = btrim(coalesce(p_identifier,'')))
    and (v_name = '' or v.full_name_norm = v_name)
    and (v_course = '' or lower(coalesce(v.course,'')) = v_course);

  if v_matches = 0 then
    return jsonb_build_object('status','not_found','message','No matching voter record found.');
  elsif v_matches > 1 then
    return jsonb_build_object('status','ambiguous','message','More than one record matches. Add the full name and course/class to verify the correct voter.');
  end if;

  select * into v_voter from election_private.voters v
  where (v.full_name_norm = v_identifier
      or v.enrollment_no = btrim(coalesce(p_identifier,''))
      or v.mobile_no = btrim(coalesce(p_identifier,'')))
    and (v_name = '' or v.full_name_norm = v_name)
    and (v_course = '' or lower(coalesce(v.course,'')) = v_course)
  limit 1;

  if not v_voter.eligible then
    return jsonb_build_object('status','ineligible','message','This voter record is not marked eligible. Please contact the election administrator.');
  end if;
  if v_voter.voting_status = 'voted' then
    return jsonb_build_object('status','already_voted','message','This voter has already cast their vote.');
  end if;

  -- Re-verification on the single controlled laptop invalidates the previous unfinished ticket.
  delete from election_private.vote_authorizations where voter_id = v_voter.id;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_hash := encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');
  insert into election_private.vote_authorizations(voter_id,token_hash,expires_at)
    values(v_voter.id,v_hash,now()+interval '30 minutes');
  update election_private.voters set voting_status='in_progress', updated_at=now() where id=v_voter.id;

  return jsonb_build_object('status','verified','voter_name',v_voter.full_name,'ticket',v_token,
    'message','Voter verified successfully. Your eligibility has been confirmed.');
end;
$$;

create or replace function public.rcsu_resume_vote(p_ticket text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_voter election_private.voters%rowtype; v_hash text;
begin
  v_hash := encode(extensions.digest(convert_to(coalesce(p_ticket,''),'UTF8'),'sha256'),'hex');
  select v.* into v_voter from election_private.vote_authorizations a
    join election_private.voters v on v.id=a.voter_id
    where a.token_hash=v_hash and a.expires_at>now() and v.voting_status='in_progress';
  if not found then return jsonb_build_object('status','expired'); end if;
  return jsonb_build_object('status','resumed','voter_name',v_voter.full_name);
end;
$$;

create or replace function public.rcsu_submit_ballot(p_ticket text,p_selections jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_voter_id uuid;
  v_open boolean;
  v_expected integer;
  v_count integer;
  v_distinct integer;
  v_ballot_id uuid := gen_random_uuid();
  v_item jsonb;
  v_position text;
  v_candidate uuid;
begin
  select voting_open into v_open from election_private.settings where id=true;
  if not coalesce(v_open,false) then raise exception 'Voting is currently paused or closed.'; end if;
  if jsonb_typeof(p_selections) <> 'array' then raise exception 'Invalid ballot format.'; end if;
  v_hash := encode(extensions.digest(convert_to(coalesce(p_ticket,''),'UTF8'),'sha256'),'hex');
  select voter_id into v_voter_id from election_private.vote_authorizations
    where token_hash=v_hash and expires_at>now() for update;
  if v_voter_id is null then raise exception 'Voting session expired. Please verify again.'; end if;
  if not exists(select 1 from election_private.voters where id=v_voter_id and eligible and voting_status='in_progress') then
    raise exception 'This voter is not eligible to submit a ballot.';
  end if;
  select count(*) into v_expected from election_private.positions where active=true;
  select count(*),count(distinct value->>'position_key') into v_count,v_distinct
    from jsonb_array_elements(p_selections) as x(value);
  if v_count <> v_expected or v_distinct <> v_expected then
    raise exception 'Select exactly one candidate for every active position.';
  end if;
  for v_item in select value from jsonb_array_elements(p_selections) loop
    v_position := v_item->>'position_key';
    begin v_candidate := (v_item->>'candidate_id')::uuid;
    exception when others then raise exception 'Invalid candidate selection.'; end;
    if not exists(
      select 1 from election_private.positions p
      join election_private.candidates c on c.position_key=p.position_key
      where p.position_key=v_position and p.active and c.id=v_candidate and c.active
    ) then raise exception 'A selected candidate is unavailable for that position.'; end if;
  end loop;

  insert into election_private.ballots(ballot_id,position_key,candidate_id)
    select v_ballot_id, value->>'position_key', (value->>'candidate_id')::uuid
    from jsonb_array_elements(p_selections);
  update election_private.voters set voting_status='voted',updated_at=now() where id=v_voter_id;
  -- Delete the temporary voter-to-ticket link in the same transaction as the anonymous ballot write.
  delete from election_private.vote_authorizations where voter_id=v_voter_id;
  return jsonb_build_object('status','recorded','message','YOUR VOTE HAS BEEN RECORDED');
end;
$$;

create or replace function public.rcsu_cancel_vote(p_ticket text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_voter_id uuid;
begin
  v_hash := encode(extensions.digest(convert_to(coalesce(p_ticket,''),'UTF8'),'sha256'),'hex');
  select voter_id into v_voter_id from election_private.vote_authorizations
    where token_hash=v_hash and expires_at>now() for update;
  if v_voter_id is null then return jsonb_build_object('status','expired'); end if;
  delete from election_private.vote_authorizations where voter_id=v_voter_id;
  update election_private.voters set voting_status='not_voted',updated_at=now() where id=v_voter_id and voting_status='in_progress';
  return jsonb_build_object('status','cancelled');
end;
$$;

create or replace function public.rcsu_admin_bootstrap()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'settings',(select to_jsonb(s) from election_private.settings s where id=true),
    'positions',(select coalesce(jsonb_agg(jsonb_build_object('position_key',p.position_key,'label',p.label,'sort_order',p.sort_order,'active',p.active) order by p.sort_order),'[]'::jsonb) from election_private.positions p where p.active),
    'candidates',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'position_key',c.position_key,'full_name',c.full_name,'photo_url',c.photo_url,'group_name',c.group_name,'active',c.active,'sort_order',c.sort_order) order by p.sort_order,c.sort_order,c.full_name),'[]'::jsonb) from election_private.candidates c join election_private.positions p on p.position_key=c.position_key)
  );
$$;

create or replace function public.rcsu_admin_dashboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_total bigint; v_eligible bigint; v_voted bigint; v_released boolean; v_results jsonb;
begin
  select count(*),count(*) filter(where eligible),count(*) filter(where eligible and voting_status='voted')
    into v_total,v_eligible,v_voted from election_private.voters;
  select results_released into v_released from election_private.settings where id=true;
  with vote_counts as (
    select p.position_key,p.label as position,c.id as candidate_id,c.full_name as candidate,
      c.photo_url,c.sort_order,coalesce(x.votes,0)::bigint as votes,p.sort_order as position_order
    from election_private.positions p
    join election_private.candidates c on c.position_key=p.position_key and c.active
    left join (select candidate_id,count(*) as votes from election_private.ballots group by candidate_id) x on x.candidate_id=c.id
    where p.active
  ), ranked as (
    select vc.*,sum(vc.votes) over(partition by vc.position_key) as position_total from vote_counts vc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'position_key',r.position_key,'position',r.position,'candidate_id',r.candidate_id,'candidate',r.candidate,
      'photo_url',r.photo_url,'votes',r.votes,
      'percentage',case when r.position_total=0 then 0 else round(100.0*r.votes/r.position_total,2) end
    ) order by r.position_order,r.sort_order,r.candidate),'[]'::jsonb)
    into v_results from ranked r;
  return jsonb_build_object('total_voters',v_total,'eligible_voters',v_eligible,'votes_cast',v_voted,
    'remaining_voters',greatest(v_eligible-v_voted,0),
    'participation',case when v_eligible=0 then 0 else round(100.0*v_voted/v_eligible,2) end,
    'results_released',coalesce(v_released,false),'results',v_results);
end;
$$;

create or replace function public.rcsu_admin_upsert_candidate(
 p_id uuid,p_position_key text,p_full_name text,p_photo_url text,p_group_name text,p_active boolean,p_sort_order integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if exists(select 1 from election_private.settings where id=true and voting_open=true)
    or exists(select 1 from election_private.ballots) then
   raise exception 'Candidate records are locked once polling is open or a ballot has been recorded. Pause and reset ballots before changing the candidate list.';
 end if;
 if p_full_name is null or length(btrim(p_full_name))<2 then raise exception 'Candidate name is required.'; end if;
 if not exists(select 1 from election_private.positions where position_key=p_position_key) then raise exception 'Unknown position.'; end if;
 if p_id is null then
   insert into election_private.candidates(position_key,full_name,photo_url,group_name,active,sort_order)
   values(p_position_key,btrim(p_full_name),nullif(btrim(p_photo_url),''),nullif(btrim(p_group_name),''),coalesce(p_active,true),coalesce(p_sort_order,0)) returning id into v_id;
 else
   update election_private.candidates set position_key=p_position_key,full_name=btrim(p_full_name),photo_url=nullif(btrim(p_photo_url),''),
    group_name=nullif(btrim(p_group_name),''),active=coalesce(p_active,true),sort_order=coalesce(p_sort_order,0)
   where id=p_id returning id into v_id;
   if v_id is null then raise exception 'Candidate not found.'; end if;
 end if;
 return jsonb_build_object('id',v_id);
end;
$$;

create or replace function public.rcsu_admin_set_settings(p_voting_open boolean,p_results_released boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if coalesce(p_results_released,false) and coalesce(p_voting_open,false) then
   raise exception 'Close voting before authorising the winner indicator.';
 end if;
 update election_private.settings set voting_open=coalesce(p_voting_open,false),
  results_released=coalesce(p_results_released,false),updated_at=now() where id=true;
 return (select to_jsonb(s) from election_private.settings s where id=true);
end;
$$;

create or replace function public.rcsu_admin_import_voters(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_inserted integer:=0; v_updated integer:=0; v_skipped integer:=0;
  v_ref text; v_name text; v_course text; v_roll text; v_mobile text; v_eligible boolean;
begin
 if jsonb_typeof(p_rows)<>'array' then raise exception 'Voter import must be a JSON array.'; end if;
 if jsonb_array_length(p_rows)>300 then raise exception 'Import batches are limited to 300 records.'; end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
   v_ref:=nullif(btrim(v_row->>'source_ref'),'');
   v_name:=nullif(btrim(v_row->>'full_name'),'');
   v_course:=nullif(btrim(v_row->>'course'),'');
   v_roll:=nullif(btrim(v_row->>'enrollment_no'),'');
   v_mobile:=nullif(btrim(v_row->>'mobile_no'),'');
   v_eligible:=coalesce((v_row->>'eligible')::boolean,true);
   if v_ref is null or v_name is null then v_skipped:=v_skipped+1; continue; end if;
   if exists(select 1 from election_private.voters where source_ref=v_ref) then
     update election_private.voters set full_name=v_name,full_name_norm=lower(regexp_replace(v_name,'\s+',' ','g')),
       course=v_course,enrollment_no=v_roll,mobile_no=v_mobile,eligible=v_eligible,updated_at=now()
     where source_ref=v_ref;
     v_updated:=v_updated+1;
   else
     insert into election_private.voters(source_ref,full_name,full_name_norm,course,enrollment_no,mobile_no,eligible)
     values(v_ref,v_name,lower(regexp_replace(v_name,'\s+',' ','g')),v_course,v_roll,v_mobile,v_eligible);
     v_inserted:=v_inserted+1;
   end if;
 end loop;
 return jsonb_build_object('inserted',v_inserted,'updated',v_updated,'skipped',v_skipped);
end;
$$;

create or replace function public.rcsu_admin_reset_election()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count bigint;
begin
 select count(distinct ballot_id) into v_count from election_private.ballots;
 delete from election_private.ballots;
 delete from election_private.vote_authorizations;
 update election_private.voters set voting_status='not_voted',updated_at=now();
 update election_private.settings set voting_open=false,results_released=false,updated_at=now() where id=true;
 return jsonb_build_object('reset',true,'previous_ballots',v_count,'voting_open',false);
end;
$$;

-- Only the service role (held by the Edge Function) may execute these privileged APIs.
revoke all on function public.rcsu_verify_voter(text,text,text) from public, anon, authenticated;
revoke all on function public.rcsu_resume_vote(text) from public, anon, authenticated;
revoke all on function public.rcsu_submit_ballot(text,jsonb) from public, anon, authenticated;
revoke all on function public.rcsu_cancel_vote(text) from public, anon, authenticated;
revoke all on function public.rcsu_admin_bootstrap() from public, anon, authenticated;
revoke all on function public.rcsu_admin_dashboard() from public, anon, authenticated;
revoke all on function public.rcsu_admin_upsert_candidate(uuid,text,text,text,text,boolean,integer) from public, anon, authenticated;
revoke all on function public.rcsu_admin_set_settings(boolean,boolean) from public, anon, authenticated;
revoke all on function public.rcsu_admin_import_voters(jsonb) from public, anon, authenticated;
revoke all on function public.rcsu_admin_reset_election() from public, anon, authenticated;
grant execute on function public.rcsu_verify_voter(text,text,text) to service_role;
grant execute on function public.rcsu_resume_vote(text) to service_role;
grant execute on function public.rcsu_submit_ballot(text,jsonb) to service_role;
grant execute on function public.rcsu_cancel_vote(text) to service_role;
grant execute on function public.rcsu_admin_bootstrap() to service_role;
grant execute on function public.rcsu_admin_dashboard() to service_role;
grant execute on function public.rcsu_admin_upsert_candidate(uuid,text,text,text,text,boolean,integer) to service_role;
grant execute on function public.rcsu_admin_set_settings(boolean,boolean) to service_role;
grant execute on function public.rcsu_admin_import_voters(jsonb) to service_role;
grant execute on function public.rcsu_admin_reset_election() to service_role;

comment on schema election_private is 'Private RCSU election data; never expose via the Supabase Data API.';
comment on table election_private.voters is 'Voter eligibility only; candidate selections are never stored here.';
comment on table election_private.ballots is 'Anonymous position-candidate selections; deliberately has no voter foreign key.';

create or replace function public.rcsu_is_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from election_private.admins a where a.user_id=p_user_id);
$$;
revoke all on function public.rcsu_is_admin(uuid) from public, anon, authenticated;
grant execute on function public.rcsu_is_admin(uuid) to service_role;
