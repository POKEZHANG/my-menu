# 菜谱

一个极简的个人菜谱本。白色主题，一行一行地列菜名，点开就是材料与步骤。

- 托管：GitHub Pages（纯静态，无构建、无外部依赖）
- 数据：Supabase 云端数据库，手机浏览器打开即用，可加到主屏幕
- 录入：不要求在手机上打字，菜谱由 AI 按模板生成 SQL 直接写进数据库

## 现在能做什么

| 操作 | 位置 |
|---|---|
| 看全部菜谱 | 打开首页，按顺序一行一条 |
| 看某道菜 | 点那一行 |
| 搜索 | 点右上角放大镜，按菜名 / 材料 / 分类查 |
| 新增 | 点右上角 `+` |
| 修改 / 删除 | 详情页右上角笔形图标 |
| 备份 | 设置页 → 导出备份（JSON） |

## 目录

```
menu/
├── index.html            # 页面骨架
├── styles.css            # 全部样式
├── app.js                # 全部逻辑（列表 / 详情 / 编辑 / 云端同步）
├── config.js             # Supabase 地址与 anon key —— 只有这里要改
├── supabase-schema.sql   # 建表 SQL + 批量导入模板
├── manifest.webmanifest  # 加到主屏幕用的配置
├── sw.js                 # 离线缓存
├── icon.svg
└── design/               # 样式比样的四份样张，可删
```

## 一、建数据库（只做一次）

1. 打开 https://supabase.com ，登录并新建一个 Free 项目。
2. 左侧 **SQL Editor** → New query → 把 `supabase-schema.sql` 里「建表」那半段整段粘进去 → Run。
3. 左侧 **Project Settings → API Keys**，复制 **Project URL** 和 **anon public** key。
4. 打开 `config.js`，把两个值填进去：

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
};
```

> `config.js` 里的 anon key 会随网页一起公开，这是 Supabase 的正常设计（它只能访问你用 RLS 放开的表）。**不要**把 `service_role` key 放进来。

## 二、托管到 GitHub Pages

```bash
cd menu
git add .
git commit -m "init"
gh repo create menu --public --source=. --push   # 或用 GitHub 网页手动建仓再 push
```

建好仓库后：**Settings → Pages → Source 选 Deploy from a branch → main / (root) → Save**。
一两分钟后访问 `https://<你的用户名>.github.io/menu/`。

> 手机上打开这个网址，Safari 点「分享 → 添加到主屏幕」，就是一个独立图标的全屏 App。
> 如果页面空白，先确认 Pages 已部署完成（仓库首页右侧会有绿色链接）。

## 三、批量导入菜谱

让 AI 按下面的格式输出 SQL，粘进 Supabase 的 SQL Editor 执行即可。`supabase-schema.sql` 末尾有可以直接抄的例子。

```sql
insert into public.dishes (title, category, ingredients, steps) values
  ('菜名', '分类',
   array['材料 1 名称 用量', '材料 2 名称 用量'],
   array['第一步的完整描述', '第二步的完整描述']);
```

三条硬规则：

1. **材料、步骤都用 `array['…', '…']`**，每个元素一个字符串。
2. **字符串内部用单引号包，内部的引号写成两个单引号**（如 `'他说''好吃'''`）。不要用双引号。
3. **不要自己编 `id`**，数据库会生成。菜名重复会报错（有唯一索引），这正好用来防重。

写不出来时，直接对 AI 说：「按 menu/supabase-schema.sql 里的格式，把下面这些菜谱写成 SQL」。

## 数据模型

一张表，五个业务字段，故意做到最少：

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | text | 菜名，唯一 |
| `category` | text | 分类，可空 |
| `ingredients` | text[] | 材料，一项一个字符串，如 `番茄 2 个` |
| `steps` | text[] | 步骤，一项一步，不带序号 |
| `sort` | integer | 排序，小的在前 |

## 关于安全

表对匿名用户开放了增删改（`anon` key 随网页公开）。这意味着知道网址的人理论上能改你的菜谱。
个人使用、网址不公开传播，这个风险可以接受。若要收紧，把 `supabase-schema.sql` 里的
insert / update / delete 三条策略删掉，改为只读 —— 但那样就必须在 Supabase 后台手动改数据。
