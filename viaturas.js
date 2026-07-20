/* ============================================================
   CONTROLE DE VIATURAS — lógica (vanilla JS, sem build/framework)
   ============================================================ */

const STATUS_LABEL = { em_uso: "Em Uso", manutencao: "Em Manutenção", baixada: "Baixada" };
const STATUS_CLS = { em_uso: "ok", manutencao: "mid", baixada: "bad" };
const STATUS_COLOR = { em_uso: "#4a93a8", manutencao: "#c9863f", baixada: "#b0553f" };
const CATEGORIA_COLORS = {
  "Motocicleta": "#8a5380", "Automóvel": "#8a5a35", "Transporte de Tropa": "#4a93a8", "Outro": "#6b3f5c",
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
   KM — formatação/parse manuais (padrão BR: ponto como milhar).
   Evita o bug de <input type="number"> com locale, que troca
   ponto/vírgula sozinho dependendo do navegador/idioma do SO.
--------------------------------------------------------- */
function formatKm(n) {
  const num = Math.round(Number(n) || 0);
  return num.toLocaleString("pt-BR");
}
function parseKm(str) {
  const digits = String(str || "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/* Faz um <textarea> crescer junto com o conteúdo (compatível com qualquer navegador) */
function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

/* ---------------------------------------------------------
   Indisponibilidade — dias parados desde a última ocorrência
   marcada como "indisponível" (a mais recente define o status)
--------------------------------------------------------- */
function getIndisponibilidade(v) {
  const registros = v.manutencoes || [];
  if (!registros.length) return null;
  const ultima = [...registros].sort((a, b) => new Date(b.data) - new Date(a.data))[0];
  if (!ultima.indisponivel || !ultima.data) return null;
  const inicio = new Date(ultima.data + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.max(0, Math.floor((hoje - inicio) / 86400000));
  return { dias };
}

let indispBadgeSeq = 0;
function arcPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function buildIndispBadgeSVG(dias) {
  indispBadgeSeq += 1;
  const uid = "indisp-arc-" + indispBadgeSeq;
  const size = 68, cx = size / 2, cy = size / 2;
  const circleR = 19, textR = 22; // textR próximo do círculo (antes era 29)
  const startAngle = 330; // 11 horas
  const sweep = -300; // negativo = sentido anti-horário
  const p1 = arcPoint(cx, cy, textR, startAngle);
  const p2 = arcPoint(cx, cy, textR, startAngle + sweep);
  const sweepFlag = sweep > 0 ? 1 : 0;
  return `
  <svg class="indisp-badge" viewBox="0 0 ${size} ${size}" width="56" height="56">
    <defs><path id="${uid}" d="M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${textR} ${textR} 0 1 ${sweepFlag} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}" fill="none"/></defs>
    <circle cx="${cx}" cy="${cy}" r="${circleR}" fill="#3a1f1a" stroke="#b0553f" stroke-width="1.5"/>
    <text font-family="JetBrains Mono, monospace" font-size="6.6" letter-spacing="0.4" fill="#e08a72" font-weight="600">
      <textPath href="#${uid}" startOffset="1%" text-anchor="start">INDISPONÍVEL</textPath>
    </text>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700" fill="#e08a72">${dias}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="6" fill="#e08a72" opacity=".85">dia${dias === 1 ? "" : "s"}</text>
  </svg>`;
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

  const tipoEntries = CATEGORIAS_VIATURA.map((t) => ({
    label: t, value: frota.filter((v) => v.categoria === t).length, color: CATEGORIA_COLORS[t] || "#8a5a35",
  }));
  document.getElementById("tipo-donut-holder").innerHTML = buildDonutHTML(tipoEntries, "viaturas");

  const caracterizadas = frota.filter((v) => v.caracterizacao === "Caracterizada");
  const descaracterizadas = frota.filter((v) => v.caracterizacao === "Descaracterizada");
  document.getElementById("frota-caracterizada-holder").innerHTML = buildVehicleGroupHTML(caracterizadas);
  document.getElementById("frota-descaracterizada-holder").innerHTML = buildVehicleGroupHTML(descaracterizadas);
  document.getElementById("count-caracterizada").textContent = caracterizadas.length;
  document.getElementById("count-descaracterizada").textContent = descaracterizadas.length;

  const printRows = frota.map((v) => `
    <tr>
      <td data-label="Prefixo">${escapeHtml(v.prefixo) || "—"}</td>
      <td data-label="Placa">${escapeHtml(v.placa) || "—"}</td>
      <td data-label="Modelo">${escapeHtml(v.modelo) || "—"}</td>
      <td data-label="Categoria">${escapeHtml(v.categoria) || "—"}</td>
      <td data-label="Caracterização">${escapeHtml(v.caracterizacao) || "—"}</td>
      <td data-label="Status"><span class="badge-status ${STATUS_CLS[v.status] || "mid"}">${STATUS_LABEL[v.status] || v.status}</span></td>
      <td class="num" data-label="KM">${formatKm(v.km)}</td>
    </tr>
  `).join("");
  document.getElementById("p-frota-tbody").innerHTML = printRows ||
    `<tr><td colspan="7" style="text-align:center;color:#8a8770;padding:20px;">Nenhuma viatura cadastrada.</td></tr>`;
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
      <td data-label="Categoria">
        <select class="ef-field field-categoria">${CATEGORIAS_VIATURA.map((t) => `<option value="${t}" ${t === v.categoria ? "selected" : ""}>${t}</option>`).join("")}</select>
      </td>
      <td data-label="Caracterização">
        <select class="ef-field field-caracterizacao">${CARACTERIZACAO_VIATURA.map((t) => `<option value="${t}" ${t === v.caracterizacao ? "selected" : ""}>${t}</option>`).join("")}</select>
      </td>
      <td data-label="Status">
        <select class="ef-field field-status">${STATUS_VIATURA.map((s) => `<option value="${s.value}" ${s.value === v.status ? "selected" : ""}>${s.label}</option>`).join("")}</select>
      </td>
      <td class="num" data-label="KM"><input type="text" inputmode="numeric" class="ef-field field-km" style="width:90px;text-align:right;" value="${formatKm(v.km)}"></td>
      <td class="num" data-label="Ocorrências">${(v.manutencoes || []).length}</td>
      <td class="cell-actions" data-label="">
        <div class="row-actions">
          <button class="icon-btn view btn-docs-viatura" title="Documentos da viatura">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
            ${(v.documentos || []).length > 0 ? `<span class="update-count">${(v.documentos || []).length}</span>` : ""}
          </button>
          <button class="icon-btn btn-remove-viatura" title="Remover">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

/* ---------------------------------------------------------
   Card de viatura (compartilhado entre Painel e Manutenção)
--------------------------------------------------------- */
const STATUS_CARD_CLASS = { em_uso: "st-em-uso", manutencao: "st-manutencao", baixada: "st-baixada" };

function buildVehicleCardHTML(v, { selected = false, mode = "select" } = {}) {
  const nOcorr = (v.manutencoes || []).length;
  const nDocs = (v.documentos || []).length;
  const statusClass = STATUS_CARD_CLASS[v.status] || "st-manutencao";
  const modeClass = mode === "docs" ? "vehicle-card-docs" : "vehicle-card-select";
  const indisp = getIndisponibilidade(v);
  return `
    <button class="vehicle-card ${statusClass} ${modeClass}${selected ? " active" : ""}${indisp ? " has-indisp" : ""}" data-vid="${v.id}" type="button">
      ${indisp ? buildIndispBadgeSVG(indisp.dias) : ""}
      <div class="vc-prefixo">${escapeHtml(v.prefixo) || "Viatura #" + v.id}</div>
      <div class="vc-placa">${escapeHtml(v.placa) || "sem placa"}</div>
      <div class="vc-meta">${escapeHtml(v.modelo) || "—"} · ${escapeHtml(v.categoria) || "—"}</div>
      <div class="vc-foot">
        <span class="badge-status ${STATUS_CLS[v.status] || "mid"}">${STATUS_LABEL[v.status] || v.status}</span>
        <span class="vc-ocorrencias">${nOcorr} ocorrência${nOcorr === 1 ? "" : "s"}</span>
      </div>
      ${mode === "docs" ? `<div class="vc-docs${nDocs > 0 ? "" : " empty"}">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        ${nDocs > 0 ? `${nDocs} documento${nDocs === 1 ? "" : "s"}` : "Ver documentos"}
      </div>` : (nDocs > 0 ? `<div class="vc-docs">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        ${nDocs} documento${nDocs === 1 ? "" : "s"}
      </div>` : "")}
    </button>`;
}

function buildVehicleGroupHTML(lista) {
  if (!lista.length) return `<div class="vehicle-card-empty">Nenhuma viatura nesse grupo.</div>`;
  return `<div class="manut-vehicle-grid">${lista.map((v) => buildVehicleCardHTML(v, { mode: "docs" })).join("")}</div>`;
}
document.getElementById("frota-caracterizada-holder").addEventListener("click", (e) => {
  const btn = e.target.closest(".vehicle-card-docs");
  if (btn) openVehicleDocsViewModal(Number(btn.dataset.vid));
});
document.getElementById("frota-descaracterizada-holder").addEventListener("click", (e) => {
  const btn = e.target.closest(".vehicle-card-docs");
  if (btn) openVehicleDocsViewModal(Number(btn.dataset.vid));
});


/* ---------------------------------------------------------
   Render — Manutenção
--------------------------------------------------------- */
let selectedViaturaId = null;

function renderManutencaoSelect() {
  if (!frota.some((v) => v.id === selectedViaturaId)) {
    selectedViaturaId = frota.length ? frota[0].id : null;
  }

  const grid = document.getElementById("manut-select-cards");
  grid.innerHTML = frota.length
    ? frota.map((v) => buildVehicleCardHTML(v, { selected: v.id === selectedViaturaId, mode: "select" })).join("")
    : `<div class="vehicle-card-empty">Nenhuma viatura cadastrada.</div>`;

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
  return frota.find((v) => v.id === selectedViaturaId);
}

document.getElementById("manut-select-cards").addEventListener("click", (e) => {
  const btn = e.target.closest(".vehicle-card");
  if (!btn) return;
  selectedViaturaId = Number(btn.dataset.vid);
  renderManutencaoSelect();
});


function renderManutencaoHistorico() {
  const v = getSelectedViatura();
  const tbody = document.getElementById("manut-tbody");
  if (!v) { tbody.innerHTML = ""; return; }
  const registros = [...(v.manutencoes || [])].sort((a, b) => new Date(b.data) - new Date(a.data));

  document.getElementById("manut-stat-ocorrencias").textContent = registros.length;
  document.getElementById("manut-stat-ultima").textContent = registros.length
    ? new Date(registros[0].data + "T00:00:00").toLocaleDateString("pt-BR")
    : "—";

  tbody.innerHTML = registros.map((m) => {
    const nUpdates = (m.atualizacoes || []).length;
    return `
    <tr data-mid="${m.id}">
      <td data-label="Data">${m.data ? new Date(m.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
      <td class="num" data-label="KM">${formatKm(m.km)}</td>
      <td data-label="Oficina">${escapeHtml(m.oficina) || "—"}</td>
      <td data-label="Tipo de Serviço">${escapeHtml(m.tipoServico) || "—"}</td>
      <td data-label="Descrição">${escapeHtml(m.descricao) || "—"}</td>
      <td data-label="Processo SEI">${escapeHtml(m.processoSei) || "—"}</td>
      <td data-label="" class="cell-actions">
        <div class="row-actions">
          <button class="icon-btn edit btn-edit-manut" title="Editar ocorrência">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn add-update btn-add-update" title="Adicionar atualização">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
            ${nUpdates > 0 ? `<span class="update-count">${nUpdates}</span>` : ""}
          </button>
          <button class="icon-btn view btn-view-manut" title="Ver todas as informações">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="icon-btn btn-remove-manut" title="Remover">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:20px;">Nenhum registro ainda.</td></tr>`;
}

/* ---------------------------------------------------------
   Modal reutilizável
--------------------------------------------------------- */
function openModal(html) {
  document.getElementById("modal-card").innerHTML = `
    <button class="modal-close" id="modal-close-btn">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
    ${html}
  `;
  document.getElementById("modal-overlay").classList.add("open");
  document.getElementById("modal-close-btn").addEventListener("click", closeModal);
}
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.getElementById("modal-card").innerHTML = "";
}
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function fmtDateBR(iso) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}

/* --- Modal: Editar ocorrência --- */
function openEditManutModal(viaturaId, mid) {
  const v = frota.find((x) => x.id === viaturaId);
  const m = v && (v.manutencoes || []).find((x) => x.id === mid);
  if (!m) return;
  openModal(`
    <div class="modal-title">Editar Ocorrência</div>
    <div class="modal-subtitle">${escapeHtml(v.prefixo) || "Viatura #" + v.id}</div>
    <div class="modal-grid cols-2">
      <div class="modal-field"><label>Data</label><input type="date" id="edit-data" value="${m.data || ""}"></div>
      <div class="modal-field"><label>KM</label><input type="text" inputmode="numeric" id="edit-km" value="${formatKm(m.km)}"></div>
      <div class="modal-field"><label>Oficina</label><input type="text" id="edit-oficina" value="${escapeHtml(m.oficina)}"></div>
      <div class="modal-field"><label>Tipo de Serviço</label>
        <select id="edit-tipo">${TIPOS_SERVICO.map((t) => `<option value="${t}" ${t === m.tipoServico ? "selected" : ""}>${t}</option>`).join("")}</select>
      </div>
      <div class="modal-field" style="grid-column:1/-1;"><label>Descrição</label><textarea id="edit-desc" rows="2">${escapeHtml(m.descricao)}</textarea></div>
      <div class="modal-field" style="grid-column:1/-1;"><label>Processo SEI</label><input type="text" id="edit-sei" value="${escapeHtml(m.processoSei)}"></div>
      <div class="modal-field" style="grid-column:1/-1;">
        <label class="manut-check-indisp"><input type="checkbox" id="edit-indisponivel" ${m.indisponivel ? "checked" : ""}> Viatura indisponível a partir desta ocorrência</label>
      </div>
    </div>
    <div class="modal-actions">
      <button class="ef-btn" id="edit-cancel-btn">Cancelar</button>
      <button class="ef-btn primary" id="edit-save-btn">Salvar Alterações</button>
    </div>
  `);
  document.getElementById("edit-cancel-btn").addEventListener("click", closeModal);
  const editDescEl = document.getElementById("edit-desc");
  autoGrow(editDescEl);
  editDescEl.addEventListener("input", () => autoGrow(editDescEl));
  document.getElementById("edit-save-btn").addEventListener("click", () => {
    m.data = document.getElementById("edit-data").value;
    m.km = parseKm(document.getElementById("edit-km").value);
    m.oficina = document.getElementById("edit-oficina").value.trim();
    m.tipoServico = document.getElementById("edit-tipo").value;
    m.descricao = document.getElementById("edit-desc").value.trim();
    m.processoSei = document.getElementById("edit-sei").value.trim();
    m.indisponivel = document.getElementById("edit-indisponivel").checked;
    persist();
    renderManutencaoHistorico();
    renderManutencaoSelect();
    renderFrota();
    renderPainel();
    closeModal();
  });
}

/* --- Modal: Adicionar atualização (enriquece o histórico da ocorrência) --- */
function openAddUpdateModal(viaturaId, mid) {
  const v = frota.find((x) => x.id === viaturaId);
  const m = v && (v.manutencoes || []).find((x) => x.id === mid);
  if (!m) return;
  const updates = [...(m.atualizacoes || [])].sort((a, b) => new Date(b.data) - new Date(a.data));
  const updatesHtml = updates.length
    ? `<div class="timeline">${updates.map((u) => `
        <div class="timeline-item">
          <div class="timeline-date">${fmtDateBR(u.data)}</div>
          <div class="timeline-text">${escapeHtml(u.texto)}</div>
        </div>`).join("")}</div>`
    : `<div class="timeline-empty">Nenhuma atualização registrada ainda.</div>`;

  openModal(`
    <div class="modal-title">Adicionar Atualização</div>
    <div class="modal-subtitle">${escapeHtml(v.prefixo) || "Viatura #" + v.id} — ${escapeHtml(m.descricao) || "ocorrência de " + fmtDateBR(m.data)}</div>
    <div class="modal-grid">
      <div class="modal-field"><label>Data da Atualização</label><input type="date" id="update-data" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="modal-field"><label>O que aconteceu</label><textarea id="update-texto" placeholder="Ex: peça chegou, previsão de liberação em 3 dias..."></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="ef-btn" id="update-cancel-btn">Fechar</button>
      <button class="ef-btn primary" id="update-save-btn">Adicionar</button>
    </div>
    <div class="section-label" style="margin-top:20px;">Atualizações Anteriores</div>
    ${updatesHtml}
  `);
  document.getElementById("update-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("update-save-btn").addEventListener("click", () => {
    const data = document.getElementById("update-data").value;
    const texto = document.getElementById("update-texto").value.trim();
    if (!data || !texto) { alert("Preencha a data e o texto da atualização."); return; }
    const nextUid = Math.max(0, ...(m.atualizacoes || []).map((u) => u.id)) + 1;
    m.atualizacoes = m.atualizacoes || [];
    m.atualizacoes.push({ id: nextUid, data, texto });
    persist();
    renderManutencaoHistorico();
    openAddUpdateModal(viaturaId, mid); // reabre atualizado, com o novo item na lista
  });
}

/* --- Modal: Ver todas as informações --- */
function renderAnexosListHTML(m) {
  const anexos = m.anexos || [];
  if (!anexos.length) return `<div class="timeline-empty">Nenhum anexo enviado ainda.</div>`;
  return `<div class="anexos-list">${anexos.map((a) => {
    const isImage = (a.tipo || "").startsWith("image/");
    const thumb = isImage
      ? `<img src="${a.url}" alt="" class="anexo-thumb">`
      : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" class="anexo-icon"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`;
    return `
    <div class="anexo-item" data-aid="${a.id}">
      ${thumb}
      <a href="${a.url}" target="_blank" rel="noopener" class="anexo-name">${escapeHtml(a.nome)}</a>
      <span class="anexo-meta">${formatBytes(a.tamanho)} · ${fmtDateBR(a.data)}</span>
      <button class="icon-btn btn-remove-anexo" title="Remover anexo">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"/></svg>
      </button>
    </div>
  `;
  }).join("")}</div>`;
}

function formatBytes(n) {
  if (!n) return "0 KB";
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

async function uploadAnexo(viaturaId, mid, file) {
  if (!sb) { alert("Envio de arquivos indisponível: Supabase não configurado."); return; }
  const tiposAceitos = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!tiposAceitos.includes(file.type)) { alert("Só é permitido anexar PDF, JPG, PNG ou WEBP."); return; }
  const v = frota.find((x) => x.id === viaturaId);
  const m = v && (v.manutencoes || []).find((x) => x.id === mid);
  if (!m) return;
  const statusEl = document.getElementById("anexo-status");
  if (statusEl) statusEl.textContent = "Enviando...";
  // Nomes com acento/espaço/parênteses podem quebrar a chave do Storage;
  // guardamos o nome original em "nome" (exibição) e usamos uma versão
  // sanitizada só no caminho interno do arquivo.
  const safeName = file.name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${viaturaId}/${mid}/${Date.now()}_${safeName}`;
  const { error } = await sb.storage.from("viaturas-anexos").upload(path, file);
  if (error) {
    console.error(error);
    const msg = error.message || "Erro desconhecido";
    if (statusEl) statusEl.textContent = "Erro: " + msg;
    alert(
      "Erro ao enviar arquivo: " + msg +
      "\n\nConfira se o bucket 'viaturas-anexos' foi criado no Supabase (Storage) " +
      "e se o SQL de policies (viaturas_storage_setup.sql) foi executado."
    );
    return;
  }
  const { data } = sb.storage.from("viaturas-anexos").getPublicUrl(path);
  const nextAid = Math.max(0, ...(m.anexos || []).map((a) => a.id)) + 1;
  m.anexos = m.anexos || [];
  m.anexos.push({ id: nextAid, nome: file.name, path, url: data.publicUrl, tamanho: file.size, tipo: file.type, data: new Date().toISOString().slice(0, 10) });
  persist();
  openViewManutModal(viaturaId, mid); // reabre atualizado
}

async function removeAnexo(viaturaId, mid, aid) {
  const v = frota.find((x) => x.id === viaturaId);
  const m = v && (v.manutencoes || []).find((x) => x.id === mid);
  if (!m) return;
  const anexo = (m.anexos || []).find((a) => a.id === aid);
  if (sb && anexo) {
    await sb.storage.from("viaturas-anexos").remove([anexo.path]);
  }
  m.anexos = (m.anexos || []).filter((a) => a.id !== aid);
  persist();
  openViewManutModal(viaturaId, mid);
}

/* ---------------------------------------------------------
   Documentos da viatura (CRLV, Termo de Entrega, etc.)
--------------------------------------------------------- */
const TIPOS_DOCUMENTO_SUGESTOES = [
  "CRLV", "Termo de Entrega", "Seguro", "Licenciamento", "Nota Fiscal", "Contrato de Locação",
];

function renderDocumentosListHTML(v, { readOnly = false } = {}) {
  const docs = v.documentos || [];
  if (!docs.length) return `<div class="timeline-empty">Nenhum documento enviado ainda.</div>`;
  return `<div class="anexos-list">${docs.map((d) => {
    const isImage = (d.tipo || "").startsWith("image/");
    const thumb = isImage
      ? `<img src="${d.url}" alt="" class="anexo-thumb">`
      : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" class="anexo-icon"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`;
    return `
    <div class="anexo-item" data-did="${d.id}">
      ${thumb}
      <span class="doc-type-tag">${escapeHtml(d.tipoDocumento)}</span>
      <a href="${d.url}" target="_blank" rel="noopener" class="anexo-name">${escapeHtml(d.nome)}</a>
      <span class="anexo-meta">${formatBytes(d.tamanho)} · ${fmtDateBR(d.data)}</span>
      ${readOnly ? "" : `<button class="icon-btn btn-remove-doc" title="Remover documento">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"/></svg>
      </button>`}
    </div>`;
  }).join("")}</div>`;
}

function openVehicleDocsViewModal(viaturaId) {
  const v = frota.find((x) => x.id === viaturaId);
  if (!v) return;
  openModal(`
    <div class="modal-title">Documentos da Viatura</div>
    <div class="modal-subtitle">${escapeHtml(v.prefixo) || "Viatura #" + v.id}${v.placa ? " — " + escapeHtml(v.placa) : ""}</div>
    ${renderDocumentosListHTML(v, { readOnly: true })}
    <div class="modal-actions">
      <button class="ef-btn primary" id="docview-close-btn">Fechar</button>
    </div>
  `);
  document.getElementById("docview-close-btn").addEventListener("click", closeModal);
}

async function uploadDocumento(viaturaId, tipoDocumento, file) {
  if (!sb) { alert("Envio de arquivos indisponível: Supabase não configurado."); return; }
  const tiposAceitos = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!tiposAceitos.includes(file.type)) { alert("Só é permitido anexar PDF, JPG, PNG ou WEBP."); return; }
  if (!tipoDocumento) { alert("Informe o tipo do documento (ex: CRLV, Termo de Entrega...)."); return; }
  const v = frota.find((x) => x.id === viaturaId);
  if (!v) return;
  const statusEl = document.getElementById("doc-status");
  if (statusEl) statusEl.textContent = "Enviando...";
  const safeName = file.name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `veiculo/${viaturaId}/${Date.now()}_${safeName}`;
  const { error } = await sb.storage.from("viaturas-anexos").upload(path, file);
  if (error) {
    console.error(error);
    const msg = error.message || "Erro desconhecido";
    if (statusEl) statusEl.textContent = "Erro: " + msg;
    alert("Erro ao enviar arquivo: " + msg);
    return;
  }
  const { data } = sb.storage.from("viaturas-anexos").getPublicUrl(path);
  const nextDid = Math.max(0, ...(v.documentos || []).map((d) => d.id)) + 1;
  v.documentos = v.documentos || [];
  v.documentos.push({
    id: nextDid, tipoDocumento, nome: file.name, path, url: data.publicUrl,
    tamanho: file.size, tipo: file.type, data: new Date().toISOString().slice(0, 10),
  });
  persist();
  renderFrota();
  renderManutencaoSelect();
  openVehicleDocsModal(viaturaId); // reabre atualizado
}

async function removeDocumento(viaturaId, did) {
  const v = frota.find((x) => x.id === viaturaId);
  if (!v) return;
  const doc = (v.documentos || []).find((d) => d.id === did);
  if (sb && doc) {
    await sb.storage.from("viaturas-anexos").remove([doc.path]);
  }
  v.documentos = (v.documentos || []).filter((d) => d.id !== did);
  persist();
  renderFrota();
  renderManutencaoSelect();
  openVehicleDocsModal(viaturaId);
}

function openVehicleDocsModal(viaturaId) {
  const v = frota.find((x) => x.id === viaturaId);
  if (!v) return;
  const datalistOptions = TIPOS_DOCUMENTO_SUGESTOES.map((t) => `<option value="${t}">`).join("");

  openModal(`
    <div class="modal-title">Documentos da Viatura</div>
    <div class="modal-subtitle">${escapeHtml(v.prefixo) || "Viatura #" + v.id}${v.placa ? " — " + escapeHtml(v.placa) : ""}</div>

    ${renderDocumentosListHTML(v)}

    <div class="section-label" style="margin-top:16px;">Adicionar Documento</div>
    <div class="modal-grid">
      <div class="modal-field">
        <label>Tipo de Documento</label>
        <input type="text" id="doc-tipo" list="doc-tipo-sugestoes" placeholder="Ex: CRLV, Termo de Entrega...">
        <datalist id="doc-tipo-sugestoes">${datalistOptions}</datalist>
      </div>
      <div class="modal-field">
        <label>Arquivo (PDF ou imagem)</label>
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" id="doc-file-input">
      </div>
    </div>
    <span id="doc-status" style="font-family:var(--font-mono);font-size:10.5px;color:var(--t-paramirim);"></span>

    <div class="modal-actions">
      <button class="ef-btn primary" id="doc-close-btn">Fechar</button>
    </div>
  `);

  document.getElementById("doc-close-btn").addEventListener("click", closeModal);
  document.getElementById("doc-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const tipoDocumento = document.getElementById("doc-tipo").value.trim();
    if (file) uploadDocumento(viaturaId, tipoDocumento, file);
  });
  document.querySelectorAll(".btn-remove-doc").forEach((btn) => {
    btn.addEventListener("click", () => {
      const did = Number(btn.closest(".anexo-item").dataset.did);
      removeDocumento(viaturaId, did);
    });
  });
}

function openViewManutModal(viaturaId, mid) {
  const v = frota.find((x) => x.id === viaturaId);
  const m = v && (v.manutencoes || []).find((x) => x.id === mid);
  if (!m) return;
  const updates = [...(m.atualizacoes || [])].sort((a, b) => new Date(a.data) - new Date(b.data));
  const updatesHtml = updates.length
    ? `<div class="timeline">${updates.map((u) => `
        <div class="timeline-item">
          <div class="timeline-date">${fmtDateBR(u.data)}</div>
          <div class="timeline-text">${escapeHtml(u.texto)}</div>
        </div>`).join("")}</div>`
    : `<div class="timeline-empty">Nenhuma atualização registrada.</div>`;

  openModal(`
    <div class="modal-title">Detalhes da Ocorrência</div>
    <div class="modal-subtitle">${escapeHtml(v.prefixo) || "Viatura #" + v.id}${v.placa ? " — " + escapeHtml(v.placa) : ""}</div>
    <div class="view-row"><div class="k">Data</div><div class="v">${fmtDateBR(m.data)}</div></div>
    <div class="view-row"><div class="k">KM</div><div class="v">${formatKm(m.km)}</div></div>
    <div class="view-row"><div class="k">Oficina</div><div class="v">${escapeHtml(m.oficina) || "—"}</div></div>
    <div class="view-row"><div class="k">Tipo de Serviço</div><div class="v">${escapeHtml(m.tipoServico) || "—"}</div></div>
    <div class="view-row"><div class="k">Descrição</div><div class="v">${escapeHtml(m.descricao) || "—"}</div></div>
    <div class="view-row"><div class="k">Processo SEI</div><div class="v">${escapeHtml(m.processoSei) || "—"}</div></div>

    <div class="section-label" style="margin-top:18px;">Anexos (PDF ou imagem)</div>
    ${renderAnexosListHTML(m)}
    <div class="anexo-upload">
      <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" id="anexo-file-input">
      <span id="anexo-status"></span>
    </div>

    <div class="section-label" style="margin-top:18px;">Linha do Tempo de Atualizações</div>
    ${updatesHtml}
    <div class="modal-actions">
      <button class="ef-btn primary" id="view-close-btn">Fechar</button>
    </div>
  `);
  document.getElementById("view-close-btn").addEventListener("click", closeModal);

  const fileInput = document.getElementById("anexo-file-input");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) uploadAnexo(viaturaId, mid, file);
    });
  }
  document.querySelectorAll(".btn-remove-anexo").forEach((btn) => {
    btn.addEventListener("click", () => {
      const aid = Number(btn.closest(".anexo-item").dataset.aid);
      removeAnexo(viaturaId, mid, aid);
    });
  });
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
  if (e.target.classList.contains("field-categoria")) v.categoria = e.target.value;
  if (e.target.classList.contains("field-caracterizacao")) v.caracterizacao = e.target.value;
  if (e.target.classList.contains("field-status")) v.status = e.target.value;
  if (e.target.classList.contains("field-km")) {
    v.km = parseKm(e.target.value);
    e.target.value = formatKm(v.km);
  }
  persist();
  renderPainel();
  renderManutencaoSelect();
  document.getElementById("frota-info").textContent = `${frota.length} viatura(s) cadastrada(s)`;
});

document.getElementById("frota-tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const id = Number(tr.dataset.id);

  if (e.target.closest(".btn-docs-viatura")) {
    openVehicleDocsModal(id);
    return;
  }
  if (e.target.closest(".btn-remove-viatura")) {
    frota = frota.filter((v) => v.id !== id);
    persist();
    renderAll();
  }
});

document.getElementById("btn-add-viatura").addEventListener("click", () => {
  const nextId = Math.max(0, ...frota.map((v) => v.id)) + 1;
  frota.push({ id: nextId, prefixo: "", placa: "", modelo: "", categoria: "Automóvel", caracterizacao: "Caracterizada", status: "em_uso", km: 0, manutencoes: [], documentos: [] });
  persist();
  renderAll();
});

/* ---------------------------------------------------------
   Event delegation — Manutenção
--------------------------------------------------------- */

document.getElementById("manut-tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr || !tr.dataset.mid) return;
  const mid = Number(tr.dataset.mid);
  const v = getSelectedViatura();
  if (!v) return;

  if (e.target.closest(".btn-edit-manut")) {
    openEditManutModal(v.id, mid);
    return;
  }
  if (e.target.closest(".btn-add-update")) {
    openAddUpdateModal(v.id, mid);
    return;
  }
  if (e.target.closest(".btn-view-manut")) {
    openViewManutModal(v.id, mid);
    return;
  }
  if (e.target.closest(".btn-remove-manut")) {
    v.manutencoes = (v.manutencoes || []).filter((m) => m.id !== mid);
    persist();
    renderManutencaoHistorico();
    renderFrota();
    renderPainel();
  }
});

document.getElementById("manut-desc").addEventListener("input", (e) => autoGrow(e.target));

document.getElementById("btn-add-manut").addEventListener("click", () => {
  const v = getSelectedViatura();
  if (!v) return;
  const data = document.getElementById("manut-data").value;
  const km = parseKm(document.getElementById("manut-km").value);
  const oficina = document.getElementById("manut-oficina").value.trim();
  const tipoServico = document.getElementById("manut-tipo-servico").value;
  const descricao = document.getElementById("manut-desc").value.trim();
  const processoSei = document.getElementById("manut-sei").value.trim();
  const indisponivel = document.getElementById("manut-indisponivel").checked;
  if (!data || !descricao) {
    alert("Preencha ao menos a data e a descrição.");
    return;
  }
  const nextMid = Math.max(0, ...(v.manutencoes || []).map((m) => m.id)) + 1;
  v.manutencoes = v.manutencoes || [];
  v.manutencoes.push({ id: nextMid, data, km, oficina, tipoServico, descricao, processoSei, indisponivel, atualizacoes: [] });
  document.getElementById("manut-data").value = "";
  document.getElementById("manut-km").value = "";
  document.getElementById("manut-oficina").value = "";
  document.getElementById("manut-desc").value = "";
  autoGrow(document.getElementById("manut-desc"));
  document.getElementById("manut-sei").value = "";
  document.getElementById("manut-indisponivel").checked = false;
  persist();
  renderManutencaoHistorico();
  renderManutencaoSelect();
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
function migrarDadosLegados() {
  let mudou = false;
  frota.forEach((v) => {
    if (!CATEGORIAS_VIATURA.includes(v.categoria)) { v.categoria = "Automóvel"; mudou = true; }
    if (!CARACTERIZACAO_VIATURA.includes(v.caracterizacao)) { v.caracterizacao = "Caracterizada"; mudou = true; }
    if (!Array.isArray(v.manutencoes)) { v.manutencoes = []; mudou = true; }
    if (!Array.isArray(v.documentos)) { v.documentos = []; mudou = true; }
    v.manutencoes.forEach((m) => {
      if (!Array.isArray(m.atualizacoes)) { m.atualizacoes = []; mudou = true; }
      if (!Array.isArray(m.anexos)) { m.anexos = []; mudou = true; }
      if (typeof m.indisponivel !== "boolean") { m.indisponivel = false; mudou = true; }
    });
  });
  return mudou;
}

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
  if (migrarDadosLegados()) {
    await saveToCloud({ viaturas: frota });
  }
  renderAll();
})();
