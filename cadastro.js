/* ============================================================
   GERENCIAMENTO DE CADASTROS — lógica (vanilla JS)
   Página interna (admin). O formulário público que o policial
   preenche fica em formulario.js / formulario.html, separado.
   ============================================================ */

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
   Cadastros Recebidos — listagem (agrupada por policial)
--------------------------------------------------------- */
let cadastrosCache = [];
let modoVista = "cards"; // "cards" | "lista"

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
  aplicarFiltrosERenderizar();
}

/* Agrupa todas as submissões pela matrícula (normalizada) */
function agruparPorPessoa(lista) {
  const grupos = new Map();
  lista.forEach((c) => {
    const chave = (c.matricula || "").replace(/\D/g, "") || `sem-matricula-${c.id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(c);
  });
  return [...grupos.values()].map((submissoes) => {
    const ordenadas = [...submissoes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { pessoa: ordenadas[0], submissoes: ordenadas };
  });
}

function aplicarFiltrosERenderizar() {
  const termo = document.getElementById("lista-busca").value.trim().toLowerCase();
  const dataDe = document.getElementById("lista-data-de").value;
  const dataAte = document.getElementById("lista-data-ate").value;
  const ordem = document.getElementById("lista-ordenar").value;

  let grupos = agruparPorPessoa(cadastrosCache);

  if (termo) {
    grupos = grupos.filter((g) =>
      (g.pessoa.nome || "").toLowerCase().includes(termo) || (g.pessoa.matricula || "").toLowerCase().includes(termo)
    );
  }
  if (dataDe) {
    const de = new Date(dataDe + "T00:00:00");
    grupos = grupos.filter((g) => g.submissoes.some((s) => new Date(s.created_at) >= de));
  }
  if (dataAte) {
    const ate = new Date(dataAte + "T23:59:59");
    grupos = grupos.filter((g) => g.submissoes.some((s) => new Date(s.created_at) <= ate));
  }

  grupos.sort((a, b) => {
    if (ordem === "recente") return new Date(b.pessoa.created_at) - new Date(a.pessoa.created_at);
    if (ordem === "antigo") return new Date(a.pessoa.created_at) - new Date(b.pessoa.created_at);
    if (ordem === "nome-az") return (a.pessoa.nome || "").localeCompare(b.pessoa.nome || "");
    if (ordem === "nome-za") return (b.pessoa.nome || "").localeCompare(a.pessoa.nome || "");
    if (ordem === "qtd") return b.submissoes.length - a.submissoes.length;
    return 0;
  });

  const totalPessoas = grupos.length;
  const totalSubmissoes = cadastrosCache.length;
  document.getElementById("lista-info").textContent =
    `${totalPessoas} policial(is) · ${totalSubmissoes} preenchimento(s) no total`;

  renderListaCadastros(grupos);
}

function renderListaCadastros(grupos) {
  const holder = document.getElementById("lista-cadastros");
  holder.classList.toggle("modo-lista", modoVista === "lista");
  if (!grupos.length) {
    holder.innerHTML = `<div class="cadastros-empty">Nenhum cadastro encontrado com esses filtros.</div>`;
    return;
  }
  holder.innerHTML = grupos.map(({ pessoa: c, submissoes }) => {
    const d = c.dados || {};
    const dataFmt = c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—";
    const chave = (c.matricula || "").replace(/\D/g, "");
    return `
    <div class="cadastro-card" data-chave="${chave}">
      <div>
        <div class="cc-nome">${escapeHtml(c.nome) || "—"}</div>
        <div class="cc-meta">${escapeHtml(c.matricula) || "—"} · ${escapeHtml(d.gh) || "—"}</div>
        <div class="cc-meta">${escapeHtml(d.localTrabalho) || "—"}</div>
      </div>
      <div>
        <div class="cc-data">Último em ${dataFmt}</div>
        ${submissoes.length > 1 ? `<div class="cc-count">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18M7 14l4-4 3 3 5-6"/></svg>
          ${submissoes.length} preenchimentos
        </div>` : ""}
      </div>
    </div>`;
  }).join("");
}

document.getElementById("lista-busca").addEventListener("input", aplicarFiltrosERenderizar);
document.getElementById("lista-data-de").addEventListener("change", aplicarFiltrosERenderizar);
document.getElementById("lista-data-ate").addEventListener("change", aplicarFiltrosERenderizar);
document.getElementById("lista-ordenar").addEventListener("change", aplicarFiltrosERenderizar);
document.getElementById("btn-limpar-filtros").addEventListener("click", () => {
  document.getElementById("lista-busca").value = "";
  document.getElementById("lista-data-de").value = "";
  document.getElementById("lista-data-ate").value = "";
  document.getElementById("lista-ordenar").value = "recente";
  aplicarFiltrosERenderizar();
});

document.getElementById("btn-view-cards").addEventListener("click", () => {
  modoVista = "cards";
  document.getElementById("btn-view-cards").classList.add("active");
  document.getElementById("btn-view-lista").classList.remove("active");
  aplicarFiltrosERenderizar();
});
document.getElementById("btn-view-lista").addEventListener("click", () => {
  modoVista = "lista";
  document.getElementById("btn-view-lista").classList.add("active");
  document.getElementById("btn-view-cards").classList.remove("active");
  aplicarFiltrosERenderizar();
});

document.getElementById("lista-cadastros").addEventListener("click", (e) => {
  const card = e.target.closest(".cadastro-card");
  if (!card) return;
  const chave = card.dataset.chave;
  const grupo = agruparPorPessoa(cadastrosCache).find((g) => (g.pessoa.matricula || "").replace(/\D/g, "") === chave);
  if (!grupo) return;
  if (grupo.submissoes.length === 1) {
    abrirModalCadastro(grupo.submissoes[0]);
  } else {
    abrirModalSubmissoes(grupo);
  }
});

/* Modal intermediário: lista todos os preenchimentos de uma pessoa */
function abrirModalSubmissoes(grupo) {
  const itens = grupo.submissoes.map((s, i) => {
    const dataFmt = new Date(s.created_at).toLocaleDateString("pt-BR");
    const rotulo = i === 0 ? "Mais recente" : `Preenchimento ${grupo.submissoes.length - i}`;
    return `
    <div class="submissao-item" data-id="${s.id}">
      <div>
        <div class="si-data">${dataFmt}</div>
        <div class="si-meta">${rotulo}</div>
      </div>
      <svg class="si-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6l6 6-6 6"/></svg>
    </div>`;
  }).join("");

  openModal(`
    <div class="modal-title">${escapeHtml(grupo.pessoa.nome)}</div>
    <div class="modal-subtitle">Matrícula ${escapeHtml(grupo.pessoa.matricula)} · ${grupo.submissoes.length} preenchimentos</div>
    <div class="submissoes-list">${itens}</div>
    <div class="modal-actions">
      <button class="ef-btn primary" id="submissoes-fechar-btn">Fechar</button>
    </div>
  `);
  document.getElementById("submissoes-fechar-btn").addEventListener("click", closeModal);
  document.querySelectorAll(".submissao-item").forEach((item) => {
    item.addEventListener("click", () => {
      const id = Number(item.dataset.id);
      const submissao = grupo.submissoes.find((s) => s.id === id);
      if (submissao) abrirModalCadastro(submissao);
    });
  });
}

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

/* Badge visual para respostas Sim/Não */
function ynRow(label, value) {
  const v = (value || "").trim();
  let cls = "unk", texto = "—";
  if (v === "Sim") { cls = "yes"; texto = "Sim"; }
  else if (v === "Não") { cls = "no"; texto = "Não"; }
  const icone = cls === "yes"
    ? `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>`
    : cls === "no"
    ? `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>`
    : "";
  return `<div class="view-row"><div class="k">${label}</div><div class="v"><span class="yn-badge ${cls}">${icone}${texto}</span></div></div>`;
}

/* Cartão de agrupamento no modal de detalhe (ícone + título + conteúdo) */
function detailCard(iconSvg, titulo, conteudoHtml) {
  if (!conteudoHtml || !conteudoHtml.trim()) return "";
  return `
    <div class="detail-card">
      <div class="detail-card-header">
        <div class="detail-card-icon">${iconSvg}</div>
        <div class="detail-card-title">${titulo}</div>
      </div>
      ${conteudoHtml}
    </div>`;
}

const ICONS = {
  pessoa: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/></svg>`,
  titulo: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>`,
  telefone: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8.1 9.6a16 16 0 006.3 6.3l1.1-1.2a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.7 2z"/></svg>`,
  endereco: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  emergencia: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  saude: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 14c1.5-1.5 3-3.5 3-6a4.5 4.5 0 00-9-1 4.5 4.5 0 00-9 1c0 2.5 1.5 4.5 3 6l6 6z"/></svg>`,
  cnh: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="2"/></svg>`,
  lotacao: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg>`,
  identidade: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  historico: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18"/></svg>`,
  formacao: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 10L12 5 2 10l10 5 10-5z"/></svg>`,
  cursos: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15a4 4 0 100-8 4 4 0 000 8z"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>`,
  pendencias: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
  anexo: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`,
};

function abrirModalCadastro(c) {
  const d = c.dados || {};
  const anexos = [];
  if (d.cnhArquivo) anexos.push({ label: "Cópia da CNH", ...d.cnhArquivo });
  if (d.bgoArquivo) anexos.push({ label: "BGO de Promoção", ...d.bgoArquivo });

  const identificacao =
    row("CPF", d.cpf) + row("RG", d.rg) + row("Órgão Expedidor", d.orgaoExpedidor) +
    row("Data de Nascimento", fmtDateBR(d.dataNascimento)) + row("Estado Civil", d.estadoCivil) +
    row("Filiação (Mãe)", d.filiacaoMae) + row("Filiação (Pai)", d.filiacaoPai) +
    row("Título de Eleitor", `${d.tituloEleitorNumero || "—"} / Zona ${d.tituloEleitorZona || "—"} / Seção ${d.tituloEleitorSecao || "—"}`);

  const contatos =
    row("Telefone 1", `${d.telefone1 || "—"}${d.telefone1Whatsapp === "Sim" ? " (Whatsapp)" : ""}`) +
    row("Telefone 2", d.telefone2 ? `${d.telefone2}${d.telefone2Whatsapp === "Sim" ? " (Whatsapp)" : ""}` : "—") +
    row("E-mail", d.email);

  const endereco =
    row("Endereço", `${d.enderecoLogradouro || ""} ${d.enderecoComplemento || ""}`.trim()) +
    row("Cidade/Estado", `${d.enderecoCidade || "—"}/${d.enderecoEstado || "—"}`) +
    row("CEP", d.enderecoCep) + row("País", d.enderecoPais);

  const emergencia =
    row("Contato 1", `${d.emergenciaPessoa1Nome || "—"} (${d.emergenciaPessoa1Parentesco || "—"}) — ${d.emergenciaPessoa1Telefone || "—"}`) +
    (d.emergenciaPessoa2Nome ? row("Contato 2", `${d.emergenciaPessoa2Nome} (${d.emergenciaPessoa2Parentesco || "—"}) — ${d.emergenciaPessoa2Telefone || "—"}`) : "");

  const saude =
    ynRow("Possui Plano de Saúde", d.possuiPlanoSaude) +
    (d.possuiPlanoSaude === "Sim" ? row("Plano", d.planoSaudeQual === "Outros (Especificar)" ? d.planoSaudeOutro : d.planoSaudeQual) + row("Nº Carteirinha", d.carteirinhaNumero) : "") +
    row("Tipo Sanguíneo", d.tipoSanguineo);

  const cnh =
    ynRow("Possui CNH", d.possuiCnh) +
    (d.possuiCnh === "Sim" ? row("Número", d.cnhNumero) + row("Categoria", d.cnhCategoria) + row("Validade", fmtDateBR(d.cnhValidade)) + row("1ª Habilitação", fmtDateBR(d.cnhPrimeiraHabilitacao)) + ynRow("Vencida", d.cnhVencida) + ynRow("Possui CCVE", d.possuiCcve) : "");

  const lotacao =
    row("GH", d.gh) + row("Local de Trabalho", d.localTrabalho) + row("Função", d.funcao) + row("Nome de Guerra", d.nomeGuerra);

  const identidade = ynRow("Possui Identidade Funcional", d.possuiIdentidadeFuncional);

  const historico =
    row("Data de Admissão", fmtDateBR(d.dataAdmissao)) + row("Última Promoção", fmtDateBR(d.dataUltimaPromocao)) +
    ynRow("Possui BGO", d.possuiBgo) +
    (d.possuiBgo === "Sim" ? row("Nº do BGO", d.bgoNumero) + row("Data do BGO", fmtDateBR(d.bgoData)) : "");

  const formacao =
    ynRow("Aptidão Aquática", d.aptidaoAquatica) +
    row("Formação Educacional", `${d.formacaoEducacional || "—"} (${d.formacaoCompleta === "Sim" ? "completo" : "incompleto"})`);

  const cursos =
    row("Cursos PM", (d.cursosPm || []).join(", ") || "—") +
    (d.cursosPmOutros ? row("Outros Cursos", d.cursosPmOutros) : "");

  const pendencias =
    row("Situações a tratar", (d.pendencias || []).join(", ") || "—") +
    (d.pendenciaDescricao ? row("Detalhes", d.pendenciaDescricao) : "");

  const anexosHtml = anexos.length ? anexos.map((a) =>
    `<div class="view-row"><div class="k">${a.label}</div><div class="v"><a class="anexo-link" href="${a.url}" target="_blank" rel="noopener">${escapeHtml(a.nome)} (${formatBytes(a.tamanho)})</a></div></div>`
  ).join("") : "";

  openModal(`
    <div class="modal-title">${escapeHtml(c.nome)}</div>
    <div class="modal-subtitle">Matrícula ${escapeHtml(c.matricula)} · Recebido em ${new Date(c.created_at).toLocaleDateString("pt-BR")}</div>

    ${detailCard(ICONS.pessoa, "Dados Pessoais", identificacao)}
    ${detailCard(ICONS.telefone, "Contatos", contatos)}
    ${detailCard(ICONS.endereco, "Endereço", endereco)}
    ${detailCard(ICONS.emergencia, "Emergência", emergencia)}
    ${detailCard(ICONS.saude, "Saúde", saude)}
    ${detailCard(ICONS.cnh, "CNH", cnh)}
    ${detailCard(ICONS.lotacao, "Lotação", lotacao)}
    ${detailCard(ICONS.identidade, "Identidade Funcional", identidade)}
    ${detailCard(ICONS.historico, "Admissão, Promoção e BGO", historico)}
    ${detailCard(ICONS.formacao, "Formação", formacao)}
    ${detailCard(ICONS.cursos, "Cursos", cursos)}
    ${detailCard(ICONS.pendencias, "Pendências / Solicitações", pendencias)}
    ${detailCard(ICONS.anexo, "Anexos", anexosHtml)}

    <div class="modal-actions">
      <button class="ef-btn primary" id="modal-fechar-btn">Fechar</button>
    </div>
  `);
  document.getElementById("modal-fechar-btn").addEventListener("click", closeModal);
}

/* ---------------------------------------------------------
   Inicialização — carrega direto, não tem mais abas
--------------------------------------------------------- */
carregarCadastros();
