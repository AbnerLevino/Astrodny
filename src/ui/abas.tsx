/*
  As ABAS de fluxo (Estudar / Trabalhos / Provas).

  São a "direção" do chat: ficam SEMPRE no mesmo lugar (acima do input) e seguem
  visíveis em todas as páginas. A aba ATIVA (azul cheio) é definida pela ROTA atual
  — ou seja, "Estudar" só fica ativo quando você ESTÁ na página de estudo, nunca por
  hover na Home. O hover dá só uma dica (contorno azul), sem parecer ativo.
*/
import { useLocation, useNavigate } from 'react-router-dom'

export function AbasFluxo() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="flex gap-1 overflow-x-auto sem-scrollbar px-0.5 lg:gap-2">
      {/* ativo = estar NA rota daquela aba. Estudar e Trabalhos já têm página;
          Provas ainda não — por ora leva pra "/" e nunca fica ativa. */}
      <BotaoAba label="Estudar" icone="/estudar.png" ativo={pathname.startsWith('/estudar')} onClick={() => navigate('/estudar')} />
      <BotaoAba label="Trabalhos" icone="/trabalhos.png" ativo={pathname.startsWith('/trabalhos')} onClick={() => navigate('/trabalhos')} />
      <BotaoAba label="Provas" icone="/provas.png" ativo={pathname.startsWith('/provas')} onClick={() => navigate('/')} />
    </div>
  )
}

// Um botão-aba: pílula arredondada.
//  - normal: visível/discreto
//  - hover: só um CONTORNO azul (dica) — NÃO preenche, então não parece ativo
//  - ativo (= você está na página): contorno + FUNDO azul claro + brilho
function BotaoAba({ label, icone, ativo = false, onClick }: { label: string; icone: string; ativo?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors lg:gap-1.5 lg:px-3 lg:py-1.5 lg:text-xs ${
        ativo
          ? 'border-[#3b7bff] bg-[#3b7bff]/20 text-white shadow-[0_0_14px_rgba(59,123,255,0.35)]'
          : 'border-white/20 text-white/85 hover:border-[#3b7bff]/70 hover:text-white'
      }`}
    >
      <img src={icone} alt="" className="h-3.5 w-3.5 object-contain lg:h-4 lg:w-4" />
      {label}
    </button>
  )
}
