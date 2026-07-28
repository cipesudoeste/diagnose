/* ============================================================
   CRM WHATSAPP — lógica (vanilla JS)
   ============================================================ */

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
function normalizarTelefone(raw) {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}
function fmtHora(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR");
}

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
   Conversas — lista de contatos
--------------------------------------------------------- */
let contatosCache = [];
let contatoSelecionadoId = null;
let pollTimer = null;

async function carregarContatos() {
  if (!sb) {
    document.getElementById("chat-list-items").innerHTML = `<div class="chat-list-empty">Supabase não configurado.</div>`;
    return;
  }
  const { data, error } = await sb.from("whatsapp_contatos").select("*").order("ultima_interacao", { ascending: false, nullsFirst: false });
  if (error) { console.error(error); return; }
  contatosCache = data || [];
  renderListaContatos();
}

async function ultimaMensagemPorContato(contatoId) {
  const { data } = await sb.from("whatsapp_mensagens").select("*").eq("contato_id", contatoId).order("criado_em", { ascending: false }).limit(1);
  return (data && data[0]) || null;
}

async function renderListaContatos() {
  const termo = document.getElementById("chat-busca").value.trim().toLowerCase();
  const holder = document.getElementById("chat-list-items");
  let lista = contatosCache;
  if (termo) {
    lista = lista.filter((c) => (c.nome || "").toLowerCase().includes(termo) || (c.telefone || "").includes(termo));
  }
  if (!lista.length) {
    holder.innerHTML = `<div class="chat-list-empty">Nenhuma conversa ainda. Sincronize os contatos na aba Transmissão.</div>`;
    return;
  }
  holder.innerHTML = lista.map((c) => `
    <div class="chat-item${c.id === contatoSelecionadoId ? " active" : ""}" data-id="${c.id}">
      <div class="ci-topo">
        <div class="ci-nome">${escapeHtml(c.nome) || escapeHtml(c.telefone)}</div>
        <div class="ci-hora">${c.ultima_interacao ? fmtHora(c.ultima_interacao) : ""}</div>
      </div>
      <div class="ci-preview">${escapeHtml(c.telefone)}</div>
    </div>
  `).join("");
}

document.getElementById("chat-busca").addEventListener("input", renderListaContatos);

document.getElementById("chat-list-items").addEventListener("click", (e) => {
  const item = e.target.closest(".chat-item");
  if (!item) return;
  abrirConversa(Number(item.dataset.id));
});

async function abrirConversa(contatoId) {
  contatoSelecionadoId = contatoId;
  renderListaContatos();
  const contato = contatosCache.find((c) => c.id === contatoId);
  if (!contato) return;

  document.getElementById("chat-thread-empty").style.display = "none";
  document.getElementById("chat-thread-active").style.display = "flex";
  document.getElementById("ct-nome").textContent = contato.nome || "Sem nome cadastrado";
  document.getElementById("ct-telefone").textContent = contato.telefone;

  await carregarMensagens(contatoId);

  clearInterval(pollTimer);
  pollTimer = setInterval(() => carregarMensagens(contatoId, true), 8000);
}

async function carregarMensagens(contatoId, silencioso) {
  const { data, error } = await sb.from("whatsapp_mensagens").select("*").eq("contato_id", contatoId).order("criado_em", { ascending: true });
  if (error) { console.error(error); return; }
  const holder = document.getElementById("chat-messages");
  const estavaNoFim = holder.scrollTop + holder.clientHeight >= holder.scrollHeight - 40;
  holder.innerHTML = (data || []).map((m) => `
    <div class="msg-bubble ${m.direcao}${m.status === "erro" ? " erro" : ""}">
      ${escapeHtml(m.conteudo)}
      <span class="msg-hora">${fmtHora(m.criado_em)}${m.direcao === "enviada" ? " · " + escapeHtml(m.status) : ""}</span>
    </div>
  `).join("") || `<div class="chat-list-empty">Nenhuma mensagem ainda.</div>`;
  if (!silencioso || estavaNoFim) holder.scrollTop = holder.scrollHeight;
}

