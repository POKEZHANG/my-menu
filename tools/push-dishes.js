#!/usr/bin/env node
// ============================================================
// push-dishes.js —— 把 dishes.json 里的菜谱上传到 Supabase
//
// 用法：
//   node tools/push-dishes.js                 # 上传 dishes.json
//   node tools/push-dishes.js 别的文件.json
//   node tools/push-dishes.js --check         # 只检查格式，不上传
//
// 需要的环境变量（只存在你本机，不写进仓库）：
//   SUPABASE_URL         https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY  sb_secret_...  （Supabase → Project Settings → API Keys）
//
// 逻辑：
//   按 title 去重，已存在则更新材料与步骤，不存在则新增。
//   同一份文件重复上传是安全的。
// ============================================================

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const fileArg = args.find((a) => !a.startsWith("--"));
const file = path.resolve(fileArg || "dishes.json");

const TABLE = "dishes";

function fail(msg) {
  console.error("\n✗ " + msg + "\n");
  process.exit(1);
}

function loadDishes() {
  if (!fs.existsSync(file)) {
    fail(`找不到 ${file}\n  先创建这个文件，格式见 dishes.example.json`);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(`JSON 解析失败：${e.message}\n  常见原因：多了逗号、用了中文引号、缺了引号`);
  }
  if (!Array.isArray(data)) fail("最外层必须是数组 [ {...}, {...} ]");
  return data;
}

function normalize(raw, i) {
  const where = `第 ${i + 1} 道菜`;
  if (!raw || typeof raw !== "object") fail(`${where}不是对象`);
  const title = String(raw.title || raw.菜名 || "").trim();
  if (!title) fail(`${where}缺少 title（菜名）`);

  const asList = (v) => {
    if (v == null || v === "") return [];
    if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
    // 允许用换行写成一整段
    return String(v)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const ingredients = asList(raw.ingredients ?? raw.材料);
  const steps = asList(raw.steps ?? raw.步骤);
  if (!ingredients.length) fail(`「${title}」没有材料`);
  if (!steps.length) fail(`「${title}」没有步骤`);

  // 步骤里如果自带 "1. " "1、" "第2步：" 这类序号，去掉，页面会自己编号
  const cleanSteps = steps
    .map((s) => s.replace(/^第\s*\d+\s*步?\s*[.、．)）:：]?\s*|^\d+\s*[.、．)）:：]\s*/, "").replace(/^[、，,]\s*/, "").trim())
    .filter(Boolean);

  return {
    title,
    category: String(raw.category ?? raw.分类 ?? "").trim() || null,
    ingredients,
    steps: cleanSteps,
    sort: Number.isFinite(raw.sort) ? raw.sort : i,
  };
}

async function main() {
  const raw = loadDishes();
  if (!raw.length) fail("文件里没有任何菜谱");

  const rows = [];
  const seen = new Set();
  raw.forEach((r, i) => {
    const d = normalize(r, i);
    if (seen.has(d.title)) {
      console.warn(`  ! 「${d.title}」在文件里重复出现，只保留第一份`);
      return;
    }
    seen.add(d.title);
    rows.push(d);
  });

  console.log(`\n读取 ${file}`);
  console.log(`共 ${rows.length} 道菜，材料 ${rows.reduce((n, r) => n + r.ingredients.length, 0)} 项，步骤 ${rows.reduce((n, r) => n + r.steps.length, 0)} 步`);
  rows.forEach((r) => console.log(`  · ${r.title}${r.category ? `（${r.category}）` : ""}  ${r.ingredients.length} 材料 / ${r.steps.length} 步`));

  if (checkOnly) {
    console.log("\n✓ 格式检查通过（未上传）\n");
    return;
  }

  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url) fail("没有设置环境变量 SUPABASE_URL");
  if (!key) {
    fail(
      "没有设置环境变量 SUPABASE_SECRET_KEY\n" +
        "  Windows 设置方法（只需一次，重开终端生效）：\n" +
        '    setx SUPABASE_URL "https://xxxx.supabase.co"\n' +
        '    setx SUPABASE_SECRET_KEY "sb_secret_..."'
    );
  }
  if (key.startsWith("sb_publishable") || key.split(".").length === 3) {
    fail("这看起来是公开可用的 anon key，不是 secret key。写入需要 sb_secret_ 开头的密钥。");
  }

  const res = await fetch(`${url}/rest/v1/${TABLE}?on_conflict=title`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });

  const text = await res.text();
  if (!res.ok) {
    let hint = "";
    if (res.status === 401 || res.status === 403) hint = "\n  密钥无效或没有写权限，确认用的是 secret key。";
    if (/column .* does not exist/.test(text)) hint = "\n  表结构不对，先执行 supabase-schema.sql。";
    if (/relation .* does not exist/.test(text)) hint = "\n  表还没建，先在 SQL Editor 执行 supabase-schema.sql。";
    fail(`上传失败 HTTP ${res.status}\n  ${text}${hint}`);
  }

  console.log(`\n✓ 已上传 ${rows.length} 道菜\n`);
}

main().catch((e) => fail(e.message));
