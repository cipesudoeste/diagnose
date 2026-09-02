/* ============================================================
   CENTRAL DE OFÍCIOS — lógica (vanilla JS, sem build/framework)
   ============================================================ */

let sb = null;
try {
  if (window.supabase && SUPABASE_URL && !SUPABASE_URL.includes("SEU-PROJETO")) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase não inicializado:", e);
}

let oficios = [];          // linhas da tabela `oficios`
let oficiosPoliciais = [];  // linhas da tabela `oficios_policiais`
let filaItems = [];          // linhas da tabela `oficios_fila`

let agendaFilter = "";
let agendaSortField = "data";
let agendaSortDir = 1;
let historicoFilter = "";

/* ---------------------------------------------------------
   Upload de novo ofício + fila de processamento
--------------------------------------------------------- */
const BUCKET_OFICIOS = "oficios-anexos";

function sanitizarNomeArquivo(nome) {
  return nome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");                  // troca o resto por "_"
}

document.getElementById("btn-upload").addEventListener("click", async () => {
  const input = document.getElementById("upload-input");
  const file = input.files[0];
  if (!file) { alert("Escolha um arquivo PDF primeiro."); return; }
  if (file.type !== "application/pdf") { alert("Envie um arquivo PDF."); return; }

  const btn = document.getElementById("btn-upload");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  const path = `${Date.now()}_${sanitizarNomeArquivo(file.name)}`;
  const { error: errUpload } = await sb.storage.from(BUCKET_OFICIOS).upload(path, file);
  if (errUpload) {
    console.error(errUpload);
    alert("Erro ao enviar o arquivo. Veja o console para detalhes.");
    btn.disabled = false;
    btn.textContent = "Enviar";
    return;
  }

  const { error: errFila } = await sb.from("oficios_fila").insert({
    nome_arquivo: file.name,
    storage_path: path,
  });
  if (errFila) {
    console.error(errFila);
    alert("Arquivo enviado, mas houve erro ao registrar na fila. Avise o suporte.");
  }

  input.value = "";
  btn.disabled = false;
  btn.textContent = "Enviar";
  await carregarFila();
});

const STATUS_FILA_LABEL = {
  aguardando: ["Aguardando processamento", "mid"],
  processando: ["Processando…", "mid"],
  concluido: ["Concluído", "ok"],
  erro: ["Erro", "bad"],
};

async function carregarFila() {
  if (!sb) return;
  const { data, error } = await sb.from("oficios_fila").select("*").order("criado_em", { ascending: false }).limit(8);
  if (error) { console.error(error); return; }
  filaItems = data || [];
  renderFila();
}

function renderFila() {
  const el = document.getElementById("fila-lista");
  const ativos = filaItems.filter((f) => f.status !== "concluido");
  if (!ativos.length) { el.innerHTML = ""; return; }

  el.innerHTML = ativos.map((f) => {
    const [label, cls] = STATUS_FILA_LABEL[f.status] || [f.status, "mid"];
    return `
      <div class="fila-item">
        <span class="fila-nome">${escapeHtml(f.nome_arquivo)}</span>
        <span class="badge-status ${cls}" ${f.status === "erro" ? `title="${escapeHtml(f.mensagem_erro || "")}"` : ""}>${label}</span>
      </div>`;
  }).join("");
}

/* ---------------------------------------------------------
   Carregamento
--------------------------------------------------------- */
async function carregarTudo() {
  if (!sb) return;
  const [{ data: ofs, error: e1 }, { data: ops, error: e2 }] = await Promise.all([
    sb.from("oficios").select("*").order("data_audiencia", { ascending: true }),
    sb.from("oficios_policiais").select("*"),
  ]);
  if (e1 || e2) { console.error(e1 || e2); return; }
  oficios = ofs || [];
  oficiosPoliciais = ops || [];
  renderAll();
}

function oficioPorId(id) {
  return oficios.find((o) => o.id === id);
}

function renderAll() {
  renderPendencias();
  renderHistorico();
  renderAgenda();
}

