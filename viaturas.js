/* ============================================================
   CONTROLE DE VIATURAS — lógica (vanilla JS, sem build/framework)
   ============================================================ */

const STATUS_LABEL = { em_uso: "Em Uso", manutencao: "Em Manutenção", baixada: "Baixada" };
const STATUS_CLS = { em_uso: "ok", manutencao: "mid", baixada: "bad" };
const STATUS_COLOR = { em_uso: "#4a93a8", manutencao: "#c9863f", baixada: "#b0553f" };
const TIPO_COLORS = {
  "Caracterizada": "#8a5a35", "Descaracterizada": "#c08a55", "Motocicleta": "#8a5380",
  "Camburão": "#b0553f", "Van/Utilitário": "#c9863f", "Outro": "#6b3f5c",
};

let frota = [];
let saveTimer = null;
const todayStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

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
  const { data, error } = await sb.from("viaturas_data").select("*").eq("id", 1).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}
async function saveToCloud(patch) {
  if (!sb) return;
  const { error } = await sb.from("viaturas_data").upsert({ id: 1, ...patch, updated_at: new Date().toISOString() });
  if (error) console.error(error);
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveToCloud({ viaturas: frota });
    flashSaved();
  }, 500);
}
function flashSaved() {
  const el = document.getElementById("saved-flash");
  el.style.display = "inline-flex";
  setTimeout(() => (el.style.display = "none"), 1200);
}

function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------------------------------------------------------
   Rosca genérica (reaproveitada do padrão do Efetivo)
--------------------------------------------------------- */
function buildDonutHTML(entries, totalLabel) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total === 0) {
    return `<div class="donut-empty">Nenhuma viatura cadastrada ainda.</div>`;
  }
  const size = 168, r = 62, stroke = 22, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  let segments = "";
  entries.forEach((e) => {
    if (e.value <= 0) return;
    const frac = e.value / total;
    const dash = frac * circumference;
    segments += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${e.color}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
  });
  const svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="flex:none;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#3a4030" stroke-width="${stroke}"/>
    ${segments}
    <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="22" fill="#eef0e4" font-weight="600">${total}</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8.5" fill="#7c8268">${totalLabel}</text>
  </svg>`;
  const legend = entries.filter((e) => e.value > 0).map((e) => {
    const pct = Math.round((e.value / total) * 100);
    return `<div class="donut-legend-item"><span class="donut-swatch" style="background:${e.color}"></span><span class="donut-legend-name">${e.label}</span><b>${e.value}</b><span class="donut-legend-pct">${pct}%</span></div>`;
  }).join("");
  return `<div class="donut-wrap">${svg}<div class="donut-legend">${legend}</div></div>`;
}

/* ---------------------------------------------------------
   Render — Painel
--------------------------------------------------------- */
function renderPainel() {
  const total = frota.length;
  const emUso = frota.filter((v) => v.status === "em_uso").length;
  const manutencao = frota.filter((v) => v.status === "manutencao").length;
  const baixada = frota.filter((v) => v.status === "baixada").length;

  const totalOcorrencias = frota.reduce((sum, v) => sum + (v.manutencoes || []).length, 0);

  document.getElementById("painel-date").textContent = todayStr;
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-em-uso").textContent = emUso;
  document.getElementById("stat-manutencao").textContent = manutencao;
  document.getElementById("stat-baixada").textContent = baixada;
  document.getElementById("stat-ocorrencias").textContent = totalOcorrencias;

  document.getElementById("print-date").textContent = todayStr;
  document.getElementById("print-footer-date").textContent = todayStr;
  document.getElementById("p-stat-total").textContent = total;
  document.getElementById("p-stat-em-uso").textContent = emUso;
  document.getElementById("p-stat-manutencao").textContent = manutencao;
  document.getElementById("p-stat-baixada").textContent = baixada;

  const statusDonut = buildDonutHTML([
    { label: "Em Uso", value: emUso, color: STATUS_COLOR.em_uso },
    { label: "Em Manutenção", value: manutencao, color: STATUS_COLOR.manutencao },
    { label: "Baixada", value: baixada, color: STATUS_COLOR.baixada },
  ], "viaturas");
  document.getElementById("status-donut-holder").innerHTML = statusDonut;

  const tipoEntries = TIPOS_VIATURA.map((t) => ({
    label: t, value: frota.filter((v) => v.tipo === t).length, color: TIPO_COLORS[t] || "#8a5a35",
  }));
  document.getElementById("tipo-donut-holder").innerHTML = buildDonutHTML(tipoEntries, "viaturas");

  const emManutencaoRows = frota.filter((v) => v.status === "manutencao").map((v) => `
    <tr>
      <td data-label="Prefixo">${escapeHtml(v.prefixo) || "—"}</td>
      <td data-label="Modelo">${escapeHtml(v.modelo) || "—"}</td>
      <td data-label="Tipo">${escapeHtml(v.tipo) || "—"}</td>
      <td class="num" data-label="KM">${v.km || 0}</td>
    </tr>
  `).join("");
  document.getElementById("painel-manutencao-tbody").innerHTML = emManutencaoRows ||
    `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);padding:20px;">Nenhuma viatura em manutenção no momento.</td></tr>`;

  const printRows = frota.map((v) => `
    <tr>
      <td data-label="Prefixo">${escapeHtml(v.prefixo) || "—"}</td>
      <td data-label="Placa">${escapeHtml(v.placa) || "—"}</td>
      <td data-label="Modelo">${escapeHtml(v.modelo) || "—"}</td>
      <td data-label="Tipo">${escapeHtml(v.tipo) || "—"}</td>
      <td data-label="Status"><span class="badge-status ${STATUS_CLS[v.status] || "mid"}">${STATUS_LABEL[v.status] || v.status}</span></td>
      <td class="num" data-label="KM">${v.km || 0}</td>
    </tr>
  `).join("");
  document.getElementById("p-frota-tbody").innerHTML = printRows ||
    `<tr><td colspan="6" style="text-align:center;color:#8a8770;padding:20px;">Nenhuma viatura cadastrada.</td></tr>`;
}

