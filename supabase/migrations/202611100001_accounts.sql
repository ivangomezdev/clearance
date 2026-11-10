begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  date_of_birth date not null check (date_of_birth <= current_date),
  plan text not null default 'free' check (length(plan) between 1 and 64),
  created_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles (lower(username));
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create policy "Read own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- Clients cannot create profiles, change plans or read another user's birth date.
-- A profile is created atomically with its Supabase Auth account.
create function public.create_account_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, date_of_birth)
  values (new.id, btrim(new.raw_user_meta_data->>'username'), (new.raw_user_meta_data->>'date_of_birth')::date);
  return new;
end;
$$;
revoke all on function public.create_account_profile() from public, anon, authenticated;
create trigger on_radar_account_created after insert on auth.users
  for each row execute procedure public.create_account_profile();

-- Public availability check returns no account data.
create function public.is_username_available(candidate text) returns boolean
language sql stable security definer set search_path = '' as $$
  select candidate ~ '^[A-Za-z0-9_]{3,24}$'
    and not exists (select 1 from public.profiles where lower(username) = lower(candidate));
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

commit;
