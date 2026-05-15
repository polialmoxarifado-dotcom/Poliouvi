export const RATINGS = [
  "Ótimo",
  "Bom",
  "Regular",
  "Ruim",
  "Não informou"
] as const;

export type Rating = typeof RATINGS[number];

export const RATING_COLORS: Record<Rating, string> = {
  "Ótimo": "bg-emerald-500",
  "Bom": "bg-blue-500",
  "Regular": "bg-amber-500",
  "Ruim": "bg-rose-500",
  "Não informou": "bg-slate-400"
};

export const RATING_TEXT_COLORS: Record<Rating, string> = {
  "Ótimo": "text-emerald-700",
  "Bom": "text-blue-700",
  "Regular": "text-amber-700",
  "Ruim": "text-rose-700",
  "Não informou": "text-slate-600"
};

export const FIXED_SECTORS = [
  "Portaria/Segurança",
  "Recepção Geral",
  "Triagem",
  "Consultas Médicas",
  "Consultas Multiprofissionais",
  "Realização de Exames",
  "Laboratório",
  "Entrega de Exames",
  "CER",
  "Ambiente",
  "Limpeza",
  "Higiene e Organização dos Banheiros"
] as const;
