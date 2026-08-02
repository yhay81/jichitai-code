const DATA_URL = "/data/index.json";
const OFFICIAL_URL = "https://www.soumu.go.jp/denshijiti/code.html";
const STORAGE_KEY = "jichitai-code:saved:v1";
const SESSION_KEY = "jichitai-code:session:v1";
const PAGE_SIZE = 40;
const TYPE_NAMES = {
  prefecture: "都道府県",
  designated_city: "政令指定都市",
  city: "市",
  special_ward: "特別区",
  town: "町",
  village: "村",
  designated_ward: "政令市の区",
};

const byId = (id) => document.getElementById(id);
const searchInput = byId("municipality-search");
if (searchInput) initialize().catch(showFatalError);

async function initialize() {
  const data = await fetch(DATA_URL, { headers: { accept: "application/json" } }).then(
    (response) => {
      if (!response.ok) throw new Error("data_unavailable");
      return response.json();
    },
  );
  const state = {
    byCode: new Map(data.items.map((item) => [item.c, item])),
    items: data.items,
    limit: PAGE_SIZE,
    prefecture: "",
    query: "",
    saved: readSaved()
      .filter((code) => data.items.some((item) => item.c === code))
      .slice(0, 8),
    type: "all",
  };

  byId("data-status").textContent = `${data.counts.total.toLocaleString("ja-JP")}コードを収録`;
  bindSearch(state);
  bindTypeFilters(state);
  bindPrefectures(state);
  bindSavedActions(state);
  byId("load-more").addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    renderResults(state);
  });
  renderSaved(state);
  renderResults(state);
  if (state.saved.length) emit("returned");
  if (!sessionStorage.getItem("jichitai-code:visited")) {
    sessionStorage.setItem("jichitai-code:visited", "1");
    emit("visited");
  }
}

function bindSearch(state) {
  let timer;
  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    state.limit = PAGE_SIZE;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const query = normalize(state.query);
      if (query) emitOnceForQuery(query, filterItems(state).length ? "searched" : "no_result");
    }, 650);
    renderResults(state);
  });
  byId("clear-search").addEventListener("click", () => {
    searchInput.value = "";
    state.query = "";
    state.limit = PAGE_SIZE;
    searchInput.focus();
    renderResults(state);
  });
}

function bindTypeFilters(state) {
  document.querySelectorAll("[data-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.type = button.dataset.type;
      state.limit = PAGE_SIZE;
      document.querySelectorAll("[data-type]").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
      emit("type_changed");
      renderResults(state);
    });
  });
}

function bindPrefectures(state) {
  const clear = byId("clear-prefecture");
  document.querySelectorAll("[data-prefecture]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.prefecture;
      state.prefecture = state.prefecture === next ? "" : next;
      state.limit = PAGE_SIZE;
      document.querySelectorAll("[data-prefecture]").forEach((candidate) => {
        candidate.setAttribute(
          "aria-pressed",
          String(candidate.dataset.prefecture === state.prefecture),
        );
      });
      clear.hidden = !state.prefecture;
      if (state.prefecture) emit("prefecture_selected");
      renderResults(state);
      byId("result-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  clear.addEventListener("click", () => {
    state.prefecture = "";
    state.limit = PAGE_SIZE;
    clear.hidden = true;
    document
      .querySelectorAll("[data-prefecture]")
      .forEach((button) => button.setAttribute("aria-pressed", "false"));
    renderResults(state);
  });
}

function bindSavedActions(state) {
  byId("clear-saved").addEventListener("click", () => {
    state.saved = [];
    persistSaved(state.saved);
    renderSaved(state);
    renderResults(state);
  });
  byId("copy-saved").addEventListener("click", async () => {
    const lines = state.saved.map((code) => {
      const item = state.byCode.get(code);
      return `${item.p}\t${item.n}\t${item.c}\t${item.s}`;
    });
    await copyText(
      ["都道府県\t団体名\t6桁コード\t5桁コード", ...lines].join("\n"),
      byId("copy-saved"),
    );
  });
}

function renderResults(state) {
  const query = normalize(state.query);
  const filtered = filterItems(state);
  const visible = filtered.slice(0, state.limit);
  const list = byId("municipality-list");
  list.replaceChildren(...visible.map((item) => municipalityCard(item, state)));
  if (!visible.length) list.append(emptyResult(state));

  byId("result-count").textContent = `${filtered.length.toLocaleString("ja-JP")}件`;
  const context = [
    state.prefecture,
    state.type === "all" ? "" : typeFilterName(state.type),
    query ? `「${state.query.trim()}」` : "",
  ].filter(Boolean);
  byId("search-status").textContent = context.length
    ? `${context.join("・")}で ${filtered.length.toLocaleString("ja-JP")}件`
    : `全国 ${filtered.length.toLocaleString("ja-JP")}件`;
  const more = byId("load-more");
  more.hidden = visible.length >= filtered.length;
  more.textContent = `次の${Math.min(PAGE_SIZE, filtered.length - visible.length)}件を見る`;
}

function filterItems(state) {
  const tokens = normalize(state.query).split(/\s+/u).filter(Boolean);
  return state.items.filter((item) => {
    if (state.prefecture && item.p !== state.prefecture) return false;
    if (!matchesType(item.t, state.type)) return false;
    if (!tokens.length) return true;
    const haystack = normalize(`${item.n} ${item.p} ${item.k} ${item.pk} ${item.c} ${item.s}`);
    return tokens.every((token) => haystack.includes(token));
  });
}

