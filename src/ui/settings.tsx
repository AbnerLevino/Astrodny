/*
  Estado global das preferências do usuário — Context do React.

  RESPONSABILIDADE ÚNICA: guardar a Config atual e deixar trocá-la. Não sabe o que
  é uma "personalidade" na prática (isso é do prompt, na application) — só guarda a
  escolha e persiste. Mesmo padrão de ChatsProvider/StudiesProvider.
*/
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Config, Personalidade } from '../domain/settings'
import { validarChave, type Provedor, type ResultadoValidacao } from '../infrastructure/ai/validarChave'
import { localStorageSettingsRepository } from '../infrastructure/storage/localStorageSettingsRepository'

// Onde as preferências são guardadas. Trocar localStorage -> nuvem é mudar SÓ esta linha.
const repo = localStorageSettingsRepository

type SettingsContexto = {
  config: Config
  personalidade: Personalidade // atalho pro campo mais usado
  definirPersonalidade: (p: Personalidade) => void
  groqApiKey: string
  definirGroqApiKey: (chave: string) => void
  geminiApiKey: string
  definirGeminiApiKey: (chave: string) => void
  // resultado da verificação junto ao provedor (ver domain/settings.ts)
  chavesValidas: Config['chavesValidas']
  marcarChaveValida: (provedor: Provedor, valida: boolean) => void
  // verificação em andamento / último resultado, por provedor — vive AQUI (e não em cada
  // componente) pra que o selo do acordeão e o campo mostrem a mesma coisa e a chave
  // não seja conferida duas vezes quando dois componentes montam juntos.
  verificacao: Record<Provedor, Verificacao>
  verificarChave: (provedor: Provedor, chave?: string) => Promise<void>
  // as duas chaves verificadas e aceitas — esconde o botão de chave do topo das telas
  chavesProntas: boolean
}

export type Verificacao = { verificando: boolean; ultimo: ResultadoValidacao | null }
const SEM_VERIFICACAO: Record<Provedor, Verificacao> = {
  groq: { verificando: false, ultimo: null },
  gemini: { verificando: false, ultimo: null },
}

const Contexto = createContext<SettingsContexto | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  // carrega a preferência salva UMA vez, na montagem (initializer preguiçoso)
  const [config, setConfig] = useState<Config>(() => repo.carregar())
  const [verificacao, setVerificacao] = useState(SEM_VERIFICACAO)
  // refs com o valor atual: verificarChave é async e pode ser chamada de closures antigas
  const configRef = useRef(config)
  configRef.current = config
  const verificacaoRef = useRef(verificacao)
  verificacaoRef.current = verificacao

  // salva sempre que a config muda
  useEffect(() => {
    repo.salvar(config)
  }, [config])

  function definirPersonalidade(p: Personalidade) {
    setConfig((prev) => ({ ...prev, personalidade: p }))
  }

  // trocar a chave invalida a verificação anterior (a nova ainda não foi conferida)
  function definirChave(provedor: Provedor, chave: string) {
    const limpa = chave.trim()
    const campo = provedor === 'groq' ? 'groqApiKey' : 'geminiApiKey'
    setConfig((prev) =>
      prev[campo] === limpa ? prev : { ...prev, [campo]: limpa, chavesValidas: { ...prev.chavesValidas, [provedor]: false } },
    )
    setVerificacao((prev) => ({ ...prev, [provedor]: { verificando: false, ultimo: null } }))
  }
  const definirGroqApiKey = (chave: string) => definirChave('groq', chave)
  const definirGeminiApiKey = (chave: string) => definirChave('gemini', chave)

  function marcarChaveValida(provedor: Provedor, valida: boolean) {
    setConfig((prev) => ({ ...prev, chavesValidas: { ...prev.chavesValidas, [provedor]: valida } }))
  }

  // Confere a chave junto ao provedor. `chave` explícita serve pra verificar logo depois
  // de definir (o state ainda não atualizou). Ignora se já há uma verificação rodando.
  async function verificarChave(provedor: Provedor, chave?: string) {
    const atual = configRef.current
    const valor = (chave ?? (provedor === 'groq' ? atual.groqApiKey : atual.geminiApiKey)).trim()
    if (!valor || verificacaoRef.current[provedor].verificando) return
    setVerificacao((prev) => ({ ...prev, [provedor]: { verificando: true, ultimo: null } }))
    const resultado = await validarChave(provedor, valor)
    setVerificacao((prev) => ({ ...prev, [provedor]: { verificando: false, ultimo: resultado } }))
    if (resultado !== 'erro') marcarChaveValida(provedor, resultado === 'valida')
  }

  return (
    <Contexto.Provider
      value={{
        config,
        personalidade: config.personalidade,
        definirPersonalidade,
        groqApiKey: config.groqApiKey,
        definirGroqApiKey,
        geminiApiKey: config.geminiApiKey,
        definirGeminiApiKey,
        chavesValidas: config.chavesValidas,
        marcarChaveValida,
        verificacao,
        verificarChave,
        chavesProntas: config.chavesValidas.groq && config.chavesValidas.gemini,
      }}
    >
      {children}
    </Contexto.Provider>
  )
}

// hook pra usar as preferências em qualquer tela
export function useSettings() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSettings precisa estar dentro de <SettingsProvider>')
  return ctx
}
