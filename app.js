// ============================================================
// 菜谱 · 单文件逻辑
// 数据：双源，可在设置页切换，默认本地
//   local —— 同目录 dishes.json，纯静态，零网络请求
//   cloud —— Supabase dishes 表（config.js 里配了才可选）
// 布局：<960px 单列全屏；>=960px 左列表 + 右详情
// ============================================================
(() => {
  const CFG = window.APP_CONFIG || {};
  const CLOUD_OK = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const BASE = CLOUD_OK ? CFG.SUPABASE_URL.replace(/\/+$/, "") : "";
  const HEAD = CLOUD_OK
    ? {
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      }
    : {};
  const TABLE = "dishes";
  const DATA = "./dishes.json";
  const SRC_KEY = "menu.source";
  // config.js 里写 cloud 才算默认云端，其余一律本地
  const DEFAULT_SRC = CFG.DATA_SOURCE === "cloud" && CLOUD_OK ? "cloud" : "local";

  const app = document.getElementById("app");
  const WIDE = window.matchMedia("(min-width: 960px)");

  // ---------- 状态 ----------
  let dishes = [];
  let view = "list";      // list | detail | settings
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

  // ---------- 数据（双源） ----------
  // 网页端一律只读：本地源改 dishes.json，云端源用 tools/push-dishes.js 上传。
  function source() {
    try {
      const v = localStorage.getItem(SRC_KEY);
      if (v === "cloud") return CLOUD_OK ? "cloud" : "local";
      if (v === "local") return "local";
    } catch {}
    return DEFAULT_SRC;
  }

  function setSource(v) {
    try {
      localStorage.setItem(SRC_KEY, v);
    } catch {}
  }

  async function fromLocal() {
    const r = await fetch(DATA, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    const raw = await r.json();
    return (Array.isArray(raw) ? raw : [])
      .filter((d) => d && d.title)
      .map((d, i) => ({
        id: `d${i}`,
        title: d.title,
        category: d.category || "",
        ingredients: Array.isArray(d.ingredients) ? d.ingredients : [],
        steps: Array.isArray(d.steps) ? d.steps : [],
        sort: typeof d.sort === "number" ? d.sort : i,
      }));
  }

  async function fromCloud() {
    const r = await fetch(`${BASE}/rest/v1/${TABLE}?select=*&order=sort.asc,id.asc`, { headers: HEAD });
    if (!r.ok) throw new Error(r.status);
    const raw = await r.json();
    return (Array.isArray(raw) ? raw : []).map((r2) => ({
      id: `r${r2.id}`,
      title: r2.title || "",
      category: r2.category || "",
      ingredients: Array.isArray(r2.ingredients) ? r2.ingredients : [],
      steps: Array.isArray(r2.steps) ? r2.steps : [],
      sort: r2.sort || 0,
    }));
  }

  async function load() {
    const src = source();
    try {
      dishes = src === "cloud" ? await fromCloud() : await fromLocal();
    } catch {
      dishes = [];
      toast(src === "cloud" ? "云端读取失败" : "本地数据读取失败");
    }
    render();
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
  }

  function emptyDetailHtml() {
    return `<div class="detail blank"><div class="ph">从左边选一道菜</div></div>`;
  }

  function bindDetail(root) {
    root.querySelector('[data-act="back"]')?.addEventListener("click", back);
  }

  // ---------- 设置 ----------
  function renderSettings() {
    const { named } = catsOf();
    const src = source();
    app.innerHTML = `
      <div class="panel">
        <div class="bar">
          <button class="back" data-act="back"><span class="chev">‹</span>菜谱</button>
        </div>
        <div class="rowline"><b>菜谱</b><span>${dishes.length} 道</span></div>
        <div class="rowline"><b>分类</b><span>${named.length} 个</span></div>
        <div class="label">数据来源</div>
        <div class="seg">
          <button data-src="local" class="${src === "local" ? "on" : ""}">本地文件</button>
          <button data-src="cloud" class="${src === "cloud" ? "on" : ""}" ${CLOUD_OK ? "" : "disabled"}>云端数据库</button>
        </div>
        <p class="note">
          ${src === "local"
            ? "读同目录的 <code>dishes.json</code>，随网页一起加载，不连任何服务器，断网也能看。"
            : "读 Supabase 的 dishes 表，换设备不用重新发布网页，但每次打开多一次网络请求。"}
          ${CLOUD_OK ? "" : "云端未配置：<code>config.js</code> 里没有地址或 key。"}
        </p>
        <button class="ghost" data-act="reload">重新加载</button>
      </div>`;

    app.querySelector('[data-act="back"]').addEventListener("click", back);
    app.querySelectorAll(".seg button").forEach((b) =>
      b.addEventListener("click", async () => {
        if (b.disabled) return;
        const v = b.dataset.src;
        if (v === source()) return;
        setSource(v);
        catFilter = "";
        query = "";
        await load();
        toast(v === "cloud" ? "已切到云端" : "已切到本地");
      })
    );
    app.querySelector('[data-act="reload"]').addEventListener("click", async () => {
      await load();
      toast("已重新加载");
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
    if (view === "settings") return renderSettings();
    app.innerHTML = `<div class="shell">${listHtml()}</div>`;
    bindList(app);
  }

  function renderWide() {
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

  // ---------- 禁掉双指缩放 ----------
  // CSS 的 touch-action 在 iOS 主屏幕模式下不总是生效，这里补一道 gesture 事件拦截。
  // 只拦捏合，不碰 tap，避免影响按钮点击。
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
  );

  load();
})();