/* ---------------------------------------------------------
   Render — Frota (tabela editável)
--------------------------------------------------------- */
function renderFrota() {
  document.getElementById("frota-info").textContent = `${frota.length} viatura(s) cadastrada(s)`;

  const tbody = document.getElementById("frota-tbody");
  tbody.innerHTML = frota.map((v) => `
    <tr data-id="${v.id}">
      <td data-label="Prefixo"><input class="ef-field field-prefixo" value="${escapeHtml(v.prefixo)}"></td>
      <td data-label="Placa"><input class="ef-field field-placa" style="width:100px;" value="${escapeHtml(v.placa)}"></td>
      <td data-label="Modelo"><input class="ef-field field-modelo" value="${escapeHtml(v.modelo)}"></td>
      <td data-label="Tipo">
        <select class="ef-field field-tipo">${TIPOS_VIATURA.map((t) => `<option value="${t}" ${t === v.tipo ? "selected" : ""}>${t}</option>`).join("")}</select>
      </td>
      <td data-label="Status">
        <select class="ef-field field-status">${STATUS_VIATURA.map((s) => `<option value="${s.value}" ${s.value === v.status ? "selected" : ""}>${s.label}</option>`).join("")}</select>
      </td>
      <td class="num" data-label="KM"><input type="number" class="ef-field field-km" style="width:90px;text-align:right;" value="${v.km || 0}"></td>
      <td class="num" data-label="Ocorrências">${(v.manutencoes || []).length}</td>
      <td class="cell-actions" data-label=""><button class="icon-btn btn-remove-viatura" title="Remover">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"/>
        </svg>
      </button></td>
    </tr>
  `).join("");
}

/* ---------------------------------------------------------
   Render — Manutenção
--------------------------------------------------------- */
function renderManutencaoSelect() {
  const sel = document.getElementById("manut-select");
  const prevValue = sel.value;
  sel.innerHTML = frota.map((v) => `<option value="${v.id}">${escapeHtml(v.prefixo) || "Viatura #" + v.id}${v.placa ? " — " + escapeHtml(v.placa) : ""}</option>`).join("");
  if (frota.some((v) => String(v.id) === prevValue)) sel.value = prevValue;

  const tipoSel = document.getElementById("manut-tipo-servico");
  if (tipoSel && !tipoSel.dataset.filled) {
    tipoSel.innerHTML = TIPOS_SERVICO.map((t) => `<option value="${t}">${t}</option>`).join("");
    tipoSel.dataset.filled = "1";
  }

  const hasFrota = frota.length > 0;
  document.getElementById("manut-empty").style.display = hasFrota ? "none" : "block";
  document.getElementById("manut-content").style.display = hasFrota ? "block" : "none";
  if (hasFrota) renderManutencaoHistorico();
}

function getSelectedViatura() {
  const sel = document.getElementById("manut-select");
  const id = Number(sel.value);
  return frota.find((v) => v.id === id);
}

