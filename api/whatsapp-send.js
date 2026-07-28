// api/whatsapp-send.js
// Envia uma mensagem via WhatsApp Cloud API. O token de acesso NUNCA
// fica no código nem no navegador — só aqui, como variável de ambiente
// da Vercel (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).
//
// Chamado pelo front-end via POST /api/whatsapp-send
// Body esperado: { telefone: "5577999999999", texto: "...", contatoId: 12 }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GRAPH_VERSION = "v20.0";

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }

  const { telefone, texto, contatoId } = req.body || {};
  if (!telefone || !texto) {
    res.status(400).json({ error: "Informe 'telefone' e 'texto'." });
    return;
  }

  try {
    const graphRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: telefone,
          type: "text",
          text: { body: texto },
        }),
      }
    );
    const graphData = await graphRes.json();

    if (!graphRes.ok) {
      const detalhe = graphData?.error?.message || "Erro desconhecido da Meta";
      if (contatoId) {
        await supabaseFetch("whatsapp_mensagens", {
          method: "POST",
          body: JSON.stringify({
            contato_id: contatoId, direcao: "enviada", tipo: "texto",
            conteudo: texto, status: "erro", erro_detalhe: detalhe,
          }),
        });
      }
      res.status(502).json({ error: detalhe });
      return;
    }

    const waMessageId = graphData.messages?.[0]?.id || null;

    if (contatoId) {
      await supabaseFetch("whatsapp_mensagens", {
        method: "POST",
        body: JSON.stringify({
          contato_id: contatoId, direcao: "enviada", tipo: "texto",
          conteudo: texto, wa_message_id: waMessageId, status: "enviada",
        }),
      });
      await supabaseFetch(`whatsapp_contatos?id=eq.${contatoId}`, {
        method: "PATCH",
        body: JSON.stringify({ ultima_interacao: new Date().toISOString() }),
      });
    }

    res.status(200).json({ ok: true, wa_message_id: waMessageId });
  } catch (e) {
    console.error("Erro ao enviar mensagem WhatsApp:", e);
    res.status(500).json({ error: e.message || "Erro interno" });
  }
}
