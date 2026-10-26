// 设计稿公共逻辑：列表渲染 + 搜索 + 分类 + 详情
(function () {
  const ICON_SEARCH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

  const SUMMARY = (r) => r.ingredients.slice(0, 3).join("、") + (r.ingredients.length > 3 ? "…" : "");

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function renderDetail(root, recipe) {
    root.innerHTML = `
      <div class="detail">
        <button class="back">‹ 返回</button>
        <h2>${recipe.title}</h2>
        <div class="meta">${recipe.category} · ${recipe.ingredients.length} 种材料 · ${recipe.steps.length} 步</div>
        <div class="sec">
          <h3>材料</h3>
          <ul class="ing">${recipe.ingredients.map((i) => `<li>${i}</li>`).join("")}</ul>
        </div>
        <div class="rule"></div>
        <div class="sec">
          <h3>步骤</h3>
          <ol class="steps">${recipe.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
        </div>
      </div>`;
    root.querySelector(".back").addEventListener("click", () => window.__back());
    window.scrollTo(0, 0);
  }

  window.mountList = function (opts) {
    const { root, variant, categories, showSummary, showSearch } = opts;
    let q = "";
    let cat = "全部";

    const top = el(`
      <div class="top">
        <div class="top-inner">
          <h1>${variant === "c" ? "MENU" : "菜谱"}${variant === "c" ? "" : `<span class="code">${window.DEMO.length}</span>`}</h1>
        </div>
        ${showSearch ? `<div class="search-wrap"><div class="search">${ICON_SEARCH}<input placeholder="搜索菜名、材料" /></div></div>` : ""}
        ${categories ? `<div class="cats ${variant === "b" ? "underline" : ""}"></div>` : ""}
      </div>`);

    const list = el(`<div class="list ${variant === "a" ? "list-topline" : ""}"></div>`);

    function paintCats() {
      const box = top.querySelector(".cats");
      if (!box) return;
      const all = ["全部", ...window.DEMO.map((r) => r.category).filter((v, i, a) => a.indexOf(v) === i)];
      box.innerHTML = all
        .map((c) => `<button class="cat ${c === cat ? "on" : ""}" data-c="${c}">${c}</button>`)
        .join("");
      box.querySelectorAll(".cat").forEach((b) =>
        b.addEventListener("click", () => {
          cat = b.dataset.c;
          paintCats();
          paintList();
        })
      );
    }

    function paintList() {
      const rows = window.DEMO.filter(
        (r) => (cat === "全部" || r.category === cat) &&
          (!q || r.title.includes(q) || r.ingredients.join("").includes(q))
      );
      list.innerHTML = rows.length
        ? rows.map((r, i) => {
            const num = String(i + 1).padStart(2, "0");
            if (variant === "b") {
              return `<button class="row" data-id="${r.id}">
                <span class="dot"></span>
                <span class="body">
                  <span class="t">${r.title}<span class="cat-tag">${r.category}</span></span>
                  ${showSummary ? `<span class="sub">${SUMMARY(r)}</span>` : ""}
                </span></button>`;
            }
            if (variant === "c") {
              return `<button class="row" data-id="${r.id}">
                <span class="num">${num}</span>
                <span class="t">${r.title}</span>
                <span class="mini">${r.steps.length} 步</span></button>`;
            }
            return `<button class="row" data-id="${r.id}">
              <span class="t">${r.title}</span>
              ${showSummary ? `<span class="sub">${SUMMARY(r)}</span>` : ""}</button>`;
          }).join("")
        : `<div style="padding:48px 0;text-align:center;color:#b9b9bf;font-size:14px">没有找到</div>`;

      list.querySelectorAll(".row").forEach((b) =>
        b.addEventListener("click", () => {
          const r = window.DEMO.find((x) => x.id === b.dataset.id);
          root.style.display = "none";
          const d = document.createElement("div");
          document.body.appendChild(d);
          d.id = "detail";
          window.__back = () => {
            d.remove();
            root.style.display = "";
          };
          renderDetail(d, r);
        })
      );
    }

    const input = top.querySelector("input");
    if (input) {
      input.addEventListener("input", () => {
        q = input.value.trim();
        paintList();
      });
    }

    root.innerHTML = "";
    root.appendChild(top);
    root.appendChild(list);
    paintCats();
    paintList();
  };
})();
