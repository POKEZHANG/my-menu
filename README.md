# 菜谱

一个极简的个人菜谱本。白色主题，一行一行地列菜名，点开就是材料与步骤。

- 托管：任意静态托管（GitHub Pages / EdgeOne Pages / 自有服务器）
- 数据：**双源，可切换，默认本地**。本地读 `dishes.json`，云端读 Supabase
- 录入：不在手机上打字。菜谱由 AI 写好，本地源直接提交，云端源跑一条命令上传
- 权限：网页端两种源都**只读**，没有编辑入口

## 现在能做什么

| 操作 | 位置 |
|---|---|
| 看全部菜谱 | 打开首页，按顺序一行一条 |
| 看某道菜 | 点那一行 |
| 搜索 | 点右上角放大镜，按菜名 / 材料 / 分类查 |
| 按分类筛选 | 标题下方那排标签，和搜索可叠加 |
| 切换数据源 | 设置页 →「数据来源」两段开关 |
| 返回 | 手机左边缘右滑、系统返回键、桌面点「菜谱」 |

## 目录

```
menu/
├── index.html              # 页面骨架
├── styles.css              # 全部样式
├── app.js                  # 全部逻辑（双源加载 / 列表 / 详情 / 搜索 / 手势）
├── config.js               # 数据源开关 + Supabase 地址与 publishable key
├── dishes.json             # 本地菜谱数据（本地源读它）
├── dishes.example.json     # 格式示例，可删
├── supabase-schema.sql     # 云端建表 SQL + 只读权限（只有云端源需要）
├── tools/push-dishes.js    # 把 dishes.json 上传到 Supabase（只有云端源需要）
├── manifest.webmanifest    # 加到主屏幕用的配置
├── sw.js                   # 离线缓存
├── icon.svg
└── design/                 # 样式比样的四份样张，可删
```

## 一、两种数据源

| | 本地文件（默认） | 云端数据库 |
|---|---|---|
| 数据在 | 仓库里的 `dishes.json` | Supabase `dishes` 表 |
| 打开时的请求 | 只拉本站一个 json，**不出境** | 多一次到 Supabase 的请求 |
| 断网 | 有 service worker，能看 | 看不了 |
| 改菜谱 | 改 json → 提交 → 重新发布 | 跑脚本上传，网页不用重新发布 |
| 多设备 | 跟着网页版本走 | 各端实时一致 |
| 密钥 | 无 | publishable key（可公开） |
| 适合 | 日常看菜谱 | 想随时改、又不想动代码 |

**默认走本地**：`config.js` 里 `DATA_SOURCE: "local"`。

切换有两种方式：

1. **手机上临时切**——设置页「数据来源」点「云端数据库」，选择存在 localStorage，下次打开还记得。
2. **改默认值**——把 `config.js` 的 `DATA_SOURCE` 改成 `"cloud"`，所有设备默认走云端。

云端没配（`SUPABASE_URL` 或 key 为空）时，「云端数据库」按钮是灰的，点不动。

## 二、本地预览

```bash
cd menu
python -m http.server 8766
```

打开 `http://127.0.0.1:8766/`。直接双击 `index.html` 用 `file://` 打开不行——浏览器会拦住 `fetch` 本地 json。

## 三、部署

纯静态，把整个目录扔上去就行，没有构建步骤。

**GitHub Pages**：推到仓库后 Settings → Pages → Deploy from a branch → main / (root)。

**EdgeOne Pages**（国内访问更稳）：控制台 → Pages → 导入 Git 仓库 → 框架选「静态」→ 构建命令留空、输出目录填 `/`。

## 四、加菜

**本地源**：改 `dishes.json` → 提交 → 重新发布。就这样，没有别的步骤。

**云端源**：

```bash
cd menu
node tools/push-dishes.js --check      # 只检查格式，不上传
node tools/push-dishes.js              # 上传（按 title upsert）
```

需要先设两个环境变量（只需一次）：

```bat
setx SUPABASE_URL "https://xxxx.supabase.co"
setx SUPABASE_SECRET_KEY "sb_secret_..."
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

- `title` 必填且唯一。本地按数组顺序展示；云端同名重传会覆盖。
- `ingredients` 一项一行，数量写在名称后面，如 `"番茄 2 个"`。
- `steps` 一项一步，不用写序号，页面自己编。
- `category` 可空；分类标签由数据自动汇总，不用单独维护。
- 改完刷新页面即可，`sw.js` 是网络优先，不会吃到旧缓存。

## 五、云端建库（只有要用云端源才做）

1. https://supabase.com 新建 Free 项目。
2. 左侧 **SQL Editor** → New query → 把 `supabase-schema.sql` 整段粘进去 → Run。
3. 左侧 **Settings → API Keys** 拿三个值：Project URL、Publishable key（`sb_publishable_...`）、Secret key（`sb_secret_...`）。
4. URL 和 publishable key 填进 `config.js`；secret key 只进系统环境变量，**不进仓库、不进前端**。

## 数据模型

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | string | 菜名，唯一 |
| `category` | string | 分类，可空 |
| `ingredients` | string[] | 材料，一项一个字符串 |
| `steps` | string[] | 步骤，一项一步，不带序号 |
| `sort` | number | 可选，排序用；本地不写就按数组顺序 |

## 关于安全

- 网页端两种源都只读，源码公开也改不了菜谱。
- 云端写入用 secret key，只在本机系统环境变量里，不经过网页、不进仓库。
- 本地源没有密钥，也不向任何第三方发请求。
- 为什么不在网页里做编辑：任何能写数据库的密钥，只要放在前端就必然随网页公开，等同于匿名可写。
