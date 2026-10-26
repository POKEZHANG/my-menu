-- ============================================================
-- 菜谱 · Supabase 建表
-- 在 Supabase 控制台 → SQL Editor 里整段粘贴执行。
-- 设计为「单人使用、匿名可读写」，不引入登录体系。
-- ============================================================

create table if not exists public.dishes (
  id          bigint generated always as identity primary key,
  title       text        not null,
  category    text,
  ingredients text[]      not null default '{}',  -- 每项一行纯文本，如 "番茄 2 个"
  steps       text[]      not null default '{}',  -- 每项一个步骤，不带序号
  sort        integer     not null default 0,     -- 手动排序用，小的在前
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

-- 行级安全：开启但放开匿名读写（anon key 可见即可用）
alter table public.dishes enable row level security;

drop policy if exists "dishes_all_read"   on public.dishes;
create policy "dishes_all_read"   on public.dishes for select using (true);

drop policy if exists "dishes_all_insert" on public.dishes;
create policy "dishes_all_insert" on public.dishes for insert with check (true);

drop policy if exists "dishes_all_update" on public.dishes;
create policy "dishes_all_update" on public.dishes for update using (true) with check (true);

drop policy if exists "dishes_all_delete" on public.dishes;
create policy "dishes_all_delete" on public.dishes for delete using (true);


-- ============================================================
-- 批量导入模板
-- 结构固定为三列：菜名 / 材料 / 步骤。
-- 材料、步骤是数组，元素之间用 "~" 分隔（不用逗号，避免和材料里的逗号打架）。
-- 复制下面这段，把内容换成你的菜谱即可。
-- ============================================================

-- insert into public.dishes (title, category, ingredients, steps) values
--   ('番茄炒蛋', '家常菜',
--    array['番茄 2 个', '鸡蛋 3 个', '小葱 1 根', '盐 适量', '糖 半勺', '食用油 2 勺'],
--    array['番茄顶部划十字，开水烫 30 秒后去皮，切块',
--          '鸡蛋打散加少许盐，热锅冷油倒入，凝固后盛出',
--          '原锅下番茄，中火炒出汁，加糖和盐',
--          '倒回鸡蛋翻炒均匀，撒葱花出锅']),
--   ('可乐鸡翅', '家常菜',
--    array['鸡中翅 10 个', '可乐 330ml', '姜 3 片', '生抽 2 勺', '老抽 半勺', '料酒 1 勺'],
--    array['鸡翅两面划刀，冷水下锅焯 3 分钟',
--          '锅中少油，鸡翅两面煎至金黄',
--          '倒入生抽老抽翻匀，再倒可乐没过鸡翅',
--          '中小火 15 分钟后大火收汁']);
