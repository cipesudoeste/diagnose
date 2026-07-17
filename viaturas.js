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

  const emManutencaoRows = frota.filter((v) => v.status === "manutencao").map((v) => `
    <tr>
      <td data-label="Prefixo">${escapeHtml(v.prefixo) || "—"}</td>
      <td data-label="Modelo">${escapeHtml(v.modelo) || "—"}</td>
      <td data-label="Categoria">${escapeHtml(v.categoria) || "—"}</td>
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
      <td data-label="Categoria">${escapeHtml(v.categoria) || "—"}</td>
      <td data-label="Caracterização">${escapeHtml(v.caracterizacao) || "—"}</td>
      <td data-label="Status"><span class="badge-status ${STATUS_CLS[v.status] || "mid"}">${STATUS_LABEL[v.status] || v.status}</span></td>
      <td class="num" data-label="KM">${v.km || 0}</td>
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
let selectedViaturaId = null;

function renderManutencaoSelect() {
  if (!frota.some((v) => v.id === selectedViaturaId)) {
    selectedViaturaId = frota.length ? frota[0].id : null;
  }

  const grid = document.getElementById("manut-select-cards");
  grid.innerHTML = frota.length ? frota.map((v) => {
    const nOcorr = (v.manutencoes || []).length;
    return `
    <button class="vehicle-card${v.id === selectedViaturaId ? " active" : ""}" data-vid="${v.id}" type="button">
      <div class="vc-prefixo">${escapeHtml(v.prefixo) || "Viatura #" + v.id}</div>
      <div class="vc-placa">${escapeHtml(v.placa) || "sem placa"}</div>
      <div class="vc-meta">${escapeHtml(v.modelo) || "—"} · ${escapeHtml(v.categoria) || "—"}</div>
      <div class="vc-foot">
        <span class="badge-status ${STATUS_CLS[v.status] || "mid"}">${STATUS_LABEL[v.status] || v.status}</span>
        <span class="vc-ocorrencias">${nOcorr} ocorrência${nOcorr === 1 ? "" : "s"}</span>
      </div>
    </button>`;
  }).join("") : `<div class="vehicle-card-empty">Nenhuma viatura cadastrada.</div>`;

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
      <td class="num" data-label="KM">${m.km || 0}</td>
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
      <div class="modal-field"><label>KM</label><input type="number" id="edit-km" value="${m.km || 0}"></div>
      <div class="modal-field"><label>Oficina</label><input type="text" id="edit-oficina" value="${escapeHtml(m.oficina)}"></div>
      <div class="modal-field"><label>Tipo de Serviço</label>
        <select id="edit-tipo">${TIPOS_SERVICO.map((t) => `<option value="${t}" ${t === m.tipoServico ? "selected" : ""}>${t}</option>`).join("")}</select>
      </div>
      <div class="modal-field" style="grid-column:1/-1;"><label>Descrição</label><input type="text" id="edit-desc" value="${escapeHtml(m.descricao)}"></div>
      <div class="modal-field" style="grid-column:1/-1;"><label>Processo SEI</label><input type="text" id="edit-sei" value="${escapeHtml(m.processoSei)}"></div>
    </div>
    <div class="modal-actions">
      <button class="ef-btn" id="edit-cancel-btn">Cancelar</button>
      <button class="ef-btn primary" id="edit-save-btn">Salvar Alterações</button>
    </div>
  `);
  document.getElementById("edit-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("edit-save-btn").addEventListener("click", () => {
    m.data = document.getElementById("edit-data").value;
    m.km = Number(document.getElementById("edit-km").value) || 0;
    m.oficina = document.getElementById("edit-oficina").value.trim();
    m.tipoServico = document.getElementById("edit-tipo").value;
    m.descricao = document.getElementById("edit-desc").value.trim();
    m.processoSei = document.getElementById("edit-sei").value.trim();
    persist();
    renderManutencaoHistorico();
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
    <div class="view-row"><div class="k">KM</div><div class="v">${m.km || 0}</div></div>
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
  frota.push({ id: nextId, prefixo: "", placa: "", modelo: "", categoria: "Automóvel", caracterizacao: "Caracterizada", status: "em_uso", km: 0, manutencoes: [] });
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
  v.manutencoes.push({ id: nextMid, data, km, oficina, tipoServico, descricao, processoSei, atualizacoes: [] });
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