/* ---------------------------------------------------------
   Utilidades de texto (idênticas ao gerador.py do backend)
--------------------------------------------------------- */
const MESES = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function dataPorExtenso(dataIso) {
  if (!dataIso) return "____";
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return `${String(dia).padStart(2, "0")} de ${MESES[mes]} de ${ano}`;
}
function nomeMes(dataIso) {
  if (!dataIso) return "____";
  return MESES[Number(dataIso.split("-")[1])];
}
function formatarMatricula(m) {
  if (!m) return "";
  m = String(m);
  if (m.length >= 8) {
    return `${m.slice(0, 2)}.${m.slice(2, 5)}.${m.slice(5, 8)}` + (m.slice(8) ? `-${m.slice(8)}` : "");
  }
  return m;
}
function saudacao(genero) {
  if (genero === "feminino") return ["Excelentíssima Senhora Juíza", "Juíza"];
  if (genero === "masculino") return ["Excelentíssimo Senhor Juiz", "Juiz"];
  return ["Excelentíssimo(a) Senhor(a) Juiz(a)", "Juiz(a)"];
}
function assuntoTexto(dadosOficio) {
  const a = (dadosOficio.assunto || "").toLowerCase();
  if (a.includes("julgamento")) return "Apresentação de Policial Militar para Audiência de Instrução e Julgamento.";
  return "Apresentação de Policial Militar para Audiência de Instrução.";
}

function blocoApresentar(apresentar, dadosOficio) {
  const linhas = apresentar.map((r) =>
    `| ${r.policial.posto} | ${r.policial.nome} | ${formatarMatricula(r.policial.matricula)} | ${r.policial.telefone1 || "(a preencher)"} |`
  ).join("\n");

  const modalidade = dadosOficio.modalidade;
  const formaParticipacao = modalidade === "videoconferencia"
    ? "para fins de participação remota na audiência designada, mediante acesso à sala de audiência virtual, por meio do link disponibilizado pelo TJBA (AUDINPlay):"
    : "para fins de participação na audiência designada:";

  const abertura = `Em atenção ao Processo nº ${dadosOficio.processo_numero || "____"}, oriundo dessa ${dadosOficio.vara || "____"} da Comarca de ${dadosOficio.comarca || "____"}, apresento a V. Ex.ª o(s) Policial(is) Militar(es) abaixo relacionado(s), pertencente(s) a esta UOE, ${formaParticipacao}`;

  let tabela = `\n| GH | NOME | MATRÍCULA | WHATSAPP |\n|---|---|---|---|\n${linhas}\n\n| Data: | ${dataPorExtenso(dadosOficio.data_audiencia)} |\n| Horário: | ${dadosOficio.hora_audiencia || "____"} |\n| Modalidade: | ${modalidade === "videoconferencia" ? "Virtual" : "Presencial"} |`;
  if (modalidade === "videoconferencia") {
    tabela += `\n| Link: | ${dadosOficio.link_videoconferencia || "(link a inserir)"} |`;
  }
  return abertura + "\n" + tabela;
}

function paragrafoFerias(item, dataAudiencia) {
  const p = item.policial;
  return `Outrossim, informo a impossibilidade de apresentação do(a) ${p.posto} ${p.nome}, matrícula nº ${formatarMatricula(p.matricula)}, em razão de encontrar-se em gozo de férias regulamentares no mês de ${nomeMes(dataAudiencia)}.`;
}

function paragrafoNaoPertence(item, unidadeDestino) {
  const identificacao = `${item.posto_mencionado ? item.posto_mencionado + " " : ""}${item.nome_oficio}`;
  let partes = [
    `Outrossim, informo a impossibilidade de apresentação de ${identificacao}, matrícula nº ${item.matricula_oficio || "____"}, por não mais pertencer ao efetivo desta UOE, encontrando-se atualmente lotado na ${unidadeDestino.nome}` +
    (unidadeDestino.endereco ? `, situado na ${unidadeDestino.endereco}.` : "."),
  ];
  if (unidadeDestino.email || unidadeDestino.telefone) {
    let contatos = "Para eventuais providências, seguem os contatos da referida Unidade:\n";
    if (unidadeDestino.email) contatos += `E-mail: ${unidadeDestino.email}\n`;
    if (unidadeDestino.telefone) contatos += `Telefone: ${unidadeDestino.telefone}`;
    partes.push(contatos);
  }
  return partes.join("\n\n");
}

