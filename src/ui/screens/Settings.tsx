/*
  Tela de Configurações (/config).

  Lê e escreve pela porta (useSettings) — não sabe de localStorage.
  Chaves de IA (BYOK): o acordeão completo vive em ui/components/ChavesIA.tsx (o mesmo
  componente, compacto, aparece no botão de chave do topo das telas).
*/
import { useNavigate, useSearchParams } from 'react-router-dom'
import { provedorPendente, type Personalidade } from '../../domain/settings'
import { useSettings } from '../settings'
import { AcordeaoChaves } from '../components/ChavesIA'

// As opções mostradas ao usuário: valor técnico + rótulo + descrição do tom.
const OPCOES: { valor: Personalidade; titulo: string; descricao: string }[] = [
  {
    valor: 'formal',
    titulo: 'Formal',
    descricao: 'Objetivo e direto ao ponto, com linguagem técnica. Sem rodeios.',
  },
  {
    valor: 'descontraido',
    titulo: 'Descontraído',
    descricao: 'Leve e próximo, como um parceiro de estudos. Usa exemplos do dia a dia.',
  },
]

function Settings() {
  const navigate = useNavigate()
  const { personalidade, definirPersonalidade, chavesValidas } = useSettings()
  // `/config?abrir=chaves` (vindo da opção "Chaves de IA" do modal da conta): chega com
  // o acordeão já aberto no provedor que ainda falta (ou no Groq, se os dois estão ok).
  const [params] = useSearchParams()
  const abrirChaves = params.get('abrir') === 'chaves'

  return (
    <div className="min-h-dvh bg-[#05060f] text-white">
      {/* topo: voltar + título */}
      <header className="flex items-center gap-3 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] lg:mx-auto lg:w-full lg:max-w-[720px]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="rounded-full p-2 hover:bg-white/10"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Configurações</h1>
      </header>

      <main className="px-5 lg:mx-auto lg:max-w-[720px]">
        <section className="pb-8">
          <h2 className="pb-1 text-sm font-medium text-white/90">Chaves de IA</h2>
          <p className="pb-4 text-sm text-white/50">
            Cada pessoa usa a própria chave — assim ninguém trava por limite de uso de outra pessoa.
            Toque numa opção pra configurar.
          </p>
          <AcordeaoChaves inicial={abrirChaves ? provedorPendente(chavesValidas, true) : null} />
        </section>

        <section>
          <h2 className="pb-1 text-sm font-medium text-white/90">Personalidade do tutor</h2>
          <p className="pb-4 text-sm text-white/50">
            Como o assistente conversa no chat. O jeito de ensinar é o mesmo; muda só o tom.
          </p>

          <div className="flex flex-col gap-3">
            {OPCOES.map((op) => {
              const ativa = op.valor === personalidade
              return (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() => definirPersonalidade(op.valor)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    ativa
                      ? 'border-white/70 bg-white/10'
                      : 'border-white/15 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{op.titulo}</span>
                    {/* bolinha de rádio */}
                    <span
                      className={`h-4 w-4 rounded-full border-2 ${
                        ativa ? 'border-white bg-white' : 'border-white/40'
                      }`}
                    />
                  </div>
                  <p className="pt-1 text-sm text-white/50">{op.descricao}</p>
                </button>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}

export default Settings
