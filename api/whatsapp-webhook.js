// api/whatsapp-webhook.js
// Recebe eventos da Meta: mensagens novas e atualizações de status
// (enviada/entregue/lida). Roda como Vercel Serverless Function.
//
// Variáveis de ambiente necessárias (configurar no painel da Vercel,
// NUNCA no código): WHATSAPP_VERIFY_TOKEN, SUPABASE_URL, SUPABASE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Supabase ${res.status}: ${texto}`);
  }
  return res.json();
}

async function encontrarOuCriarContato(telefone, nomePerfil) {
  const existentes = await supabaseFetch(`whatsapp_contatos?telefone=eq.${telefone}&select=*`);
  if (existentes.length) return existentes[0];
  const criado = await supabaseFetch("whatsapp_contatos", {
    method: "POST",
    body: JSON.stringify({ telefone, nome: nomePerfil || null, ultima_interacao: new Date().toISOString() }),
  });
  return criado[0];
}

module.exports = async function handler(req, res) {
  // --- Verificação do webhook (Meta chama isso 1x ao configurar) ---
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Token de verificação inválido.");
    }
    return;
  }

  // --- Eventos recebidos (mensagens e status) ---
  if (req.method === "POST") {
    try {
      const body = req.body;
      const value = body?.entry?.[0]?.changes?.[0]?.value;

      // Mensagens recebidas de policiais
      if (value?.messages) {
        for (const msg of value.messages) {
          const telefone = msg.from;
          const nomePerfil = value.contacts?.[0]?.profile?.name;
          const contato = await encontrarOuCriarContato(telefone, nomePerfil);

          let conteudo = "";
          if (msg.type === "text") conteudo = msg.text.body;
          else conteudo = `[mensagem do tipo ${msg.type}, não suportada para exibição de texto]`;

          await supabaseFetch("whatsapp_mensagens", {
            method: "POST",
            body: JSON.stringify({
              contato_id: contato.id,
              direcao: "recebida",
              tipo: msg.type === "text" ? "texto" : msg.type,
              conteudo,
              wa_message_id: msg.id,
              status: "recebida",
            }),
          });

          await supabaseFetch(`whatsapp_contatos?id=eq.${contato.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ultima_interacao: new Date().toISOString() }),
          });
        }
      }

      // Atualizações de status (entregue/lida/erro) de mensagens que enviamos
      if (value?.statuses) {
        for (const s of value.statuses) {
          await supabaseFetch(`whatsapp_mensagens?wa_message_id=eq.${s.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: s.status,
              erro_detalhe: s.errors ? JSON.stringify(s.errors) : null,
            }),
          });
        }
      }

      res.status(200).send("EVENT_RECEIVED");
    } catch (e) {
      console.error("Erro no webhook do WhatsApp:", e);
      // Sempre responde 200 pra Meta não ficar re-tentando infinitamente
      res.status(200).send("EVENT_RECEIVED_WITH_ERROR");
    }
    return;
  }

  res.status(405).send("Método não permitido");
}