function gerarOficioResposta(dadosOficio, cruzamento, unidadesDestino) {
  unidadesDestino = unidadesDestino || {};
  const apresentar = cruzamento.filter((r) => r.status === "apresentar");
  const deFerias = cruzamento.filter((r) => r.status === "ferias");
  const naoEncontrados = cruzamento.filter((r) => r.status === "nao_encontrado");

  const [vocativo, tituloJuiz] = saudacao(dadosOficio.juiz_genero);
  const genero = dadosOficio.juiz_genero;

  let partes = [
    "GOVERNO DO ESTADO DA BAHIA\nPOLÍCIA MILITAR DA BAHIA - PMBA\nCOMPANHIA INDEPENDENTE DE POLICIAMENTO ESPECIALIZADO SUDOESTE - PMBA/CIPE-SUDOESTE",
    "Oficio nº {{NUMERO_SEI}}/SRHS - PMBA/CIPE-SUDOESTE",
    `Vitória da Conquista/BA, ${dataPorExtenso(new Date().toISOString().slice(0, 10))}.`,
    `Assunto: ${assuntoTexto(dadosOficio)}`,
    `${vocativo},`,
  ];

  if (apresentar.length) partes.push(blocoApresentar(apresentar, dadosOficio));
  for (const r of deFerias) partes.push(paragrafoFerias(r, dadosOficio.data_audiencia));
  for (const r of naoEncontrados) partes.push(paragrafoNaoPertence(r, unidadesDestino[r.nome_oficio]));

  partes.push("Respeitosamente,");
  partes.push("GILBERTO JOSÉ DA SILVA FILHO - MAJ PM\nComandante");

  const cabecalhoDestinatario = genero === "feminino" ? "À Excelentíssima Senhora"
    : genero === "masculino" ? "Ao Excelentíssimo Senhor"
    : "A Sua Excelência o(a) Senhor(a)";

  let enderecoBloco = [
    cabecalhoDestinatario,
    `${tituloJuiz} de Direito ${dadosOficio.juiz_nome || "____"}`,
    `${dadosOficio.vara || "____"} da Comarca de ${dadosOficio.comarca || "____"}`,
  ];
  if (dadosOficio.endereco_forum) enderecoBloco.push(dadosOficio.endereco_forum);
  if (dadosOficio.telefone_forum) enderecoBloco.push(`Fone: ${dadosOficio.telefone_forum}`);
  enderecoBloco.push(`${dadosOficio.comarca || "____"}/BA`);
  partes.push(enderecoBloco.join("\n"));

  return partes.join("\n\n");
}

/* ---------------------------------------------------------
   Render — Pendências
--------------------------------------------------------- */
function renderPendencias() {
  const pendentes = oficiosPoliciais.filter(
    (p) => (p.status === "nao_encontrado" || p.status === "ambiguo") && !p.unidade_destino_nome
  );

  const badge = document.getElementById("count-pendencias");
  if (pendentes.length) {
    badge.textContent = pendentes.length;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }

  const tbody = document.getElementById("pendencias-tbody");
  if (!pendentes.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);padding:20px;">Nenhuma pendência no momento.</td></tr>`;
    return;
  }

  tbody.innerHTML = pendentes.map((p) => {
    const of = oficioPorId(p.oficio_id) || {};
    return `
      <tr>
        <td data-label="Ofício (origem)">${escapeHtml(of.comarca || "—")} · Proc. ${escapeHtml(of.processo_numero || "—")}</td>
        <td data-label="Policial citado">${escapeHtml(p.posto_mencionado || "")} ${escapeHtml(p.nome_oficio || "")}</td>
        <td data-label="Matrícula">${escapeHtml(p.matricula_oficio || "—")}</td>
        <td class="cell-actions" data-label="">
          <button class="ef-btn primary btn-resolver" data-pendencia-id="${p.id}">Resolver</button>
        </td>
      </tr>`;
  }).join("");
}

