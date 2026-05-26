-- Run this in the Supabase SQL editor after creating your project.
-- Then add your own authenticated user id to app_admins.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 160),
  mood text not null default '平静',
  content text not null,
  image_url text,
  image_path text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists diary_entries_set_updated_at on public.diary_entries;
create trigger diary_entries_set_updated_at
before update on public.diary_entries
for each row
execute function public.set_updated_at();

alter table public.app_admins enable row level security;
alter table public.diary_entries enable row level security;

create policy "Users can read their admin flag"
on public.app_admins
for select
to authenticated
using (user_id = auth.uid());

create policy "Public can read public entries"
on public.diary_entries
for select
using (is_public = true);

create policy "Admins can read all entries"
on public.diary_entries
for select
to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));

create policy "Admins can create entries"
on public.diary_entries
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (select 1 from public.app_admins where user_id = auth.uid())
);

create policy "Admins can update entries"
on public.diary_entries
for update
to authenticated
using (
  owner_id = auth.uid()
  and exists (select 1 from public.app_admins where user_id = auth.uid())
)
with check (
  owner_id = auth.uid()
  and exists (select 1 from public.app_admins where user_id = auth.uid())
);

create policy "Admins can delete entries"
on public.diary_entries
for delete
to authenticated
using (
  owner_id = auth.uid()
  and exists (select 1 from public.app_admins where user_id = auth.uid())
);

insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do update set public = true;

create policy "Anyone can view blog images"
on storage.objects
for select
using (bucket_id = 'blog-images');

create policy "Admins can upload blog images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'blog-images'
  and exists (select 1 from public.app_admins where user_id = auth.uid())
);

create policy "Admins can update blog images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'blog-images'
  and exists (select 1 from public.app_admins where user_id = auth.uid())
)
with check (
  bucket_id = 'blog-images'
  and exists (select 1 from public.app_admins where user_id = auth.uid())
);

create policy "Admins can delete blog images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'blog-images'
  and exists (select 1 from public.app_admins where user_id = auth.uid())
);

-- After signing in once, find your user id:
-- select id, email from auth.users order by created_at desc;
--
-- Then make that account the blog owner:
-- insert into public.app_admins (user_id) values ('YOUR_USER_ID');
