# 菜谱

一个极简的个人菜谱本。白色主题，一行一行地列菜名，点开就是材料与步骤。

- 托管：GitHub Pages（纯静态，无构建、无外部依赖）
- 数据：Supabase 云端数据库，手机浏览器打开即用，可加到主屏幕
- 录入：不在手机上打字。菜谱由 AI 写进 `dishes.json`，一条命令上传
- 权限：**前端只读，写入只在你电脑上做**。网页源码被人拿到也改不了菜谱

## 现在能做什么

| 操作 | 位置 |
|---|---|
| 看全部菜谱 | 打开首页，按顺序一行一条 |
| 看某道菜 | 点那一行 |
| 搜索 | 点右上角放大镜，按菜名 / 材料 / 分类查 |
| 新增 / 修改菜谱 | 不在网页上做，见「三、上传菜谱」 |
| 备份 | 设置页 → 导出备份（JSON） |

## 目录

```
menu/
├── index.html              # 页面骨架
├── styles.css              # 全部样式
├── app.js                  # 全部逻辑（列表 / 详情 / 搜索 / 读取云端）
├── config.js               # Supabase 地址与 anon key —— 只有这里要改
├── supabase-schema.sql     # 建表 SQL + 权限
├── dishes.json             # 你的菜谱，AI 写这个文件
├── dishes.example.json     # 格式示例，可删
├── tools/push-dishes.js    # 把 dishes.json 上传到 Supabase
├── manifest.webmanifest    # 加到主屏幕用的配置
├── sw.js                   # 离线缓存
├── icon.svg
└── design/                 # 样式比样的四份样张，可删
```

## 一、建数据库（只做一次）

1. 打开 https://supabase.com ，登录并新建一个 Free 项目。
2. 左侧 **SQL Editor** → New query → 把 `supabase-schema.sql` 整段粘进去 → Run。
3. 左侧 **Project Settings → API Keys**，拿到三个值：
   - **Project URL**，形如 `https://xxxx.supabase.co`
   - **anon public**（`sb_publishable_...`）—— 给网页用，可以公开
   - **secret**（`sb_secret_...`）—— 给你电脑上传用，**绝不写进 config.js，绝不提交到 GitHub**

4. 打开 `config.js`，只填 URL 和 anon key：

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_...",
};
```

5. 把上传用的两个值写进系统环境变量（Windows，只需一次，重开终端生效）：

```bat
setx SUPABASE_URL "https://xxxx.supabase.co"
setx SUPABASE_SECRET_KEY "sb_secret_..."
```

## 二、托管到 GitHub Pages

```bash
cd menu
git add .
git commit -m "init"
# 先在 GitHub 网页建一个空仓库 menu，然后：
git remote add origin https://github.com/<你的用户名>/menu.git
git push -u origin main
```

建好仓库后：**Settings → Pages → Source 选 Deploy from a branch → main / (root) → Save**。
一两分钟后访问 `https://<你的用户名>.github.io/menu/`。

> 手机上打开这个网址，Safari 点「分享 → 添加到主屏幕」，就是一个独立图标的全屏 App。
> 如果页面空白，先确认 Pages 已部署完成（仓库首页右侧会有绿色链接）。

## 三、上传菜谱

最省事的方式：直接对我说「把这几道菜加进菜单」，附上菜名或做法。我会按格式写好 `dishes.json`、检查、上传。

自己动手也可以：

```bash
cd menu
node tools/push-dishes.js --check      # 只检查格式，不上传
node tools/push-dishes.js              # 上传
```

`dishes.json` 格式（最外层数组，一道菜一个对象）：

```json
[
  {
    "title": "番茄炒蛋",
    "category": "家常菜",
    "ingredients": ["番茄 2 个", "鸡蛋 3 个", "盐 适量"],
    "steps": ["番茄切块", "鸡蛋炒散盛出", "番茄炒出汁后倒回鸡蛋"]
  }
]
```

规则：

- `title` 唯一。**同名重传会覆盖**——所以改菜谱就是重新上传同名那条，不用先删。
- `ingredients` 一项一行，数量写在名称后面，如 `"番茄 2 个"`。
- `steps` 一项一步，不用写序号，页面自己编。AI 若写了「1.」开头也会被自动去掉。
- `category` 可空。
- 中文键名（`菜名` / `材料` / `步骤`）也认，但建议统一英文键。

脚本会先打印清单再上传，出错时给中文提示，不会半途写坏数据。

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

读写分离：

- 网页里只有 anon key；数据库对 anon / authenticated 只 `grant select`，RLS 也没有写策略。任何人拿到网页源码都只能读。
- 写入用 secret key，它只在你电脑的系统环境变量里，不经过网页、不进仓库。
- 为什么不在网页里做编辑：任何能写数据库的密钥，只要放在前端就必然随网页公开，等同于匿名可写。所以写入只能离开浏览器。

如果哪天想在手机上随时改，只能退回「anon 可写」——安全性等同于「网址不公开」，不推荐。
