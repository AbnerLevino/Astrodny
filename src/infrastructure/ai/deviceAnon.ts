/*
  INFRAESTRUTURA — o identificador ANÔNIMO de dispositivo.

  Um UUID aleatório guardado no localStorage do navegador, gerado UMA vez por aparelho.
  NÃO identifica a pessoa (sem nome, sem e-mail) — só permite ao servidor CONTAR dispositivos
  distintos e agrupar as interações do mesmo aparelho. É o que vai no campo `device_anon`
  da tabela de coleta (astrocore_dataset).
*/
const CHAVE = 'astrodny_device_anon'

export function deviceAnon(): string {
  try {
    let id = localStorage.getItem(CHAVE)
    if (!id) {
      id = uuidV4()
      localStorage.setItem(CHAVE, id)
    }
    return id
  } catch {
    // localStorage indisponível (modo privado, etc.): gera um efêmero, sem persistir
    return uuidV4()
  }
}

// crypto.randomUUID só existe em contexto seguro (https/localhost) — em produção (Vercel = https)
// existe. O fallback manual cobre o resto (ex.: celular via IP HTTP na Wi-Fi, como o resto do app já trata).
function uuidV4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
    const n = Number(c)
    return (n ^ ((Math.random() * 16) >> (n / 4))).toString(16)
  })
}