document.getElementById("pendencias-tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-resolver");
  if (!btn) return;
  const pendencia = oficiosPoliciais.find((p) => p.id === Number(btn.dataset.pendenciaId));
  if (pendencia) abrirModalResolver(pendencia);
});

function abrirModalResolver(pendencia) {
  const of = oficioPorId(pendencia.oficio_id) || {};
  openModal(`
    <h3 style="margin:0 0 4px;">Resolver pendência</h3>
    <p style="margin:0 0 16px;color:var(--ink-faint);font-size:13px;">
      ${escapeHtml(pendencia.posto_mencionado || "")} ${escapeHtml(pendencia.nome_oficio || "")}
      — matrícula ${escapeHtml(pendencia.matricula_oficio || "—")}
      — Ofício de ${escapeHtml(of.comarca || "—")}, Proc. ${escapeHtml(of.processo_numero || "—")}
    </p>
    <div class="resolver-form">
      <label>Unidade de destino (nome)<input type="text" id="rf-nome" placeholder="ex: COMPANHIA INDEPENDENTE DE POLÍCIA FAZENDÁRIA – CIPFAZ"></label>
      <label>Endereço<input type="text" id="rf-endereco" placeholder="opcional"></label>
      <label>E-mail<input type="text" id="rf-email" placeholder="opcional"></label>
      <label>Telefone<input type="text" id="rf-telefone" placeholder="opcional"></label>
      <button class="ef-btn primary" id="btn-salvar-resolucao" data-pendencia-id="${pendencia.id}">Salvar e gerar ofício (se for a última pendência)</button>
    </div>
  `);
}

document.getElementById("modal-content").addEventListener("click", async (e) => {
  const btn = e.target.closest("#btn-salvar-resolucao");
  if (!btn) return;

  const nome = document.getElementById("rf-nome").value.trim();
  if (!nome) { alert("Informe pelo menos o nome da unidade de destino."); return; }
  const endereco = document.getElementById("rf-endereco").value.trim();
  const email = document.getElementById("rf-email").value.trim();
  const telefone = document.getElementById("rf-telefone").value.trim();
  const pendenciaId = Number(btn.dataset.pendenciaId);
  const pendencia = oficiosPoliciais.find((p) => p.id === pendenciaId);

  const { error } = await sb.from("oficios_policiais").update({
    unidade_destino_nome: nome,
    unidade_destino_endereco: endereco || null,
    unidade_destino_email: email || null,
    unidade_destino_telefone: telefone || null,
    resolvido_em: new Date().toISOString(),
  }).eq("id", pendenciaId);

  if (error) { console.error(error); alert("Erro ao salvar a resolução."); return; }

  // Atualiza estado local
  Object.assign(pendencia, {
    unidade_destino_nome: nome, unidade_destino_endereco: endereco,
    unidade_destino_email: email, unidade_destino_telefone: telefone,
  });

  await tentarGerarOficio(pendencia.oficio_id);
  closeModal();
  await carregarTudo();
});

/* ---------------------------------------------------------
   Geração automática quando não há mais pendência
--------------------------------------------------------- */
async function tentarGerarOficio(oficioId) {
  const linhas = oficiosPoliciais.filter((p) => p.oficio_id === oficioId);
  const aindaPendente = linhas.some(
    (p) => (p.status === "nao_encontrado" || p.status === "ambiguo") && !p.unidade_destino_nome
  );
  if (aindaPendente) return; // outras pendências ainda faltam nesse mesmo ofício

  const of = oficioPorId(oficioId);
  if (!of) return;

  // Busca os dados do(s) policial(is) "apresentar"/"ferias" na tabela `policiais`
  const matriculas = linhas.filter((p) => p.matricula).map((p) => p.matricula);
  let policiaisPorMatricula = {};
  if (matriculas.length) {
    const { data } = await sb.from("policiais").select("matricula, nome, posto, telefone1").in("matricula", matriculas);
    (data || []).forEach((p) => (policiaisPorMatricula[p.matricula] = p));
  }

  const cruzamento = linhas.map((p) => ({
    nome_oficio: p.nome_oficio,
    matricula_oficio: p.matricula_oficio,
    posto_mencionado: p.posto_mencionado,
    status: p.status,
    policial: p.matricula ? policiaisPorMatricula[p.matricula] : undefined,
  }));

  const unidadesDestino = {};
  linhas.forEach((p) => {
    if (p.status === "nao_encontrado" && p.unidade_destino_nome) {
      unidadesDestino[p.nome_oficio] = {
        nome: p.unidade_destino_nome,
        endereco: p.unidade_destino_endereco,
        email: p.unidade_destino_email,
        telefone: p.unidade_destino_telefone,
      };
    }
  });

  const texto = gerarOficioResposta(of, cruzamento, unidadesDestino);

  const { error } = await sb.from("oficios").update({
    status: "pronto",
    texto_resposta: texto,
    updated_at: new Date().toISOString(),
  }).eq("id", oficioId);
  if (error) console.error(error);
}

