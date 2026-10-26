-- ============================================================
-- 菜谱 · Supabase 建表（读写分离版）
-- 在 Supabase 控制台 → SQL Editor 里整段粘贴执行。
--
-- 权限设计：
--   前端（anon key）  仅可 SELECT，页面能看、不能改
--   密钥（secret key）可增删改，只存在于你电脑的系统环境变量里
--                     绝不写进仓库，也不写进网页
-- ============================================================

create table if not exists public.dishes (
  id          bigint generated always as identity primary key,
  title       text        not null,
  category    text,
  ingredients text[]      not null default '{}',  -- 每项一行纯文本，如 "番茄 2 个"
  steps       text[]      not null default '{}',  -- 每项一个步骤，不带序号
  sort        integer     not null default 0,     -- 排序用，小的在前
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists dishes_title_key on public.dishes (title);
create index if not exists dishes_updated_idx on public.dishes (updated_at desc);

-- updated_at 自动维护
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists dishes_touch on public.dishes;
create trigger dishes_touch before update on public.dishes
  for each row execute function public.touch_updated_at();


-- ---------------- 权限 ----------------
alter table public.dishes enable row level security;

-- 清掉旧版遗留的放开策略
drop policy if exists "dishes_all_read"   on public.dishes;
drop policy if exists "dishes_all_insert" on public.dishes;
drop policy if exists "dishes_all_update" on public.dishes;
drop policy if exists "dishes_all_delete" on public.dishes;

-- 只读：任何人都能查看
drop policy if exists "dishes_public_read" on public.dishes;
create policy "dishes_public_read" on public.dishes
  for select using (true);

-- 不建 insert / update / delete 策略。
-- RLS 开启时「没有策略 = 一律拒绝」，所以 anon 与登录用户都无法写入。
-- 写入走 secret key，它绕过 RLS，不需要策略。

-- 收回 anon 的表级写权限（双保险，即使将来误加策略也写不进去）
revoke insert, update, delete, truncate on public.dishes from anon;
revoke insert, update, delete, truncate on public.dishes from authenticated;
grant  select on public.dishes to anon, authenticated;


-- ============================================================
-- 批量导入示例
-- 这份 SQL 由 tools/push-dishes.js 执行时自动生成，一般不用手写。
-- 手写时注意：字符串用单引号，内部的单引号写成两个。
-- ============================================================

-- insert into public.dishes (title, category, ingredients, steps) values
--   ('番茄炒蛋', '家常菜',
--    array['番茄 2 个', '鸡蛋 3 个', '小葱 1 根', '盐 适量'],
--    array['番茄顶部划十字，开水烫 30 秒后去皮，切块',
--          '鸡蛋打散加少许盐，热锅冷油倒入，凝固后盛出',
--          '原锅下番茄，中火炒出汁，加糖和盐',
--          '倒回鸡蛋翻炒均匀，撒葱花出锅'])
-- on conflict (title) do update set
--   category    = excluded.category,
--   ingredients = excluded.ingredients,
--   steps       = excluded.steps;