document.getElementById("btn-enviar-msg").addEventListener("click", enviarMensagemAtual);
document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagemAtual(); }
});

async function enviarMensagemAtual() {
  const input = document.getElementById("chat-input");
  const texto = input.value.trim();
  if (!texto || !contatoSelecionadoId) return;
  const contato = contatosCache.find((c) => c.id === contatoSelecionadoId);
  input.value = "";
  input.disabled = true;
  try {
    const resp = await fetch("/api/whatsapp-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefone: contato.telefone, texto, contatoId: contato.id }),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error || "Erro ao enviar");
    await carregarMensagens(contatoSelecionadoId);
  } catch (e) {
    console.error(e);
    alert("Erro ao enviar mensagem: " + e.message);
  }
  input.disabled = false;
  input.focus();
}

/* ---------------------------------------------------------
   Transmissão — sincronizar contatos a partir dos cadastros
--------------------------------------------------------- */
let cadastrosMap = new Map(); // matricula (dígitos) -> { nome, dados, created_at }

function agruparPessoasCadastro(lista) {
  const grupos = new Map();
  lista.forEach((c) => {
    const chave = (c.matricula || "").replace(/\D/g, "");
    if (!chave) return;
    const atual = grupos.get(chave);
    if (!atual || new Date(c.created_at) > new Date(atual.created_at)) grupos.set(chave, c);
  });
  return grupos;
}

async function carregarCadastrosParaFiltro() {
  if (!sb) return;
  const { data, error } = await sb.from("cadastros_ingresso").select("*");
  if (error) { console.error(error); return; }
  cadastrosMap = agruparPessoasCadastro(data || []);
}

document.getElementById("btn-sincronizar-contatos").addEventListener("click", async () => {
  const btn = document.getElementById("btn-sincronizar-contatos");
  btn.disabled = true;
  btn.textContent = "Sincronizando...";
  await carregarCadastrosParaFiltro();

  let criados = 0, atualizados = 0;
  for (const [matricula, c] of cadastrosMap.entries()) {
    const d = c.dados || {};
    if (d.telefone1Whatsapp !== "Sim" || !d.telefone1) continue;
    const telefone = normalizarTelefone(d.telefone1);
    if (!telefone) continue;

    const { data: existente } = await sb.from("whatsapp_contatos").select("id").eq("telefone", telefone).maybeSingle();
    if (existente) {
      await sb.from("whatsapp_contatos").update({ nome: c.nome, matricula }).eq("id", existente.id);
      atualizados++;
    } else {
      await sb.from("whatsapp_contatos").insert({ telefone, nome: c.nome, matricula, opt_in: true });
      criados++;
    }
  }

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"/></svg> Sincronizar Contatos`;
  document.getElementById("contatos-info").textContent = `${criados} novo(s), ${atualizados} atualizado(s)`;
  await carregarContatos();
  atualizarContagemDestinatarios();
});

/* ---------------------------------------------------------
   Transmissão — seleção de destinatários e envio
--------------------------------------------------------- */
function destinatariosFiltrados() {
  const fGh = document.getElementById("tx-filtro-gh").value;
  const fLocal = document.getElementById("tx-filtro-local").value;
  const fFuncao = document.getElementById("tx-filtro-funcao").value;

  return contatosCache.filter((contato) => {
    if (contato.opt_in === false) return false;
    const chave = (contato.matricula || "").replace(/\D/g, "");
    const cadastro = cadastrosMap.get(chave);
    const d = (cadastro && cadastro.dados) || {};
    if (fGh && d.gh !== fGh) return false;
    if (fLocal && d.localTrabalho !== fLocal) return false;
    if (fFuncao && d.funcao !== fFuncao) return false;
    return true;
  });
}

function atualizarContagemDestinatarios() {
  const lista = destinatariosFiltrados();
  document.getElementById("tx-contagem").textContent = `${lista.length} destinatário(s) selecionado(s)`;
  document.getElementById("tx-lista-preview").innerHTML = lista.slice(0, 40).map((c) =>
    `<span class="tag">${escapeHtml(c.nome) || escapeHtml(c.telefone)}</span>`
  ).join("") + (lista.length > 40 ? `<span class="tag">+${lista.length - 40}</span>` : "");
}

["tx-filtro-gh", "tx-filtro-local", "tx-filtro-funcao"].forEach((id) => {
  document.getElementById(id).addEventListener("change", atualizarContagemDestinatarios);
});

document.getElementById("btn-enviar-transmissao").addEventListener("click", async () => {
  const nomeCampanha = document.getElementById("tx-nome-campanha").value.trim();
  const mensagem = document.getElementById("tx-mensagem").value.trim();
  const destinatarios = destinatariosFiltrados();

  if (!nomeCampanha || !mensagem) { alert("Preencha o nome da campanha e a mensagem."); return; }
  if (!destinatarios.length) { alert("Nenhum destinatário selecionado com esse filtro."); return; }
  if (!confirm(`Enviar para ${destinatarios.length} policial(is)? Essa ação não pode ser desfeita.`)) return;

  const btn = document.getElementById("btn-enviar-transmissao");
  btn.disabled = true;
  const progresso = document.getElementById("tx-progresso");
  const fill = document.getElementById("tx-progresso-fill");
  const texto = document.getElementById("tx-progresso-texto");
  progresso.style.display = "block";

  let enviados = 0, erros = 0;
  for (let i = 0; i < destinatarios.length; i++) {
    const c = destinatarios[i];
    try {
      const resp = await fetch("/api/whatsapp-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: c.telefone, texto: mensagem, contatoId: c.id }),
      });
      if (resp.ok) enviados++; else erros++;
    } catch (e) {
      console.error(e);
      erros++;
    }
    const pct = Math.round(((i + 1) / destinatarios.length) * 100);
    fill.style.width = pct + "%";
    texto.textContent = `${i + 1} de ${destinatarios.length} — ${enviados} enviado(s), ${erros} erro(s)`;
    await new Promise((r) => setTimeout(r, 350)); // evita disparar tudo de uma vez
  }

  await sb.from("whatsapp_campanhas").insert({
    nome: nomeCampanha,
    mensagem,
    filtro_descricao: `GH: ${document.getElementById("tx-filtro-gh").value || "todos"} · Local: ${document.getElementById("tx-filtro-local").value || "todos"} · Função: ${document.getElementById("tx-filtro-funcao").value || "todas"}`,
    total_destinatarios: destinatarios.length,
    total_enviados: enviados,
    total_erros: erros,
    status: "concluida",
  });

  btn.disabled = false;
  document.getElementById("tx-mensagem").value = "";
  document.getElementById("tx-nome-campanha").value = "";
  await carregarCampanhas();
  alert(`Transmissão concluída: ${enviados} enviada(s), ${erros} erro(s).`);
});

async function carregarCampanhas() {
  if (!sb) return;
  const { data, error } = await sb.from("whatsapp_campanhas").select("*").order("criado_em", { ascending: false }).limit(20);
  if (error) { console.error(error); return; }
  document.getElementById("campanhas-tbody").innerHTML = (data && data.length)
    ? data.map((c) => `<tr>
        <td data-label="Campanha">${escapeHtml(c.nome)}</td>
        <td class="num" data-label="Destinatários">${c.total_destinatarios}</td>
        <td class="num" data-label="Enviados">${c.total_enviados}</td>
        <td class="num" data-label="Erros">${c.total_erros}</td>
        <td data-label="Data">${fmtDataHora(c.criado_em)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:20px;">Nenhuma campanha enviada ainda.</td></tr>`;
}

/* ---------------------------------------------------------
   Inicialização
--------------------------------------------------------- */
(async function init() {
  await carregarCadastrosParaFiltro();
  await carregarContatos();
  await carregarCampanhas();
  atualizarContagemDestinatarios();
})();
