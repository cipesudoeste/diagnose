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
   Inicialização — carrega direto, não tem mais abas
--------------------------------------------------------- */
carregarCadastros();
