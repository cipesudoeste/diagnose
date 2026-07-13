// Frota inicial (semente) — edite livremente pela aba "Frota" depois.
const SEED_FROTA = [
  {
    id: 1,
    prefixo: "VTR-01",
    placa: "",
    modelo: "",
    tipo: "Caracterizada",
    status: "em_uso",
    km: 0,
    manutencoes: [],
  },
];

const TIPOS_VIATURA = [
  "Caracterizada", "Descaracterizada", "Motocicleta", "Camburão", "Van/Utilitário", "Outro",
];

const STATUS_VIATURA = [
  { value: "em_uso", label: "Em Uso" },
  { value: "manutencao", label: "Em Manutenção" },
  { value: "baixada", label: "Baixada" },
];

const TIPOS_SERVICO = [
  "Revisão Preventiva", "Mecânica", "Elétrica", "Funilaria/Pintura",
  "Pneus/Suspensão", "Vidros/Lataria", "Ar-condicionado", "Outro",
];
