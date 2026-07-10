/* ============================================================
   PAINEL DE EFETIVO — lógica (vanilla JS, sem build/framework)
   ============================================================ */

const POSTOS = [
  "MAJ PM", "CAP PM", "1º TEN PM",
  "SUBTEN PM", "SUBTEN PM RR/C",
  "1º SGT PM", "1º SGT PM RR/C",
  "CB PM", "AL CB PM", "SD 1ª Cl PM",
];

const GROUP_ORDER = ["Maj", "Cap", "Ten", "Subten", "Sgt", "Cb", "Sd"];
const GROUP_LABEL = {
  Maj: "Maj PM", Cap: "Cap PM", Ten: "Tenentes (QOPM+QOAPM+QETA)",
  Subten: "Subten PM", Sgt: "1º Sgt PM", Cb: "Cb PM (+ Al Cb)", Sd: "Sd PM",
};

function groupOf(posto) {
  const p = (posto || "").toUpperCase();
  if (p.startsWith("MAJ")) return "Maj";
  if (p.startsWith("CAP")) return "Cap";
  if (p.includes("TEN PM") && !p.includes("SGT") && !p.includes("SUBTEN")) return "Ten";
  if (p.startsWith("SUBTEN")) return "Subten";
  if (p.startsWith("1º SGT") || p.startsWith("SGT")) return "Sgt";
  if (p.startsWith("CB") || p.startsWith("AL CB")) return "Cb";
  if (p.startsWith("SD")) return "Sd";
  return "Outro";
}
const isRRC = (posto) => (posto || "").includes("RR/C");

function statusInfo(dif) {
  if (dif === 0) return { text: "Completo", cls: "ok" };
  if (dif > 0) return { text: "Excedente", cls: "ok" };
  if (dif >= -5) return { text: "Déficit", cls: "mid" };
  return { text: "Déficit crítico", cls: "bad" };
}

/* ---------------------------------------------------------
   Estado da aplicação
--------------------------------------------------------- */
let roster = [];
let qdl = { ...DEFAULT_QDL };
let includeRRC = false;
let saveTimer = null;

/* ---------------------------------------------------------
   Supabase
--------------------------------------------------------- */
let sb = null;
try {
  if (window.supabase && SUPABASE_URL && !SUPABASE_URL.includes("SEU-PROJETO")) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase não inicializado:", e);
}

async function loadFromCloud() {
  if (!sb) return null;
  const { data, error } = await sb.from("painel_data").select("*").eq("id", 1).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

async function saveToCloud(patch) {
  if (!sb) return;
  const { error } = await sb.from("painel_data").upsert({ id: 1, ...patch, updated_at: new Date().toISOString() });
  if (error) console.error(error);
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveToCloud({ roster, qdl, include_rrc: includeRRC });
    flashSaved();
  }, 500);
}

function flashSaved() {
  const el = document.getElementById("saved-flash");
  el.style.display = "inline";
  setTimeout(() => (el.style.display = "none"), 1200);
}

/* ---------------------------------------------------------
   Cálculo do diagnóstico
--------------------------------------------------------- */
function computeGroupData() {
  const counts = {};
  GROUP_ORDER.forEach((g) => (counts[g] = 0));
  roster.forEach((r) => {
    const g = groupOf(r.posto);
    if (!GROUP_ORDER.includes(g)) return;
    if (isRRC(r.posto) && !includeRRC) return;
    counts[g] += 1;
  });
  const out = {};
  GROUP_ORDER.forEach((g) => {
    const q = Number(qdl[g]) || 0;
    out[g] = { qdl: q, real: counts[g], dif: counts[g] - q };
  });
  return out;
}

function computeTotals(groupData) {
  let q = 0, r = 0;
  GROUP_ORDER.forEach((g) => { q += groupData[g].qdl; r += groupData[g].real; });
  const dif = r - q;
  return { qdl: q, real: r, dif, pct: q > 0 ? Math.round((dif / q) * 100) : 0 };
}

const todayStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

