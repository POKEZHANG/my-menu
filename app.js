// ============================================================
// 菜谱 · 单文件逻辑
// 存储：localStorage 缓存 + Supabase（配置了才启用）
// 布局：<960px 单列全屏；>=960px 左列表 + 右详情
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
  const WIDE = window.matchMedia("(min-width: 960px)");

  // ---------- 状态 ----------
  let dishes = [];
  let view = "list";      // list | detail | edit | settings
  let current = null;     // 当前菜谱 id
  let query = "";
  let findOpen = false;
  let catFilter = "";     // "" = 全部；"__none__" = 未分类；其余为分类名
  let depth = 0;          // 浏览器历史层级，0 为列表根

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

  // ---------- 导航（history 驱动，返回键 / 右滑都走这里） ----------
  let HIST_OK = true;
  try {
    history.replaceState({ v: "list", id: null, d: 0 }, "");
  } catch {
    HIST_OK = false; // file:// 等场景降级为纯内存导航
  }

  function pushView(next, id = null) {
    view = next;
    current = id;
    if (HIST_OK) {
      depth += 1;
      history.pushState({ v: next, id, d: depth }, "");
    }
    render();
  }

  function back() {
    if (HIST_OK && depth > 0) {
      history.back();
      return;
    }
    view = "list";
    current = null;
    render();
  }

  // 回到列表根：一次弹掉所有层，不留下可回退的中间态
  function home() {
    view = "list";
    current = null;
    render();
    if (HIST_OK && depth > 0) {
      const n = depth;
      depth = 0;
      history.go(-n);
    }
  }

  function applyState(st) {
    depth = st && typeof st.d === "number" ? st.d : 0;
    view = (st && st.v) || "list";
    current = (st && st.id) || null;
    render();
  }

  window.addEventListener("popstate", () => applyState(history.state));

  // ---------- 云端（只读） ----------
  // 前端只用 anon key，数据库中只授予 SELECT。
  // 新增 / 修改 / 删除一律走本机的 tools/push-dishes.js。
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

  async function load() {
    const local = readLocal();
    if (local.length) {
      dishes = local;
      render();
    }
    if (CLOUD) {
      const remote = await cloudGet();
      if (remote) {
        dishes = remote.map((r) => ({
          id: `r${r.id}`,
          remoteId: r.id,
          title: r.title || "",
          category: r.category || "",
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
          steps: Array.isArray(r.steps) ? r.steps : [],
          sort: r.sort || 0,
          updatedAt: r.updated_at || "",
        }));
        writeLocal();
      }
    }
    render();
  }

  // ---------- 增删改（只写本机） ----------
  function uid() {
    return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function saveDish(data, id) {
    if (id) {
      const d = dishes.find((x) => x.id === id);
      if (!d) return;
      Object.assign(d, data, { updatedAt: new Date().toISOString() });
      toast("已保存（仅本机）");
    } else {
      dishes.push({
        id: uid(),
        remoteId: null,
        title: data.title,
        category: data.category || "",
        ingredients: data.ingredients,
        steps: data.steps,
        sort: dishes.length,
        updatedAt: new Date().toISOString(),
      });
      toast("已添加（仅本机）");
    }
    writeLocal();
    home();
  }

  function deleteDish(id) {
    const d = dishes.find((x) => x.id === id);
    if (!d) return;
    if (!confirm(`删除「${d.title}」？此操作无法撤销。`)) return;
    dishes = dishes.filter((x) => x.id !== id);
    writeLocal();
    toast("已删除");
    home();
  }

  // ---------- 列表 ----------
  function catsOf() {
    const set = new Set(dishes.map((d) => (d.category || "").trim()));
    return {
      named: [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, "zh")),
      hasEmpty: set.has(""),
    };
  }

  function rowsOf() {
    const q = query.trim().toLowerCase();
    let list = dishes
      .slice()
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.title || "").localeCompare(b.title || "", "zh"));
    if (catFilter === "__none__") list = list.filter((d) => !(d.category || "").trim());
    else if (catFilter) list = list.filter((d) => (d.category || "").trim() === catFilter);
    return q
      ? list.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.ingredients.join(" ").toLowerCase().includes(q) ||
            (d.category || "").toLowerCase().includes(q)
        )
      : list;
  }

  function rowsHtml(rows) {
    if (!rows.length) {
      const msg = query ? "没有找到" : catFilter ? "这个分类下还没有菜谱" : "还没有菜谱";
      return `<div class="empty">${msg}</div>`;
    }
    return rows
      .map(
        (d, i) => `<button class="row${d.id === current ? " on" : ""}" data-id="${d.id}" style="animation-delay:${Math.min(i, 12) * 12}ms">
          <span class="num">${String(i + 1).padStart(2, "0")}</span>
          <span class="t">${esc(d.title)}</span>
          <span class="mini">${d.steps.length} 步</span>
        </button>`
      )
      .join("");
  }

  function bindRows(box) {
    box.querySelectorAll(".row").forEach((b) =>
      b.addEventListener("click", () => openDish(b.dataset.id))
    );
  }

  function paintRows(root) {
    const box = root.querySelector(".list");
    box.innerHTML = rowsHtml(rowsOf());
    bindRows(box);
  }

  function catsHtml() {
    const { named, hasEmpty } = catsOf();
    if (!named.length && !hasEmpty) return "";
    const item = (val, label) =>
      `<button class="cat${catFilter === val ? " on" : ""}" data-cat="${esc(val)}">${esc(label)}</button>`;
    return `<div class="cats">${item("", "全部")}${named.map((c) => item(c, c)).join("")}${
      hasEmpty ? item("__none__", "未分类") : ""
    }</div>`;
  }

  function listHtml() {
    return `
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
            ${CLOUD ? "" : '<button class="iconbtn add" data-act="add" aria-label="添加">+</button>'}
          </div>
        </div>
        <div class="find ${findOpen ? "open" : ""}"><div><input id="q" placeholder="搜索菜名、材料" value="${esc(query)}"></div></div>
        ${catsHtml()}
      </div>
      <div class="list">${rowsHtml(rowsOf())}</div>`;
  }

  function bindList(root) {
    bindRows(root.querySelector(".list"));
    root.querySelectorAll(".cat").forEach((b) =>
      b.addEventListener("click", () => {
        if (catFilter === b.dataset.cat) return;
        catFilter = b.dataset.cat;
        root.querySelectorAll(".cat").forEach((x) => x.classList.toggle("on", x === b));
        paintRows(root);
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
    );
    root.querySelector('[data-act="find"]').addEventListener("click", () => {
      findOpen = !findOpen;
      render();
      if (findOpen) app.querySelector("#q")?.focus();
    });
    root.querySelector('[data-act="add"]')?.addEventListener("click", () => pushView("edit"));
    root.querySelector('[data-act="settings"]').addEventListener("click", () => pushView("settings"));
    const q = root.querySelector("#q");
    q?.addEventListener("input", () => {
      query = q.value;
      paintRows(root);
    });
  }

  // 点菜：宽屏已在详情里就直接换右边，不再压历史
  function openDish(id) {
    if (WIDE.matches && view === "detail") {
      current = id;
      if (HIST_OK) history.replaceState({ v: "detail", id, d: depth }, "");
      const pane = app.querySelector(".pane");
      if (pane) {
        pane.innerHTML = detailHtml(dishes.find((x) => x.id === id));
        bindDetail(pane);
        app.querySelectorAll(".row").forEach((r) => r.classList.toggle("on", r.dataset.id === id));
        return;
      }
    }
    pushView("detail", id);
  }

  // ---------- 详情 ----------
  function detailHtml(d) {
    if (!d) return "";
    return `
      <div class="detail">
        <div class="bar">
          <button class="back" data-act="back"><span class="chev">‹</span>菜谱</button>
          ${CLOUD ? "" : `<button class="back" data-act="edit" style="margin-left:auto;margin-right:0;color:var(--ink)">编辑</button>`}
        </div>
        <h2>${esc(d.title)}</h2>
        <div class="meta">${[d.category, `${d.ingredients.length} 种材料`, `${d.steps.length} 步`].filter(Boolean).join(" · ")}</div>
        ${CLOUD && !d.remoteId ? '<div class="meta" style="margin-top:6px;color:#b98a5a">这道菜还在本机，尚未上传到云端</div>' : ""}
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
  }

  function emptyDetailHtml() {
    return `<div class="detail blank"><div class="ph">从左边选一道菜</div></div>`;
  }

  function bindDetail(root) {
    root.querySelector('[data-act="back"]')?.addEventListener("click", back);
    root.querySelector('[data-act="edit"]')?.addEventListener("click", () => pushView("edit", current));
  }

  // ---------- 编辑 ----------
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
    app.querySelector('[data-act="cancel"]').addEventListener("click", back);
    app.querySelector('[data-act="del"]')?.addEventListener("click", () => deleteDish(d.id));
    if (!d) setTimeout(() => app.querySelector("#f-title")?.focus(), 60);
  }

  // ---------- 设置 ----------
  function renderSettings() {
    const n = dishes.length;
    const localN = dishes.filter((d) => !d.remoteId).length;
    app.innerHTML = `
      <div class="panel">
        <div class="bar">
          <button class="back" data-act="back"><span class="chev">‹</span>菜谱</button>
        </div>
        <p class="note">
          ${CLOUD
            ? "菜谱从云端读取，页面为只读。新增或修改请在你电脑上用 <code>tools/push-dishes.js</code> 上传。"
            : "当前未连接云端：数据只存在这台设备的浏览器里，换设备或清缓存会丢失。在 <code>config.js</code> 填上 Supabase 地址和 anon key 即可打开云端菜谱。"}
        </p>
        <div class="rowline"><b>菜谱</b><span>${n} 道</span></div>
        <div class="rowline"><b>来源</b><span>${CLOUD ? "云端同步" : "仅本机"}</span></div>
        ${localN ? `<div class="rowline"><b>仅本机</b><span>${localN} 道</span></div>` : ""}
        <button class="ghost" data-act="export">导出备份（JSON）</button>
        <button class="ghost" data-act="import">导入备份（JSON）</button>
        <input type="file" id="f-file" accept="application/json,.json" hidden>
        ${localN ? '<button class="ghost" data-act="reset" style="color:#b4443a">清除本机临时数据</button>' : ""}
      </div>`;

    app.querySelector('[data-act="back"]').addEventListener("click", back);
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
          dishes.push({
            id: uid(),
            remoteId: null,
            title: r.title,
            category: r.category || "",
            ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
            steps: Array.isArray(r.steps) ? r.steps : [],
            sort: dishes.length,
            updatedAt: new Date().toISOString(),
          });
          added++;
        }
        writeLocal();
        toast(`导入 ${added} 道（仅本机）`);
        render();
      } catch {
        toast("文件格式不对");
      }
    });
    app.querySelector('[data-act="reset"]')?.addEventListener("click", () => {
      if (!confirm("清除本机临时数据？云端菜谱不受影响，下次打开会重新拉取。")) return;
      dishes = dishes.filter((d) => d.remoteId);
      writeLocal();
      toast("已清除");
      render();
    });
  }

  // ---------- 渲染 ----------
  function render() {
    if (view === "detail" && !dishes.some((d) => d.id === current)) {
      view = "list";
      current = null;
    }
    if (WIDE.matches) renderWide();
    else renderNarrow();
  }

  function renderNarrow() {
    if (view === "detail") {
      app.innerHTML = `<div class="shell">${detailHtml(dishes.find((d) => d.id === current))}</div>`;
      bindDetail(app);
      window.scrollTo(0, 0);
      return;
    }
    if (view === "edit") return renderEdit();
    if (view === "settings") return renderSettings();
    app.innerHTML = `<div class="shell">${listHtml()}</div>`;
    bindList(app);
  }

  function renderWide() {
    if (view === "edit") return renderEdit();
    if (view === "settings") return renderSettings();
    const d = view === "detail" ? dishes.find((x) => x.id === current) : null;
    app.innerHTML = `<div class="shell wide">
      <aside class="rail">${listHtml()}</aside>
      <main class="pane">${d ? detailHtml(d) : emptyDetailHtml()}</main>
    </div>`;
    bindList(app.querySelector(".rail"));
    if (d) bindDetail(app.querySelector(".pane"));
  }

  // ---------- 手势：右滑返回 ----------
  // iOS 添加到主屏幕后没有系统级返回手势，必须自己接。
  const EDGE = 52;     // 从左边缘多少像素内起手才算
  const TRIGGER = 76;  // 右滑超过多少像素触发返回
  let sx = 0, sy = 0, dragging = false, locked = false;

  const resetDrag = () => {
    dragging = false;
    app.style.transition = "transform .22s cubic-bezier(.2,.7,.3,1), opacity .22s";
    app.style.transform = "";
    app.style.opacity = "";
  };

  document.addEventListener(
    "touchstart",
    (e) => {
      dragging = false;
      locked = false;
      if (WIDE.matches || depth === 0 || view === "list") return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      sx = t.clientX;
      sy = t.clientY;
      dragging = true;
      app.style.transition = "none";
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (!locked) {
        if (Math.abs(dy) > Math.abs(dx) + 4) {
          resetDrag(); // 纵向滚动优先，别抢
          return;
        }
        if (Math.abs(dx) > 6) locked = true;
      }
      if (dx <= 0) {
        app.style.transform = "";
        return;
      }
      app.style.transform = `translateX(${Math.min(dx, 340)}px)`;
      app.style.opacity = String(Math.max(0.55, 1 - dx / 820));
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - sx;
      resetDrag();
      if (dx > TRIGGER) back();
    },
    { passive: true }
  );

  document.addEventListener("touchcancel", () => {
    if (dragging) resetDrag();
  }, { passive: true });

  // 断点变化时重排：手机竖屏切到平板横屏不该还停在单列
  if (WIDE.addEventListener) WIDE.addEventListener("change", () => render());
  else if (WIDE.addListener) WIDE.addListener(() => render());

  load();
})();