/* ---------------------------------------------------------
   Render — Histórico
--------------------------------------------------------- */
const STATUS_LABEL = { pendente: ["Pendente", "mid"], pronto: ["Pronto", "ok"], enviado: ["Enviado", "ok"] };

function renderHistorico() {
  let lista = oficios;
  if (historicoFilter.trim()) {
    const q = normalizarStr(historicoFilter);
    lista = lista.filter((o) =>
      normalizarStr(o.comarca).includes(q) ||
      normalizarStr(o.processo_numero).includes(q) ||
      normalizarStr(o.numero_oficio).includes(q)
    );
  }

  document.getElementById("historico-info").textContent =
    historicoFilter.trim() ? `${lista.length} de ${oficios.length} ofícios` : `${oficios.length} ofícios`;

  const tbody = document.getElementById("historico-tbody");
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:20px;">Nenhum ofício processado ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = [...lista].reverse().map((o) => {
    const [label, cls] = STATUS_LABEL[o.status] || [o.status, "mid"];
    return `
      <tr>
        <td data-label="Comarca">${escapeHtml(o.comarca || "—")}</td>
        <td data-label="Processo">${escapeHtml(o.processo_numero || "—")}</td>
        <td data-label="Data audiência">${o.data_audiencia ? new Date(o.data_audiencia + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
        <td data-label="Status"><span class="badge-status ${cls}">${label}</span></td>
        <td class="cell-actions" data-label="">
          <button class="icon-btn btn-ver-texto" title="Ver ofício de resposta" data-oficio-id="${o.id}" ${o.texto_resposta ? "" : "disabled"}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
          </button>
        </td>
      </tr>`;
  }).join("");
}

document.getElementById("historico-search").addEventListener("input", (e) => {
  historicoFilter = e.target.value;
  renderHistorico();
});

document.getElementById("historico-tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-ver-texto");
  if (!btn) return;
  const of = oficioPorId(Number(btn.dataset.oficioId));
  if (of) abrirModalTexto(of);
});

function abrirModalTexto(of) {
  const id = `texto-${of.id}`;
  openModal(`
    <h3 style="margin:0 0 12px;">Ofício de resposta — ${escapeHtml(of.comarca || "")}</h3>
    <textarea readonly style="width:100%;min-height:320px;font-family:var(--font-mono);font-size:12.5px;
      background:var(--panel-2,#241f18);color:var(--ink,#e8e4d8);border:1px solid var(--line,#3a362b);
      border-radius:6px;padding:12px;" id="${id}">${escapeHtml(of.texto_resposta || "")}</textarea>
    <div style="margin-top:12px;display:flex;justify-content:flex-end;">
      <button class="ef-btn primary" id="btn-copiar-texto" data-target="${id}">Copiar texto</button>
    </div>
  `);
}

document.getElementById("modal-content").addEventListener("click", (e) => {
  const btn = e.target.closest("#btn-copiar-texto");
  if (!btn) return;
  const textarea = document.getElementById(btn.dataset.target);
  textarea.select();
  navigator.clipboard.writeText(textarea.value).then(() => {
    btn.textContent = "Copiado!";
    setTimeout(() => (btn.textContent = "Copiar texto"), 1500);
  });
});