function renderManutencaoHistorico() {
  const v = getSelectedViatura();
  const tbody = document.getElementById("manut-tbody");
  if (!v) { tbody.innerHTML = ""; return; }
  const registros = [...(v.manutencoes || [])].sort((a, b) => new Date(b.data) - new Date(a.data));

  document.getElementById("manut-stat-ocorrencias").textContent = registros.length;
  document.getElementById("manut-stat-ultima").textContent = registros.length
    ? new Date(registros[0].data + "T00:00:00").toLocaleDateString("pt-BR")
    : "—";

  tbody.innerHTML = registros.map((m) => `
    <tr data-mid="${m.id}">
      <td data-label="Data">${m.data ? new Date(m.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
      <td class="num" data-label="KM">${m.km || 0}</td>
      <td data-label="Oficina">${escapeHtml(m.oficina) || "—"}</td>
      <td data-label="Tipo de Serviço">${escapeHtml(m.tipoServico) || "—"}</td>
      <td data-label="Descrição">${escapeHtml(m.descricao) || "—"}</td>
      <td data-label="Processo SEI">${escapeHtml(m.processoSei) || "—"}</td>
      <td class="cell-actions" data-label=""><button class="icon-btn btn-remove-manut" title="Remover">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"/>
        </svg>
      </button></td>
    </tr>
  `).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:20px;">Nenhum registro ainda.</td></tr>`;
}

/* ---------------------------------------------------------
   Render geral
--------------------------------------------------------- */
function renderAll() {
  renderPainel();
  renderFrota();
  renderManutencaoSelect();
}

/* ---------------------------------------------------------
   Event delegation — Frota
--------------------------------------------------------- */
document.getElementById("frota-tbody").addEventListener("change", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const id = Number(tr.dataset.id);
  const v = frota.find((x) => x.id === id);
  if (!v) return;
  if (e.target.classList.contains("field-prefixo")) v.prefixo = e.target.value;
  if (e.target.classList.contains("field-placa")) v.placa = e.target.value;
  if (e.target.classList.contains("field-modelo")) v.modelo = e.target.value;
  if (e.target.classList.contains("field-tipo")) v.tipo = e.target.value;
  if (e.target.classList.contains("field-status")) v.status = e.target.value;
  if (e.target.classList.contains("field-km")) v.km = Number(e.target.value) || 0;
  persist();
  renderPainel();
  renderManutencaoSelect();
  document.getElementById("frota-info").textContent = `${frota.length} viatura(s) cadastrada(s)`;
});

document.getElementById("frota-tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-remove-viatura");
  if (!btn) return;
  const tr = btn.closest("tr");
  const id = Number(tr.dataset.id);
  frota = frota.filter((v) => v.id !== id);
  persist();
  renderAll();
});

document.getElementById("btn-add-viatura").addEventListener("click", () => {
  const nextId = Math.max(0, ...frota.map((v) => v.id)) + 1;
  frota.push({ id: nextId, prefixo: "", placa: "", modelo: "", tipo: "Caracterizada", status: "em_uso", km: 0, manutencoes: [] });
  persist();
  renderAll();
});

/* ---------------------------------------------------------
   Event delegation — Manutenção
--------------------------------------------------------- */
document.getElementById("manut-select").addEventListener("change", renderManutencaoHistorico);

document.getElementById("btn-add-manut").addEventListener("click", () => {
  const v = getSelectedViatura();
  if (!v) return;
  const data = document.getElementById("manut-data").value;
  const km = Number(document.getElementById("manut-km").value) || 0;
  const oficina = document.getElementById("manut-oficina").value.trim();
  const tipoServico = document.getElementById("manut-tipo-servico").value;
  const descricao = document.getElementById("manut-desc").value.trim();
  const processoSei = document.getElementById("manut-sei").value.trim();
  if (!data || !descricao) {
    alert("Preencha ao menos a data e a descrição.");
    return;
  }
  const nextMid = Math.max(0, ...(v.manutencoes || []).map((m) => m.id)) + 1;
  v.manutencoes = v.manutencoes || [];
  v.manutencoes.push({ id: nextMid, data, km, oficina, tipoServico, descricao, processoSei });
  document.getElementById("manut-data").value = "";
  document.getElementById("manut-km").value = "";
  document.getElementById("manut-oficina").value = "";
  document.getElementById("manut-desc").value = "";
  document.getElementById("manut-sei").value = "";
  persist();
  renderManutencaoHistorico();
  renderFrota();
  renderPainel();
});

document.getElementById("manut-tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-remove-manut");
  if (!btn) return;
  const v = getSelectedViatura();
  if (!v) return;
  const tr = btn.closest("tr");
  const mid = Number(tr.dataset.mid);
  v.manutencoes = (v.manutencoes || []).filter((m) => m.id !== mid);
  persist();
  renderManutencaoHistorico();
  renderFrota();
  renderPainel();
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
   Exportar PDF
--------------------------------------------------------- */
document.getElementById("btn-print").addEventListener("click", () => {
  renderPainel();
  window.print();
});

/* ---------------------------------------------------------
   Inicialização
--------------------------------------------------------- */
(async function init() {
  try {
    const cloud = await loadFromCloud();
    if (cloud) {
      frota = cloud.viaturas || SEED_FROTA;
    } else {
      frota = SEED_FROTA;
      await saveToCloud({ viaturas: frota });
    }
  } catch (e) {
    console.error("Erro ao carregar dados:", e);
    frota = SEED_FROTA;
  }
  renderAll();
})();
