-- Run this in your Supabase project: SQL Editor → New query → paste → Run

-- Habits: one row per habit
create table public.habits (
  id         text primary key,
  name       text not null,
  type       text not null default 'rating' check (type in ('rating', 'boolean')),
  created_at date not null default current_date
);

-- Migration: if the habits table already exists, run this instead:
-- alter table public.habits add column if not exists type text not null default 'rating' check (type in ('rating', 'boolean'));

-- Habit logs: one row per (habit, date) pair
create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  habit_id   text not null references public.habits(id) on delete cascade,
  stars      integer not null default 0 check (stars >= 0 and stars <= 5),
  note       text,
  created_at timestamptz not null default now(),
  unique(date, habit_id)
);

-- This is a personal single-user tool so RLS is disabled for simplicity.
-- If you ever make this multi-user, enable RLS and add policies.
alter table public.habits    disable row level security;
alter table public.habit_logs disable row level security;
