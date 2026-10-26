// ============================================================
// 菜谱 · 单文件逻辑
// 存储：localStorage 缓存 + Supabase（配置了才启用）
// ============================================================
(() => {
  const CFG = window.APP_CONFIG || {};
  const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const BASE = CLOUD ? CFG.SUPABASE_URL.replace(/\/+$/, "") : "";
  const HEAD = CLOUD
    ? {
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      }
    : {};
  const TABLE = "dishes";
  const LS = "menu.dishes.v1";

  const app = document.getElementById("app");

  // ---------- 状态 ----------
  let dishes = [];
  let view = "list";      // list | detail | edit | settings
  let current = null;     // 当前菜谱 id
  let query = "";
  let findOpen = false;

  // ---------- 工具 ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("on"));
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("on"), 1800);
  }

  function readLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }
  function writeLocal() {
    try {
      localStorage.setItem(LS, JSON.stringify(dishes));
    } catch {}
  }

  // ---------- 云端 ----------
  async function cloudGet() {
    if (!CLOUD) return null;
    try {
      const r = await fetch(`${BASE}/rest/v1/${TABLE}?select=*&order=sort.asc,id.asc`, { headers: HEAD });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      return null;
    }
  }

  async function cloudUpsert(dish) {
    if (!CLOUD) return true;
    const payload = {
      title: dish.title,
      category: dish.category || null,
      ingredients: dish.ingredients,
      steps: dish.steps,
      sort: dish.sort || 0,
      updated_at: new Date().toISOString(),
    };
    if (dish.remoteId) payload.id = dish.remoteId;
    try {
      const r = await fetch(`${BASE}/rest/v1/${TABLE}`, {
        method: "POST",
        headers: { ...HEAD, Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(r.status);
      const out = await r.json();
      if (!dish.remoteId && out[0]?.id) {
        dish.remoteId = out[0].id;
        writeLocal();
      }
      return true;
    } catch {
      return false;
    }
  }

  async function cloudDelete(dish) {
    if (!CLOUD || !dish.remoteId) return true;
    try {
      const r = await fetch(`${BASE}/rest/v1/${TABLE}?id=eq.${dish.remoteId}`, { method: "DELETE", headers: HEAD });
      return r.ok;
    } catch {
      return false;
    }
  }

  // 本地新增的记录补传云端
  async function pushPending() {
    if (!CLOUD) return;
    const pending = dishes.filter((d) => !d.remoteId);
    for (const d of pending) await cloudUpsert(d);
  }

  async function load() {
    const local = readLocal();
    if (local.length) {
      dishes = local;
      render();
    }
    if (CLOUD) {
      const remote = await cloudGet();
      if (remote) {
        const mapped = remote.map((r) => ({
          id: `r${r.id}`,
          remoteId: r.id,
          title: r.title || "",
          category: r.category || "",
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
          steps: Array.isArray(r.steps) ? r.steps : [],
          sort: r.sort || 0,
          updatedAt: r.updated_at || "",
        }));
        // 云端为准；本地未上传的（无 remoteId）保留并补传
        const keep = dishes.filter((d) => !d.remoteId);
        dishes = [...mapped, ...keep];
        writeLocal();
        render();
        pushPending();
      } else if (!local.length) {
        render();
      }
    } else if (!local.length) {
      render();
    }
  }

  // ---------- 增删改 ----------
  function uid() {
    return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function saveDish(data, id) {
    if (id) {
      const d = dishes.find((x) => x.id === id);
      if (!d) return;
      Object.assign(d, data, { updatedAt: new Date().toISOString() });
      writeLocal();
      toast("已保存");
      if (CLOUD && !(await cloudUpsert(d))) toast("已存本地，云端同步稍后重试");
    } else {
      const d = {
        id: uid(),
        remoteId: null,
        title: data.title,
        category: data.category || "",
        ingredients: data.ingredients,
        steps: data.steps,
        sort: dishes.length,
        updatedAt: new Date().toISOString(),
      };
      dishes.push(d);
      writeLocal();
      toast(CLOUD ? "已添加" : "已添加（仅本机）");
      cloudUpsert(d);
    }
    view = "list";
    current = null;
    render();
  }

  async function deleteDish(id) {
    const d = dishes.find((x) => x.id === id);
    if (!d) return;
    if (!confirm(`删除「${d.title}」？此操作无法撤销。`)) return;
    dishes = dishes.filter((x) => x.id !== id);
    writeLocal();
    await cloudDelete(d);
    toast("已删除");
    view = "list";
    current = null;
    render();
  }

  // ---------- 渲染：列表 ----------
  function rowsOf() {
    const q = query.trim().toLowerCase();
    const list = dishes
      .slice()
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.title || "").localeCompare(b.title || "", "zh"));
    return q
      ? list.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.ingredients.join(" ").toLowerCase().includes(q) ||
            (d.category || "").toLowerCase().includes(q)
        )
      : list;
  }

  function renderList() {
    const rows = rowsOf();
    const body = rows.length
      ? rows
          .map(
            (d, i) => `<button class="row" data-id="${d.id}" style="animation-delay:${Math.min(i, 12) * 12}ms">
          <span class="num">${String(i + 1).padStart(2, "0")}</span>
          <span class="t">${esc(d.title)}</span>
          <span class="mini">${d.steps.length} 步</span>
        </button>`
          )
          .join("")
      : `<div class="empty">${query ? "没有找到" : "还没有菜谱，点右上角 + 添加"}</div>`;

    app.innerHTML = `
      <div class="top">
        <div class="top-inner">
          <h1>MENU</h1>
          <div class="acts">
            <button class="iconbtn" data-act="find" aria-label="搜索">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.7-3.7"/></svg>
            </button>
            <button class="iconbtn" data-act="settings" aria-label="设置">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a1.6 1.6 0 0 0-1.5-1H1.4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 4.6h.1A1.6 1.6 0 0 0 8 3V2.9a2 2 0 1 1 4 0V3a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 19.4 9v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/></svg>
            </button>
            <button class="iconbtn add" data-act="add" aria-label="添加">+</button>
          </div>
        </div>
        <div class="find ${findOpen ? "open" : ""}"><div><input id="q" placeholder="搜索菜名、材料" value="${esc(query)}"></div></div>
      </div>
      <div class="list">${body}</div>`;

    app.querySelectorAll(".row").forEach((b) =>
      b.addEventListener("click", () => {
        current = b.dataset.id;
        view = "detail";
        render();
      })
    );
    app.querySelector('[data-act="find"]').addEventListener("click", () => {
      findOpen = !findOpen;
      render();
      if (findOpen) app.querySelector("#q")?.focus();
    });
    app.querySelector('[data-act="add"]').addEventListener("click", () => {
      current = null;
      view = "edit";
      render();
    });
    app.querySelector('[data-act="settings"]').addEventListener("click", () => {
      view = "settings";
      render();
    });
    const q = app.querySelector("#q");
    q?.addEventListener("input", () => {
      query = q.value;
      const box = app.querySelector(".list");
      const rows = rowsOf();
      box.innerHTML = rows.length
        ? rows
            .map(
              (d, i) => `<button class="row" data-id="${d.id}">
            <span class="num">${String(i + 1).padStart(2, "0")}</span>
            <span class="t">${esc(d.title)}</span>
            <span class="mini">${d.steps.length} 步</span>
          </button>`
            )
            .join("")
        : `<div class="empty">没有找到</div>`;
      box.querySelectorAll(".row").forEach((b) =>
        b.addEventListener("click", () => {
          current = b.dataset.id;
          view = "detail";
          render();
        })
      );
    });
  }

  // ---------- 渲染：详情 ----------
  function renderDetail() {
    const d = dishes.find((x) => x.id === current);
    if (!d) {
      view = "list";
      return renderList();
    }
    app.innerHTML = `
      <div class="detail">
        <div class="bar">
          <button class="back" data-act="back"><span class="chev">‹</span>菜谱</button>
          <span style="display:flex;gap:16px">
            <button class="iconbtn" data-act="edit" aria-label="编辑">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            </button>
          </span>
        </div>
        <h2>${esc(d.title)}</h2>
        <div class="meta">${[d.category, `${d.ingredients.length} 种材料`, `${d.steps.length} 步`].filter(Boolean).join(" · ")}</div>
        <div class="sec">
          <h3>材料</h3>
          <ul class="ing">${d.ingredients.map((i) => `<li>${esc(i)}</li>`).join("") || '<li style="color:#b9b9bf">未填写</li>'}</ul>
        </div>
        <div class="rule"></div>
        <div class="sec">
          <h3>步骤</h3>
          <ol class="steps">${d.steps.map((s) => `<li>${esc(s)}</li>`).join("") || '<li style="color:#b9b9bf">未填写</li>'}</ol>
        </div>
      </div>`;
    app.querySelector('[data-act="back"]').addEventListener("click", () => {
      view = "list";
      current = null;
      render();
    });
    app.querySelector('[data-act="edit"]').addEventListener("click", () => {
      view = "edit";
      render();
    });
    window.scrollTo(0, 0);
  }

  // ---------- 渲染：编辑 ----------
  function renderEdit() {
    const d = current ? dishes.find((x) => x.id === current) : null;
    app.innerHTML = `
      <div class="edit">
        <div class="bar">
          <button class="back" data-act="cancel"><span class="chev">‹</span>取消</button>
          <button class="back" data-act="save" style="color:var(--ink);font-weight:600">保存</button>
        </div>
        <div class="field">
          <label>菜名</label>
          <input id="f-title" class="plain big" placeholder="例：番茄炒蛋" value="${esc(d?.title || "")}" autocomplete="off">
        </div>
        <div class="field">
          <label>分类（可空）</label>
          <input id="f-cat" class="plain" placeholder="例：家常菜" value="${esc(d?.category || "")}" autocomplete="off">
        </div>
        <div class="field">
          <label>材料</label>
          <textarea id="f-ing" class="plain lines" rows="6" placeholder="一行一种，例：&#10;番茄 2 个&#10;鸡蛋 3 个">${esc((d?.ingredients || []).join("\n"))}</textarea>
          <div class="hint">一行一种材料，数量写在后面就行。</div>
        </div>
        <div class="field">
          <label>步骤</label>
          <textarea id="f-step" class="plain lines" rows="7" placeholder="一行一步，不用写序号">${esc((d?.steps || []).join("\n"))}</textarea>
          <div class="hint">一行一步，序号会自动生成。</div>
        </div>
        <button class="save" data-act="save">保存</button>
        ${d ? '<button class="danger" data-act="del">删除这道菜</button>' : ""}
      </div>`;

    const grab = () => {
      const lines = (v) => v.split("\n").map((s) => s.trim()).filter(Boolean);
      return {
        title: app.querySelector("#f-title").value.trim(),
        category: app.querySelector("#f-cat").value.trim(),
        ingredients: lines(app.querySelector("#f-ing").value),
        steps: lines(app.querySelector("#f-step").value),
      };
    };

    const doSave = () => {
      const data = grab();
      if (!data.title) {
        toast("菜名不能为空");
        app.querySelector("#f-title").focus();
        return;
      }
      const dup = dishes.find((x) => x.title === data.title && x.id !== (d?.id || ""));
      if (dup && !confirm(`已有同名菜谱「${data.title}」，仍然保存？`)) return;
      saveDish(data, d?.id);
    };

    app.querySelectorAll('[data-act="save"]').forEach((b) => b.addEventListener("click", doSave));
    app.querySelector('[data-act="cancel"]').addEventListener("click", () => {
      view = d ? "detail" : "list";
      render();
    });
    app.querySelector('[data-act="del"]')?.addEventListener("click", () => deleteDish(d.id));
    if (!d) setTimeout(() => app.querySelector("#f-title")?.focus(), 60);
  }

  // ---------- 渲染：设置 ----------
  function renderSettings() {
    const n = dishes.length;
    const pendingN = dishes.filter((d) => !d.remoteId).length;
    app.innerHTML = `
      <div class="panel">
        <div class="bar">
          <button class="back" data-act="back"><span class="chev">‹</span>菜谱</button>
        </div>
        <p class="note">
          ${CLOUD
            ? "已连接云端，改动会自动同步。"
            : `当前为纯本地模式：数据只存在这台设备的浏览器里，换设备或清缓存会丢失。要开启云端，在 <code>config.js</code> 里填上 Supabase 的地址和 anon key。`}
        </p>
        <div class="rowline"><b>菜谱</b><span>${n} 道</span></div>
        <div class="rowline"><b>存储</b><span>${CLOUD ? "云端 + 本机缓存" : "仅本机"}</span></div>
        ${CLOUD ? `<div class="rowline"><b>待上传</b><span>${pendingN} 道</span></div>` : ""}
        ${CLOUD && pendingN ? '<button class="ghost" data-act="push">立即上传</button>' : ""}
        <button class="ghost" data-act="export">导出备份（JSON）</button>
        <button class="ghost" data-act="import">导入备份（JSON）</button>
        <input type="file" id="f-file" accept="application/json,.json" hidden>
      </div>`;

    app.querySelector('[data-act="back"]').addEventListener("click", () => {
      view = "list";
      render();
    });
    app.querySelector('[data-act="push"]')?.addEventListener("click", async () => {
      await pushPending();
      toast("已尝试上传");
      render();
    });
    app.querySelector('[data-act="export"]').addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(dishes, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `菜谱备份-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    const file = app.querySelector("#f-file");
    app.querySelector('[data-act="import"]').addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const list = JSON.parse(await f.text());
        if (!Array.isArray(list)) throw 0;
        let added = 0;
        for (const r of list) {
          if (!r?.title) continue;
          if (dishes.some((x) => x.title === r.title)) continue;
          const d = {
            id: uid(),
            remoteId: null,
            title: r.title,
            category: r.category || "",
            ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
            steps: Array.isArray(r.steps) ? r.steps : [],
            sort: dishes.length,
            updatedAt: new Date().toISOString(),
          };
          dishes.push(d);
          added++;
          if (CLOUD) cloudUpsert(d);
        }
        writeLocal();
        toast(`导入 ${added} 道`);
        render();
      } catch {
        toast("文件格式不对");
      }
    });
  }

  // ---------- 路由 ----------
  function render() {
    if (view === "detail") renderDetail();
    else if (view === "edit") renderEdit();
    else if (view === "settings") renderSettings();
    else renderList();
  }

  load();
})();