/* ---------------------------------------------------------
   Gráfico (SVG puro, sem dependências)
--------------------------------------------------------- */
function buildChartSVG(groupData) {
  const categories = GROUP_ORDER;
  const qdlVals = categories.map((g) => groupData[g].qdl);
  const realVals = categories.map((g) => groupData[g].real);
  const width = 680, height = 220;
  const marginL = 34, marginR = 15, marginT = 18, marginB = 30;
  const plotW = width - marginL - marginR;
  const plotH = height - marginT - marginB;
  const maxVal = Math.max(...qdlVals, 1) * 1.15;
  const n = categories.length;
  const groupW = plotW / n;
  const barW = groupW * 0.32;
  const gap = groupW * 0.06;
  const y = (v) => marginT + plotH - (v / maxVal) * plotH;
  const gridVals = [0, 20, 40, 60, 80].filter((v) => v <= maxVal);
  const colQdl = "#8e7d62", colReal = "#c08a55";

  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;font-family:'JetBrains Mono',monospace;">`;
  gridVals.forEach((gv) => {
    svg += `<line x1="${marginL}" y1="${y(gv)}" x2="${width - marginR}" y2="${y(gv)}" stroke="#454c3a" stroke-width="1"/>`;
    svg += `<text x="${marginL - 6}" y="${y(gv) + 3}" font-size="9" fill="#7c8268" text-anchor="end">${gv}</text>`;
  });
  svg += `<line x1="${marginL}" y1="${height - marginB}" x2="${width - marginR}" y2="${height - marginB}" stroke="#454c3a" stroke-width="1"/>`;

  categories.forEach((cat, i) => {
    const gx = marginL + i * groupW;
    const x1 = gx + gap;
    const x2 = gx + gap + barW + gap * 0.4;
    const y1 = y(qdlVals[i]), y2 = y(realVals[i]);
    const h1 = height - marginB - y1, h2 = height - marginB - y2;
    svg += `<rect x="${x1}" y="${y1}" width="${barW}" height="${h1}" fill="${colQdl}" rx="2"/>`;
    svg += `<rect x="${x2}" y="${y2}" width="${barW}" height="${h2}" fill="${colReal}" rx="2"/>`;
    svg += `<text x="${x1 + barW / 2}" y="${y1 - 4}" font-size="9.5" fill="#bfae8c" text-anchor="middle" font-weight="600">${qdlVals[i]}</text>`;
    svg += `<text x="${x2 + barW / 2}" y="${y2 - 4}" font-size="9.5" fill="#eef0e4" text-anchor="middle" font-weight="600">${realVals[i]}</text>`;
    svg += `<text x="${gx + groupW / 2}" y="${height - marginB + 15}" font-size="10.5" fill="#b7bba6" text-anchor="middle">${cat}</text>`;
  });

  svg += `<rect x="${width - 210}" y="0" width="10" height="10" fill="${colQdl}" rx="2"/>`;
  svg += `<text x="${width - 210 + 15}" y="9" font-size="10" fill="#b7bba6">QO (Previsto)</text>`;
  svg += `<rect x="${width - 95}" y="0" width="10" height="10" fill="${colReal}" rx="2"/>`;
  svg += `<text x="${width - 95 + 15}" y="9" font-size="10" fill="#b7bba6">Real</text>`;
  svg += `</svg>`;
  return svg;
}

/* ---------------------------------------------------------
   Barras de percentual de preenchimento por posto
--------------------------------------------------------- */
function buildFillBarsHTML(groupData) {
  return GROUP_ORDER.map((g) => {
    const d = groupData[g];
    let pct;
    if (d.qdl > 0) pct = Math.round((d.real / d.qdl) * 100);
    else pct = d.real > 0 ? 100 : 0;
    const pctClamped = Math.min(pct, 100);
    let cls = "ok";
    if (pct < 100) cls = pct >= 70 ? "mid" : "bad";
    return `
    <div class="fillbar-row">
      <div class="fillbar-label">${GROUP_LABEL[g].split(" ")[0]}</div>
      <div class="fillbar-track"><div class="fillbar-fill ${cls}" style="width:${pctClamped}%"></div></div>
      <div class="fillbar-pct">${pct}%</div>
    </div>`;
  }).join("");
}

