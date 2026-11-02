/*
  Tela de Configurações (/config).

  Por enquanto só a personalidade do tutor. A tela lê e escreve pela porta
  (useSettings) — não sabe de localStorage. Cresce aqui conforme surgirem opções.
*/
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Personalidade } from '../../domain/settings'
import { useSettings } from '../settings'

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
  const { personalidade, definirPersonalidade, groqApiKey, definirGroqApiKey, geminiApiKey, definirGeminiApiKey } =
    useSettings()

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
        <section className="pb-6">
          <CampoChave
            titulo="Chave do Estudar/Trabalhos (Groq)"
            descricao="O Astrodny usa o Groq pra gerar aulas, provas e trabalhos. Cada pessoa usa a PRÓPRIA chave — assim ninguém trava por limite de uso de outra pessoa."
            aviso="Sem chave configurada, Estudar e Trabalhos não funcionam. Siga o passo a passo abaixo (leva menos de 2 minutos, é grátis)."
            passos={[
              <>Acesse <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-[#6f8dff] underline">console.groq.com/keys</a> (crie uma conta grátis se não tiver).</>,
              <>Clique em "Create API Key", dê um nome qualquer e confirme.</>,
              <>Copie a chave (começa com "gsk_...") — ela só aparece uma vez.</>,
              <>Cole aqui abaixo.</>,
            ]}
            label="Sua chave Groq"
            placeholder="gsk_..."
            valor={groqApiKey}
            aoSalvar={definirGroqApiKey}
          />
        </section>

        <section className="pb-8">
          <CampoChave
            titulo="Chave do Chat (Gemini)"
            descricao="O Astrodny usa o Gemini pro chat/tira-dúvidas. Cada pessoa usa a PRÓPRIA chave — assim ninguém trava por limite de uso de outra pessoa."
            aviso="Sem chave configurada, o chat não funciona. Siga o passo a passo abaixo (leva menos de 2 minutos, é grátis)."
            passos={[
              <>Acesse <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-[#6f8dff] underline">aistudio.google.com/apikey</a> (entre com uma conta Google).</>,
              <>Clique em "Create API key", escolha um projeto (ou crie um) e confirme.</>,
              <>Copie a chave (começa com "AIza...").</>,
              <>Cole aqui abaixo.</>,
            ]}
            label="Sua chave Gemini"
            placeholder="AIza..."
            valor={geminiApiKey}
            aoSalvar={definirGeminiApiKey}
          />
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

// Um campo de chave de API (Groq/Gemini): card com descrição, aviso (se vazio),
// passo a passo pra criar a chave grátis, e o campo em si. Estado LOCAL (rascunho) —
// só chama aoSalvar no blur, não a cada tecla, pra não gravar no meio de uma colagem.
function CampoChave({
  titulo,
  descricao,
  aviso,
  passos,
  label,
  placeholder,
  valor,
  aoSalvar,
}: {
  titulo: string
  descricao: string
  aviso: string
  passos: React.ReactNode[]
  label: string
  placeholder: string
  valor: string
  aoSalvar: (chave: string) => void
}) {
  const [rascunho, setRascunho] = useState(valor)
  const [mostrar, setMostrar] = useState(false)

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
      <h2 className="pb-1 text-sm font-medium text-white/90">{titulo}</h2>
      <p className="pb-3 text-sm text-white/50">{descricao}</p>

      {!valor.trim() && (
        <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-200">
          <p className="pb-2">⚠️ {aviso}</p>
          <p className="pb-1 font-medium text-amber-100">Como criar sua chave grátis:</p>
          <ol className="list-decimal space-y-1 pl-4">
            {passos.map((passo, i) => (
              <li key={i}>{passo}</li>
            ))}
          </ol>
        </div>
      )}

      <label className="mb-1.5 block text-sm text-white/70">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={mostrar ? 'text' : 'password'}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => aoSalvar(rascunho)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/40"
        />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          className="shrink-0 rounded-xl border border-white/15 px-3 py-2.5 text-xs text-white/70 hover:bg-white/5"
        >
          {mostrar ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      <p className="pt-3 text-xs text-white/40">
        Sua chave fica só no seu navegador. Ela é enviada pro nosso servidor apenas pra repassar sua
        requisição — nunca é salva nem compartilhada.
      </p>
    </div>
  )
}

export default Settings