/* ---------------------------------------------------------
   Render — Agenda
--------------------------------------------------------- */
function normalizarStr(s) {
  return (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const STATUS_AGENDA_LABEL = {
  apresentar: ["A apresentar", "ok"],
  ferias: ["De férias", "mid"],
  nao_encontrado: ["Pendência", "bad"],
  ambiguo: ["Pendência", "bad"],
};

function getAgendaVisivel() {
  let lista = oficiosPoliciais.map((p) => ({ ...p, oficio: oficioPorId(p.oficio_id) }));

  if (agendaFilter.trim()) {
    const q = normalizarStr(agendaFilter);
    lista = lista.filter((p) => normalizarStr(p.nome_oficio).includes(q) || normalizarStr(p.matricula_oficio).includes(q));
  }

  lista.sort((a, b) => {
    let va, vb;
    if (agendaSortField === "data") { va = a.oficio?.data_audiencia || ""; vb = b.oficio?.data_audiencia || ""; }
    else if (agendaSortField === "nome") { va = normalizarStr(a.nome_oficio); vb = normalizarStr(b.nome_oficio); }
    else { va = a.status; vb = b.status; }
    if (va < vb) return -1 * agendaSortDir;
    if (va > vb) return 1 * agendaSortDir;
    return 0;
  });

  return lista;
}

function renderAgenda() {
  const visivel = getAgendaVisivel();
  document.getElementById("agenda-info").textContent =
    agendaFilter.trim() ? `${visivel.length} de ${oficiosPoliciais.length} registros` : `${oficiosPoliciais.length} registros`;

  document.querySelectorAll("#agenda-table th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === agendaSortField) th.classList.add(agendaSortDir === 1 ? "sort-asc" : "sort-desc");
  });

  const tbody = document.getElementById("agenda-tbody");
  if (!visivel.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);padding:20px;">Nada encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = visivel.map((p) => {
    const [label, cls] = STATUS_AGENDA_LABEL[p.status] || [p.status, "mid"];
    const dataFmt = p.oficio?.data_audiencia
      ? new Date(p.oficio.data_audiencia + "T00:00:00").toLocaleDateString("pt-BR")
      : "—";
    return `
      <tr>
        <td data-label="Data">${dataFmt} ${p.oficio?.hora_audiencia ? "· " + escapeHtml(p.oficio.hora_audiencia) : ""}</td>
        <td data-label="Policial">${escapeHtml(p.posto_mencionado || "")} ${escapeHtml(p.nome_oficio || "")}</td>
        <td data-label="Comarca">${escapeHtml(p.oficio?.comarca || "—")}</td>
        <td data-label="Situação"><span class="badge-status ${cls}">${label}</span></td>
      </tr>`;
  }).join("");
}

document.getElementById("agenda-search").addEventListener("input", (e) => {
  agendaFilter = e.target.value;
  renderAgenda();
});
document.querySelector("#agenda-table thead").addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const field = th.dataset.sort;
  if (agendaSortField === field) agendaSortDir *= -1;
  else { agendaSortField = field; agendaSortDir = 1; }
  renderAgenda();
});

/* ---------------------------------------------------------
   Modal genérico + abas + utilidades
--------------------------------------------------------- */
function openModal(html) {
  document.getElementById("modal-content").innerHTML = html;
  document.getElementById("modal-overlay").style.display = "flex";
}
function closeModal() {
  document.getElementById("modal-overlay").style.display = "none";
}
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") closeModal();
});

function escapeHtml(s) {
  return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

document.querySelectorAll(".ef-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ef-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".ef-section").forEach((s) => s.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("sec-" + tab.dataset.tab).classList.add("active");
  });
});

/* ---------------------------------------------------------
   Inicialização
--------------------------------------------------------- */
carregarTudo();
carregarFila();

// Enquanto houver algo na fila que não seja "concluido", continua
// checando periodicamente (upload feito, aguardando o watcher.py
// processar no seu computador).
setInterval(async () => {
  await carregarFila();
  const temAtivo = filaItems.some((f) => f.status === "aguardando" || f.status === "processando");
  if (temAtivo) await carregarTudo();
}, 8000);