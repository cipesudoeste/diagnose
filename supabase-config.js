// Configuração da base de dados (Supabase) — compartilhada por todas as
// páginas do site (Efetivo, Viaturas, Cadastro/Formulário, WhatsApp).
//
// Antes esse arquivo existia em 3 cópias idênticas (efetivo-config.js,
// viaturas-config.js, cadastro-config.js). Unificado em supabase-config.js
// pra só precisar editar em um lugar quando trocar de projeto Supabase.

const SUPABASE_URL = "https://eelvzwremmzrpilkgmqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0DSySYVed5aEvvH5NW329A_PEo5PAZ7";
