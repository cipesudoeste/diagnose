/* ============================================================
   CADASTRO DE INGRESSANTES — lógica (vanilla JS)
   ============================================================ */

const TOTAL_STEPS = 8; // 0..7
let currentStep = 0;
let uploadedCnh = null; // {url, path, nome, tamanho}
let uploadedBgo = null;

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

function escapeHtml(s) {
  return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtDateBR(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 7 ? iso + "-01T00:00:00" : iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return iso.length === 7
    ? d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
    : d.toLocaleDateString("pt-BR");
}
function formatBytes(n) {
  if (!n) return "0 KB";
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/* ---------------------------------------------------------
   Busca por matrícula (consulta a base do Efetivo)
--------------------------------------------------------- */
async function buscarMatricula() {
  const matricula = document.getElementById("c-busca-matricula").value.trim();
  const resultEl = document.getElementById("busca-resultado");
  if (!matricula) {
    resultEl.textContent = "Digite a matrícula antes de buscar.";
    resultEl.className = "wf-search-result notfound";
    return;
  }
  if (!sb) {
    resultEl.textContent = "Busca indisponível no momento — preencha os campos manualmente.";
    resultEl.className = "wf-search-result notfound";
    return;
  }
  resultEl.textContent = "Buscando...";
  resultEl.className = "wf-search-result";
  try {
    const { data, error } = await sb.from("painel_data").select("roster").eq("id", 1).maybeSingle();
    if (error) throw error;
    const roster = (data && data.roster) || [];
    const found = roster.find((r) => (r.matricula || "").replace(/\D/g, "") === matricula.replace(/\D/g, ""));
    if (found) {
      document.getElementById("c-nome").value = found.nome || "";
      document.getElementById("c-matricula").value = found.matricula || matricula;
      const ghSel = document.getElementById("c-gh");
      if (found.posto && [...ghSel.options].some((o) => o.value === found.posto)) {
        ghSel.value = found.posto;
      }
      resultEl.textContent = `Encontramos: ${found.nome} (${found.posto}). Nome e GH preenchidos automaticamente — confira e complete o restante.`;
      resultEl.className = "wf-search-result ok";
    } else {
      document.getElementById("c-matricula").value = matricula;
      resultEl.textContent = "Não encontramos seus dados na base. Preencha todos os campos manualmente.";
      resultEl.className = "wf-search-result notfound";
    }
  } catch (e) {
    console.error(e);
    resultEl.textContent = "Erro ao buscar. Preencha os campos manualmente.";
    resultEl.className = "wf-search-result notfound";
  }
}
document.getElementById("btn-buscar-matricula").addEventListener("click", buscarMatricula);

/* ---------------------------------------------------------
   Campos condicionais (data-show-if="id=valor")
--------------------------------------------------------- */
function updateConditionals() {
  document.querySelectorAll(".wf-cond").forEach((el) => {
    const cond = el.dataset.showIf;
    if (!cond) return;
    const [fieldId, expected] = cond.split("=");
    const field = document.getElementById(fieldId);
    const visible = field && field.value === expected;
    el.classList.toggle("wf-visible", !!visible);
    // campos escondidos não devem bloquear validação
    const input = el.querySelector("input, select, textarea");
    if (input) input.dataset.condHidden = visible ? "" : "1";
  });
}
document.getElementById("wiz-form").addEventListener("change", (e) => {
  if (e.target.matches("select, input")) updateConditionals();
});

/* ---------------------------------------------------------
   Barra de progresso
--------------------------------------------------------- */
function renderProgress() {
  const el = document.getElementById("wiz-progress");
  el.innerHTML = "";
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const seg = document.createElement("div");
    seg.className = "seg" + (i < currentStep ? " done" : i === currentStep ? " current" : "");
    el.appendChild(seg);
  }
}

/* ---------------------------------------------------------
   Validação da etapa atual
--------------------------------------------------------- */
function validarEtapaAtual() {
  const stepEl = document.querySelector(`.wiz-step[data-step="${currentStep}"]`);
  if (!stepEl) return true;
  const campos = stepEl.querySelectorAll("[required]");
  for (const campo of campos) {
    if (campo.dataset.condHidden === "1") continue; // escondido, ignora
    if (!campo.value || !campo.value.trim()) {
      campo.focus();
      campo.style.borderColor = "#b0553f";
      setTimeout(() => (campo.style.borderColor = ""), 1500);
      return false;
    }
  }
  // validações específicas por etapa
  if (currentStep === 6) {
    const marcados = document.querySelectorAll("#c-cursos-pm-list input:checked");
    if (marcados.length === 0) {
      alert("Marque ao menos um curso (ou preencha o campo de texto abaixo se não possuir nenhum da lista).");
      return false;
    }
  }
  if (currentStep === 7) {
    const marcados = document.querySelectorAll("#c-pendencias-list input:checked");
    if (marcados.length === 0) {
      alert("Marque ao menos uma situação que deseja tratar.");
      return false;
    }
  }
  return true;
}

/* ---------------------------------------------------------
   Navegação entre etapas
--------------------------------------------------------- */
function irParaEtapa(n) {
  document.querySelectorAll(".wiz-step").forEach((el) => el.classList.remove("active"));
  document.querySelector(`.wiz-step[data-step="${n}"]`).classList.add("active");
  currentStep = n;
  renderProgress();
  document.getElementById("wiz-btn-voltar").disabled = currentStep === 0;
  document.getElementById("wiz-btn-proximo").style.display = currentStep === TOTAL_STEPS - 1 ? "none" : "flex";
  document.getElementById("wiz-btn-enviar").style.display = currentStep === TOTAL_STEPS - 1 ? "flex" : "none";
  window.scrollTo({ top: document.querySelector(".wiz-progress").offsetTop - 90, behavior: "smooth" });
}

document.getElementById("wiz-btn-proximo").addEventListener("click", () => {
  if (!validarEtapaAtual()) return;
  if (currentStep < TOTAL_STEPS - 1) irParaEtapa(currentStep + 1);
});
document.getElementById("wiz-btn-voltar").addEventListener("click", () => {
  if (currentStep > 0) irParaEtapa(currentStep - 1);
});

/* ---------------------------------------------------------
   Upload de arquivos (CNH / BGO) — mesmo bucket, pastas separadas
--------------------------------------------------------- */
async function uploadArquivoCadastro(file, pasta, statusElId) {
  const statusEl = document.getElementById(statusElId);
  if (!sb) {
    if (statusEl) statusEl.textContent = "Envio indisponível (Supabase não configurado).";
    return null;
  }
  const tiposAceitos = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!tiposAceitos.includes(file.type)) {
    alert("Só é permitido enviar PDF, JPG, PNG ou WEBP.");
    return null;
  }
  if (statusEl) statusEl.textContent = "Enviando...";
  const safeName = file.name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${pasta}/${Date.now()}_${safeName}`;
  const { error } = await sb.storage.from("cadastros-anexos").upload(path, file);
  if (error) {
    console.error(error);
    if (statusEl) statusEl.textContent = "Erro ao enviar: " + (error.message || "erro desconhecido");
    return null;
  }
  const { data } = sb.storage.from("cadastros-anexos").getPublicUrl(path);
  if (statusEl) statusEl.textContent = "Enviado: " + file.name;
  return { url: data.publicUrl, path, nome: file.name, tamanho: file.size };
}

document.getElementById("c-cnh-arquivo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) uploadedCnh = await uploadArquivoCadastro(file, "cnh", "cnh-upload-status");
});
document.getElementById("c-bgo-arquivo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) uploadedBgo = await uploadArquivoCadastro(file, "bgo", "bgo-upload-status");
});

/* ---------------------------------------------------------
   Coleta de todos os dados do formulário
--------------------------------------------------------- */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}
function checklistValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map((c) => c.value);
}

function coletarDados() {
  return {
    // Identificação
    tituloEleitorNumero: val("c-titulo-numero"),
    tituloEleitorZona: val("c-titulo-zona"),
    tituloEleitorSecao: val("c-titulo-secao"),
    cpf: val("c-cpf"),
    rg: val("c-rg"),
    orgaoExpedidor: val("c-orgao-expedidor"),
    filiacaoMae: val("c-mae"),
    filiacaoPai: val("c-pai"),
    dataNascimento: val("c-nascimento"),
    estadoCivil: val("c-estado-civil"),
    // Contatos e endereço
    telefone1: val("c-tel1"),
    telefone1Whatsapp: val("c-tel1-whats"),
    telefone2: val("c-tel2"),
    telefone2Whatsapp: val("c-tel2-whats"),
    email: val("c-email"),
    enderecoLogradouro: val("c-end-logradouro"),
    enderecoComplemento: val("c-end-complemento"),
    enderecoCidade: val("c-end-cidade"),
    enderecoEstado: val("c-end-estado"),
    enderecoCep: val("c-end-cep"),
    enderecoPais: val("c-end-pais"),
    // Emergência
    emergenciaPessoa1Nome: val("c-emerg1-nome"),
    emergenciaPessoa1Parentesco: val("c-emerg1-parentesco"),
    emergenciaPessoa1Telefone: val("c-emerg1-tel"),
    emergenciaPessoa1Whatsapp: val("c-emerg1-whats"),
    emergenciaPessoa2Nome: val("c-emerg2-nome"),
    emergenciaPessoa2Parentesco: val("c-emerg2-parentesco"),
    emergenciaPessoa2Telefone: val("c-emerg2-tel"),
    emergenciaPessoa2Whatsapp: val("c-emerg2-whats"),
    possuiPlanoSaude: val("c-plano-saude"),
    tipoSanguineo: val("c-tipo-sanguineo"),
    planoSaudeQual: val("c-plano-saude-qual"),
    planoSaudeOutro: val("c-plano-saude-outro"),
    carteirinhaNumero: val("c-carteirinha"),
    // CNH
    possuiCnh: val("c-possui-cnh"),
    cnhVencida: val("c-cnh-vencida"),
    cnhNumero: val("c-cnh-numero"),
    cnhCategoria: val("c-cnh-categoria"),
    cnhValidade: val("c-cnh-validade"),
    cnhPrimeiraHabilitacao: val("c-cnh-primeira-hab"),
    possuiCcve: val("c-possui-ccve"),
    ccveConclusao: val("c-ccve-conclusao"),
    cnhArquivo: uploadedCnh,
    // Informações funcionais
    gh: val("c-gh"),
    localTrabalho: val("c-local-trabalho"),
    funcao: val("c-funcao"),
    nomeGuerra: val("c-nome-guerra"),
    possuiIdentidadeFuncional: val("c-possui-identidade"),
    identidadeMotivo: val("c-identidade-motivo"),
    identidadeAtualizada: val("c-identidade-atualizada"),
    identidadeIlegivel: val("c-identidade-ilegivel"),
    dataAdmissao: val("c-data-admissao"),
    dataUltimaPromocao: val("c-data-ultima-promocao"),
    possuiBgo: val("c-possui-bgo"),
    bgoNumero: val("c-bgo-numero"),
    bgoData: val("c-bgo-data"),
    bgoArquivo: uploadedBgo,
    // Competências
    aptidaoAquatica: val("c-aptidao-aquatica"),
    possuiCursosPmba: val("c-possui-cursos-pmba"),
    formacaoEducacional: val("c-formacao"),
    formacaoCompleta: val("c-formacao-completa"),
    formacaoQualCurso: val("c-formacao-qual-curso"),
    cursosPm: checklistValues("c-cursos-pm-list"),
    cursosPmOutros: val("c-cursos-pm-outros"),
    // Pendências
    pendencias: checklistValues("c-pendencias-list"),
    pendenciaDescricao: val("c-pendencia-descricao"),
  };
}

/* ---------------------------------------------------------
   Envio final
--------------------------------------------------------- */
document.getElementById("wiz-btn-enviar").addEventListener("click", async () => {
  if (!validarEtapaAtual()) return;
  const nome = val("c-nome");
  const matricula = val("c-matricula");
  if (!nome || !matricula) {
    alert("Nome e matrícula são obrigatórios (confira as etapas anteriores).");
    return;
  }
  const btn = document.getElementById("wiz-btn-enviar");
  btn.disabled = true;
  btn.textContent = "Enviando...";
  const dados = coletarDados();
  try {
    if (!sb) throw new Error("Supabase não configurado.");
    const { error } = await sb.from("cadastros_ingresso").insert({ matricula, nome, dados });
    if (error) throw error;
    document.getElementById("wiz-form").style.display = "none";
    document.getElementById("wiz-sucesso").style.display = "block";
  } catch (e) {
    console.error(e);
    alert("Erro ao enviar o cadastro: " + (e.message || "erro desconhecido") + "\n\nVerifique se a tabela 'cadastros_ingresso' foi criada no Supabase (cadastro_setup.sql).");
    btn.disabled = false;
    btn.textContent = "Enviar Cadastro";
  }
});

function resetarFormulario() {
  document.getElementById("wiz-form").reset();
  document.getElementById("wiz-form").style.display = "block";
  document.getElementById("wiz-sucesso").style.display = "none";
  document.getElementById("busca-resultado").textContent = "";
  document.getElementById("cnh-upload-status").textContent = "";
  document.getElementById("bgo-upload-status").textContent = "";
  uploadedCnh = null;
  uploadedBgo = null;
  const btnEnviar = document.getElementById("wiz-btn-enviar");
  btnEnviar.disabled = false;
  btnEnviar.textContent = "Enviar Cadastro";
  updateConditionals();
  irParaEtapa(0);
}
document.getElementById("wiz-btn-novo").addEventListener("click", resetarFormulario);

/* ---------------------------------------------------------
   Abas (Novo Cadastro / Cadastros Recebidos)
--------------------------------------------------------- */
document.querySelectorAll(".ef-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ef-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".ef-section").forEach((s) => s.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("sec-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "lista") carregarCadastros();
  });
});

/* ---------------------------------------------------------
   Cadastros Recebidos — listagem
--------------------------------------------------------- */
let cadastrosCache = [];

async function carregarCadastros() {
  const holder = document.getElementById("lista-cadastros");
  const info = document.getElementById("lista-info");
  if (!sb) {
    holder.innerHTML = `<div class="cadastros-empty">Supabase não configurado.</div>`;
    return;
  }
  info.textContent = "Carregando...";
  const { data, error } = await sb.from("cadastros_ingresso").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    holder.innerHTML = `<div class="cadastros-empty">Erro ao carregar: ${escapeHtml(error.message)}</div>`;
    info.textContent = "—";
    return;
  }
  cadastrosCache = data || [];
  info.textContent = `${cadastrosCache.length} cadastro(s) recebido(s)`;
  renderListaCadastros(cadastrosCache);
}

function renderListaCadastros(lista) {
  const holder = document.getElementById("lista-cadastros");
  if (!lista.length) {
    holder.innerHTML = `<div class="cadastros-empty">Nenhum cadastro recebido ainda.</div>`;
    return;
  }
  holder.innerHTML = lista.map((c) => {
    const d = c.dados || {};
    const dataFmt = c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—";
    return `
    <div class="cadastro-card" data-id="${c.id}">
      <div class="cc-nome">${escapeHtml(c.nome) || "—"}</div>
      <div class="cc-meta">${escapeHtml(c.matricula) || "—"} · ${escapeHtml(d.gh) || "—"}</div>
      <div class="cc-meta">${escapeHtml(d.localTrabalho) || "—"}</div>
      <div class="cc-data">Recebido em ${dataFmt}</div>
    </div>`;
  }).join("");
}

document.getElementById("lista-busca").addEventListener("input", (e) => {
  const termo = e.target.value.trim().toLowerCase();
  if (!termo) { renderListaCadastros(cadastrosCache); return; }
  const filtrado = cadastrosCache.filter((c) =>
    (c.nome || "").toLowerCase().includes(termo) || (c.matricula || "").toLowerCase().includes(termo)
  );
  renderListaCadastros(filtrado);
});

document.getElementById("lista-cadastros").addEventListener("click", (e) => {
  const card = e.target.closest(".cadastro-card");
  if (!card) return;
  const id = Number(card.dataset.id);
  const cadastro = cadastrosCache.find((c) => c.id === id);
  if (cadastro) abrirModalCadastro(cadastro);
});

/* ---------------------------------------------------------
   Modal de detalhe de um cadastro recebido
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

function row(label, value) {
  return `<div class="view-row"><div class="k">${label}</div><div class="v">${escapeHtml(value) || "—"}</div></div>`;
}

function abrirModalCadastro(c) {
  const d = c.dados || {};
  const anexos = [];
  if (d.cnhArquivo) anexos.push({ label: "Cópia da CNH", ...d.cnhArquivo });
  if (d.bgoArquivo) anexos.push({ label: "BGO de Promoção", ...d.bgoArquivo });

  openModal(`
    <div class="modal-title">${escapeHtml(c.nome)}</div>
    <div class="modal-subtitle">Matrícula ${escapeHtml(c.matricula)} · Recebido em ${new Date(c.created_at).toLocaleDateString("pt-BR")}</div>

    <div class="modal-section-title">Identificação</div>
    ${row("CPF", d.cpf)}${row("RG", d.rg)}${row("Órgão Expedidor", d.orgaoExpedidor)}
    ${row("Data de Nascimento", fmtDateBR(d.dataNascimento))}${row("Estado Civil", d.estadoCivil)}
    ${row("Filiação (Mãe)", d.filiacaoMae)}${row("Filiação (Pai)", d.filiacaoPai)}
    ${row("Título de Eleitor", `${d.tituloEleitorNumero || "—"} / Zona ${d.tituloEleitorZona || "—"} / Seção ${d.tituloEleitorSecao || "—"}`)}

    <div class="modal-section-title">Contatos e Endereço</div>
    ${row("Telefone 1", `${d.telefone1 || "—"}${d.telefone1Whatsapp === "Sim" ? " (Whatsapp)" : ""}`)}
    ${row("Telefone 2", d.telefone2 ? `${d.telefone2}${d.telefone2Whatsapp === "Sim" ? " (Whatsapp)" : ""}` : "—")}
    ${row("E-mail", d.email)}
    ${row("Endereço", `${d.enderecoLogradouro || ""} ${d.enderecoComplemento || ""}`)}
    ${row("Cidade/Estado", `${d.enderecoCidade || "—"}/${d.enderecoEstado || "—"}`)}
    ${row("CEP", d.enderecoCep)}${row("País", d.enderecoPais)}

    <div class="modal-section-title">Emergência e Saúde</div>
    ${row("Contato de Emergência 1", `${d.emergenciaPessoa1Nome || "—"} (${d.emergenciaPessoa1Parentesco || "—"}) — ${d.emergenciaPessoa1Telefone || "—"}`)}
    ${d.emergenciaPessoa2Nome ? row("Contato de Emergência 2", `${d.emergenciaPessoa2Nome} (${d.emergenciaPessoa2Parentesco || "—"}) — ${d.emergenciaPessoa2Telefone || "—"}`) : ""}
    ${row("Possui Plano de Saúde", d.possuiPlanoSaude)}
    ${d.possuiPlanoSaude === "Sim" ? row("Plano", d.planoSaudeQual === "Outros (Especificar)" ? d.planoSaudeOutro : d.planoSaudeQual) + row("Nº Carteirinha", d.carteirinhaNumero) : ""}
    ${row("Tipo Sanguíneo", d.tipoSanguineo)}

    <div class="modal-section-title">CNH</div>
    ${row("Possui CNH", d.possuiCnh)}
    ${d.possuiCnh === "Sim" ? row("Número", d.cnhNumero) + row("Categoria", d.cnhCategoria) + row("Validade", fmtDateBR(d.cnhValidade)) + row("1ª Habilitação", fmtDateBR(d.cnhPrimeiraHabilitacao)) + row("Vencida", d.cnhVencida) + row("Possui CCVE", d.possuiCcve) : ""}

    <div class="modal-section-title">Informações Funcionais</div>
    ${row("GH", d.gh)}${row("Local de Trabalho", d.localTrabalho)}${row("Função", d.funcao)}${row("Nome de Guerra", d.nomeGuerra)}
    ${row("Data de Admissão", fmtDateBR(d.dataAdmissao))}${row("Última Promoção", fmtDateBR(d.dataUltimaPromocao))}
    ${row("Identidade Funcional", d.possuiIdentidadeFuncional)}
    ${row("Possui BGO", d.possuiBgo)}
    ${d.possuiBgo === "Sim" ? row("Nº do BGO", d.bgoNumero) + row("Data do BGO", fmtDateBR(d.bgoData)) : ""}

    <div class="modal-section-title">Competências</div>
    ${row("Aptidão Aquática", d.aptidaoAquatica)}
    ${row("Formação Educacional", `${d.formacaoEducacional || "—"} (${d.formacaoCompleta === "Sim" ? "completo" : "incompleto"})`)}
    ${row("Cursos PM", (d.cursosPm || []).join(", ") || "—")}
    ${d.cursosPmOutros ? row("Outros Cursos", d.cursosPmOutros) : ""}

    <div class="modal-section-title">Pendências / Solicitações</div>
    ${row("Situações a tratar", (d.pendencias || []).join(", ") || "—")}
    ${d.pendenciaDescricao ? row("Detalhes", d.pendenciaDescricao) : ""}

    ${anexos.length ? `<div class="modal-section-title">Anexos</div>` + anexos.map((a) =>
      `<div class="view-row"><div class="k">${a.label}</div><div class="v"><a class="anexo-link" href="${a.url}" target="_blank" rel="noopener">${escapeHtml(a.nome)} (${formatBytes(a.tamanho)})</a></div></div>`
    ).join("") : ""}

    <div class="modal-actions">
      <button class="ef-btn primary" id="modal-fechar-btn">Fechar</button>
    </div>
  `);
  document.getElementById("modal-fechar-btn").addEventListener("click", closeModal);
}

/* ---------------------------------------------------------
   Inicialização
--------------------------------------------------------- */
updateConditionals();
renderProgress();