function municipalityCard(item, state) {
  const article = element("article", "municipality-card");
  const heading = element("header", "municipality-heading");
  const plate = element("div", "result-code-plate");
  const mainCode = element("code", "code-main", item.s);
  const divider = element("i", "code-divider");
  const check = element("code", "code-check", item.c.slice(5));
  check.title = "検査数字";
  plate.append(mainCode, divider, check);
  heading.append(plate, element("span", "type-badge", TYPE_NAMES[item.t]));
  article.append(heading);

  const title = element("h3", "", item.n);
  const location = item.t === "prefecture" ? "都道府県コード" : item.p;
  const parent = item.r ? state.byCode.get(item.r) : null;
  const detail = element(
    "p",
    "municipality-location",
    parent ? `${location} / ${parent.n}` : location,
  );
  const kana = element("p", "municipality-kana", item.k || item.pk);
  article.append(title, detail, kana);
  if (item.u) article.append(element("p", "territory-note", "北方領土の自治体 — 公式表どおり収録"));

  const actions = element("div", "card-actions");
  const copySix = button("6桁をコピー", "copy-button", () => copyText(item.c, copySix));
  const copyFive = button("5桁をコピー", "copy-button secondary", () => copyText(item.s, copyFive));
  const saved = state.saved.includes(item.c);
  const save = button(
    saved ? "束から外す" : "束へ",
    `save-button${saved ? " is-saved" : ""}`,
    () => {
      if (state.saved.includes(item.c)) state.saved = state.saved.filter((code) => code !== item.c);
      else if (state.saved.length >= 8) return flashButton(save, "8件までです");
      else {
        state.saved.push(item.c);
        emit("saved");
      }
      persistSaved(state.saved);
      renderSaved(state);
      renderResults(state);
    },
  );
  const official = element("a", "official-link", "公式一覧");
  official.href = OFFICIAL_URL;
  official.rel = "noopener noreferrer";
  official.target = "_blank";
  official.addEventListener("click", () => emit("official_opened"));
  actions.append(copySix, copyFive, save, official);
  article.append(actions);
  return article;
}

function emptyResult(state) {
  const box = element("div", "empty-result");
  box.append(element("b", "", "一致する自治体がありません"));
  box.append(
    element("p", "", "末尾の「市・区・町・村」を外すか、都道府県と団体種別を戻してみてください。"),
  );
  const reset = button("条件をすべて戻す", "reset-button", () => {
    state.query = "";
    state.prefecture = "";
    state.type = "all";
    state.limit = PAGE_SIZE;
    searchInput.value = "";
    byId("clear-prefecture").hidden = true;
    document
      .querySelectorAll("[data-prefecture]")
      .forEach((candidate) => candidate.setAttribute("aria-pressed", "false"));
    document
      .querySelectorAll("[data-type]")
      .forEach((candidate) =>
        candidate.setAttribute("aria-pressed", String(candidate.dataset.type === "all")),
      );
    renderResults(state);
  });
  box.append(reset);
  return box;
}

function renderSaved(state) {
  const holder = byId("saved-items");
  const items = state.saved.map((code) => state.byCode.get(code)).filter(Boolean);
  if (!items.length)
    holder.replaceChildren(
      element("p", "empty-tray", "コード札の「束へ」を押すと、最大8件をこの端末に残せます。"),
    );
  else
    holder.replaceChildren(
      ...items.map((item) => {
        const row = element("div", "saved-row");
        const text = element("span");
        text.append(element("strong", "", item.n), element("small", "", `${item.p} / ${item.c}`));
        const remove = button("外す", "remove-saved", () => {
          state.saved = state.saved.filter((code) => code !== item.c);
          persistSaved(state.saved);
          renderSaved(state);
          renderResults(state);
        });
        row.append(text, remove);
        return row;
      }),
    );
  byId("saved-count").textContent = `${items.length} / 8`;
  byId("copy-saved").disabled = !items.length;
  byId("clear-saved").disabled = !items.length;
}

function matchesType(itemType, filter) {
  if (filter === "all") return true;
  if (filter === "city") return itemType === "city" || itemType === "designated_city";
  if (filter === "ward") return itemType === "special_ward" || itemType === "designated_ward";
  if (filter === "town_village") return itemType === "town" || itemType === "village";
  return itemType === filter;
}

function typeFilterName(type) {
  return { prefecture: "都道府県", city: "市", ward: "区", town_village: "町・村" }[type] || "";
}

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[‐‑‒–—―ーｰ\s]/gu, " ")
    .trim();
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label, className, action) {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

async function copyText(value, control) {
  try {
    await navigator.clipboard.writeText(value);
    emit("copied");
    flashButton(control, "コピーしました");
  } catch {
    flashButton(control, "コピーできません");
  }
}

function flashButton(control, label) {
  const original = control.textContent;
  control.textContent = label;
  setTimeout(() => {
    control.textContent = original;
  }, 1200);
}

function readSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function persistSaved(saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 8)));
  } catch {
    /* storage may be disabled */
  }
}

const emittedQueries = new Set();
function emitOnceForQuery(query, eventName) {
  if (emittedQueries.has(query)) return;
  emittedQueries.add(query);
  emit(eventName);
}

function sessionId() {
  let value = sessionStorage.getItem(SESSION_KEY);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, value);
  }
  return value;
}

function emit(name) {
  fetch("/api/telemetry", {
    body: JSON.stringify({ name }),
    headers: {
      "content-type": "application/json",
      "x-jichitai-code-qa": navigator.webdriver ? "1" : "0",
      "x-jichitai-code-session": sessionId(),
    },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
}

function showFatalError() {
  byId("data-status").textContent = "一覧を読み込めませんでした";
  byId("search-status").textContent = "通信状況を確認して、ページを再読み込みしてください。";
  byId("municipality-list").replaceChildren(
    element("p", "loading-note", "公式一覧を読み込めませんでした。"),
  );
}
