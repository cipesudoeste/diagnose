// Frota inicial (semente) — edite livremente pela aba "Frota" depois.
const SEED_FROTA = [
  {
    id: 1,
    prefixo: "VTR-01",
    placa: "",
    modelo: "",
    categoria: "Automóvel",
    caracterizacao: "Caracterizada",
    status: "em_uso",
    km: 0,
    manutencoes: [],
  },
];

const CATEGORIAS_VIATURA = [
  "Motocicleta", "Automóvel", "Transporte de Tropa", "Outro",
];

const CARACTERIZACAO_VIATURA = [
  "Caracterizada", "Descaracterizada",
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