/* ---------------------------------------------------------
   Rosca — participação de cada posto no déficit total
--------------------------------------------------------- */
const DEFICIT_COLORS = {
  Maj: "#8a5a35", Cap: "#c08a55", Ten: "#b0553f",
  Subten: "#c9863f", Sgt: "#93a84f", Cb: "#4a93a8", Sd: "#8a5380",
};

function buildDeficitDonutHTML(groupData) {
  const deficitGroups = GROUP_ORDER.filter((g) => groupData[g].dif < 0);
  const total = deficitGroups.reduce((s, g) => s + Math.abs(groupData[g].dif), 0);

  if (total === 0) {
    return `<div class="donut-empty">Nenhum déficit no momento —<br>efetivo completo ou excedente em todos os postos.</div>`;
  }

  const size = 168, r = 62, stroke = 22, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  let segments = "";
  deficitGroups.forEach((g) => {
    const val = Math.abs(groupData[g].dif);
    const frac = val / total;
    const dash = frac * circumference;
    segments += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${DEFICIT_COLORS[g]}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"/>`;
    offset += dash;
  });

  const svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="flex:none;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#3a4030" stroke-width="${stroke}"/>
    ${segments}
    <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="22" fill="#eef0e4" font-weight="600">${total}</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8.5" fill="#7c8268">déficit total</text>
  </svg>`;

  const legend = deficitGroups
    .sort((a, b) => Math.abs(groupData[b].dif) - Math.abs(groupData[a].dif))
    .map((g) => {
      const val = Math.abs(groupData[g].dif);
      const pct = Math.round((val / total) * 100);
      return `<div class="donut-legend-item"><span class="donut-swatch" style="background:${DEFICIT_COLORS[g]}"></span>${GROUP_LABEL[g]} <b>${val}</b> (${pct}%)</div>`;
    }).join("");

  return `<div class="donut-wrap">${svg}<div class="donut-legend">${legend}</div></div>`;
}

/* ---------------------------------------------------------
   Render — Diagnose (tela + impressão)
--------------------------------------------------------- */
function renderDiagnose() {
  const groupData = computeGroupData();
  const totals = computeTotals(groupData);
  const chartSvg = buildChartSVG(groupData);
  const fillBarsHtml = buildFillBarsHTML(groupData);
  const donutHtml = buildDeficitDonutHTML(groupData);

  const rowsHtml = GROUP_ORDER.map((g) => {
    const d = groupData[g];
    const s = statusInfo(d.dif);
    return `<tr>
      <td>${GROUP_LABEL[g]}</td>
      <td class="num">${d.qdl}</td>
      <td class="num">${d.real}</td>
      <td class="num">${d.dif > 0 ? "+" + d.dif : d.dif}</td>
      <td><span class="badge-status ${s.cls}">${s.text}</span></td>
    </tr>`;
  }).join("") + `<tr class="total">
      <td>Total</td><td class="num">${totals.qdl}</td><td class="num">${totals.real}</td>
      <td class="num">${totals.dif > 0 ? "+" + totals.dif : totals.dif}</td><td></td>
    </tr>`;

  const completos = GROUP_ORDER.filter((g) => groupData[g].dif === 0);
  const deficits = GROUP_ORDER.filter((g) => groupData[g].dif < 0).sort((a, b) => groupData[a].dif - groupData[b].dif);
  const excedentes = GROUP_ORDER.filter((g) => groupData[g].dif > 0);

  let obsHtml = "";
  if (completos.length) obsHtml += `<li><b>${completos.map((g) => GROUP_LABEL[g]).join(", ")}</b>: quadro completo, sem excedente.</li>`;
  deficits.forEach((g) => {
    const d = groupData[g];
    const pct = d.qdl > 0 ? ` (${Math.round(Math.abs(d.dif) / d.qdl * 100)}% do previsto)` : "";
    obsHtml += `<li><b>${GROUP_LABEL[g]}</b>: déficit de ${Math.abs(d.dif)}${pct}.</li>`;
  });
  excedentes.forEach((g) => {
    obsHtml += `<li><b>${GROUP_LABEL[g]}</b>: excedente de ${groupData[g].dif}, disponível para remanejamento.</li>`;
  });

  const calloutHtml = `<b>Sugestão de remanejamento: </b>${
    totals.dif < 0
      ? "priorizar, na próxima Separata, o preenchimento das vagas com maior déficit relativo, remanejando eventuais excedentes de outras graduações."
      : "unidade com efetivo completo ou excedente; avaliar disponibilidade para apoiar outras Unidades carentes."
  }`;

  // --- tela ---
  document.getElementById("diag-date").textContent = todayStr;
  document.getElementById("stat-qdl").textContent = totals.qdl;
  document.getElementById("stat-real").textContent = totals.real;
  document.getElementById("stat-dif").textContent = totals.dif > 0 ? "+" + totals.dif : totals.dif;
  document.getElementById("stat-pct").textContent = totals.pct + "% do previsto";
  document.getElementById("stat-dif-card").classList.toggle("alert", totals.dif < 0);
  document.getElementById("chart-holder").innerHTML = chartSvg;
  document.getElementById("fillbars-holder").innerHTML = fillBarsHtml;
  document.getElementById("donut-holder").innerHTML = donutHtml;
  document.getElementById("diag-tbody").innerHTML = rowsHtml;
  document.getElementById("diag-obs").innerHTML = obsHtml;
  document.getElementById("diag-callout").innerHTML = calloutHtml;

  // --- impressão ---
  document.getElementById("print-date").textContent = todayStr;
  document.getElementById("p-stat-qdl").textContent = totals.qdl;
  document.getElementById("p-stat-real").textContent = totals.real;
  document.getElementById("p-stat-dif").textContent = totals.dif > 0 ? "+" + totals.dif : totals.dif;
  document.getElementById("p-stat-dif-card").classList.toggle("alert", totals.dif < 0);
  document.getElementById("print-chart-holder").innerHTML = chartSvg;
  document.getElementById("p-fillbars-holder").innerHTML = fillBarsHtml;
  document.getElementById("p-donut-holder").innerHTML = donutHtml;
  document.getElementById("p-diag-tbody").innerHTML = rowsHtml;
  document.getElementById("p-diag-obs").innerHTML = obsHtml;
  document.getElementById("p-diag-callout").innerHTML = calloutHtml;
}

/* ---------------------------------------------------------
   Render — Efetivo (tabela editável)
--------------------------------------------------------- */
function renderRoster() {
  const rrcCount = roster.filter((r) => isRRC(r.posto)).length;
  document.getElementById("roster-info").textContent = `${roster.length} registros · ${rrcCount} em RR/C`;
  document.getElementById("chk-rrc").checked = includeRRC;

  const tbody = document.getElementById("roster-tbody");
  tbody.innerHTML = roster.map((r) => `
    <tr data-id="${r.id}">
      <td>
        <select class="ef-field field-posto">${POSTOS.map((p) => `<option value="${p}" ${p === r.posto ? "selected" : ""}>${p}</option>`).join("")}</select>
      </td>
      <td><input class="ef-field field-nome" value="${escapeHtml(r.nome)}"></td>
      <td><input class="ef-field field-matricula" style="width:120px;" value="${escapeHtml(r.matricula)}"></td>
      <td><button class="icon-btn btn-remove" title="Remover">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"/>
        </svg>
      </button></td>
    </tr>
  `).join("");
}

function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------------------------------------------------------
   Render — Metas (QO)
--------------------------------------------------------- */
function renderMetas() {
  const el = document.getElementById("metas-list");
  el.innerHTML = GROUP_ORDER.map((g) => `
    <div class="meta-row" data-g="${g}">
      <div class="lbl">${GROUP_LABEL[g]}</div>
      <input type="number" min="0" value="${qdl[g]}">
    </div>
  `).join("");
}

/* ---------------------------------------------------------
   Render geral
--------------------------------------------------------- */
function renderAll() {
  renderDiagnose();
  renderRoster();
  renderMetas();
}

/* ---------------------------------------------------------
   Event delegation — Efetivo
--------------------------------------------------------- */
document.getElementById("roster-tbody").addEventListener("change", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const id = Number(tr.dataset.id);
  const item = roster.find((r) => r.id === id);
  if (!item) return;
  if (e.target.classList.contains("field-posto")) item.posto = e.target.value;
  if (e.target.classList.contains("field-nome")) item.nome = e.target.value;
  if (e.target.classList.contains("field-matricula")) item.matricula = e.target.value;
  persist();
  renderDiagnose();
  document.getElementById("roster-info").textContent = `${roster.length} registros · ${roster.filter((r) => isRRC(r.posto)).length} em RR/C`;
});

document.getElementById("roster-tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-remove");
  if (!btn) return;
  const tr = btn.closest("tr");
  const id = Number(tr.dataset.id);
  roster = roster.filter((r) => r.id !== id);
  persist();
  renderRoster();
  renderDiagnose();
});

document.getElementById("btn-add-row").addEventListener("click", () => {
  const nextId = Math.max(0, ...roster.map((r) => r.id)) + 1;
  roster.push({ id: nextId, posto: "SD 1ª Cl PM", nome: "", matricula: "" });
  persist();
  renderRoster();
  renderDiagnose();
});

document.getElementById("chk-rrc").addEventListener("change", (e) => {
  includeRRC = e.target.checked;
  persist();
  renderDiagnose();
});

document.getElementById("btn-bulk-toggle").addEventListener("click", () => {
  const box = document.getElementById("bulk-box");
  box.style.display = box.style.display === "none" ? "block" : "none";
});
document.getElementById("btn-bulk-cancel").addEventListener("click", () => {
  document.getElementById("bulk-box").style.display = "none";
  document.getElementById("bulk-text").value = "";
});
document.getElementById("btn-bulk-import").addEventListener("click", () => {
  const text = document.getElementById("bulk-text").value;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let nextId = Math.max(0, ...roster.map((r) => r.id));
  lines.forEach((line) => {
    const [posto, nome, matricula] = line.split("\t").map((p) => (p || "").trim());
    nextId += 1;
    roster.push({ id: nextId, posto: posto || "SD 1ª Cl PM", nome: nome || "", matricula: matricula || "" });
  });
  document.getElementById("bulk-text").value = "";
  document.getElementById("bulk-box").style.display = "none";
  persist();
  renderRoster();
  renderDiagnose();
});

/* ---------------------------------------------------------
   Event delegation — Metas
--------------------------------------------------------- */
document.getElementById("metas-list").addEventListener("change", (e) => {
  const row = e.target.closest(".meta-row");
  if (!row) return;
  const g = row.dataset.g;
  qdl[g] = Number(e.target.value) || 0;
  persist();
  renderDiagnose();
});

/* ---------------------------------------------------------
   Abas
--------------------------------------------------------- */
document.querySelectorAll(".ef-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ef-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".ef-section").forEach((s) => s.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("sec-" + tab.dataset.tab).classList.add("active");
  });
});

/* ---------------------------------------------------------
   Exportar PDF (impressão)
--------------------------------------------------------- */
document.getElementById("btn-print").addEventListener("click", () => {
  renderDiagnose();
  window.print();
});

/* ---------------------------------------------------------
   Inicialização
--------------------------------------------------------- */
(async function init() {
  try {
    const cloud = await loadFromCloud();
    if (cloud) {
      roster = cloud.roster || SEED_ROSTER;
      qdl = cloud.qdl || DEFAULT_QDL;
      includeRRC = !!cloud.include_rrc;
    } else {
      roster = SEED_ROSTER;
      qdl = { ...DEFAULT_QDL };
      includeRRC = false;
      await saveToCloud({ roster, qdl, include_rrc: includeRRC });
    }
  } catch (e) {
    console.error("Erro ao carregar dados:", e);
    roster = SEED_ROSTER;
    qdl = { ...DEFAULT_QDL };
    includeRRC = false;
  }
  renderAll();
})();
