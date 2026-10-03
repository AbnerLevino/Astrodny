/*
  Estado global das preferências do usuário — Context do React.

  RESPONSABILIDADE ÚNICA: guardar a Config atual e deixar trocá-la. Não sabe o que
  é uma "personalidade" na prática (isso é do prompt, na application) — só guarda a
  escolha e persiste. Mesmo padrão de ChatsProvider/StudiesProvider.
*/
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Config, Personalidade } from '../domain/settings'
import { localStorageSettingsRepository } from '../infrastructure/storage/localStorageSettingsRepository'

// Onde as preferências são guardadas. Trocar localStorage -> nuvem é mudar SÓ esta linha.
const repo = localStorageSettingsRepository

type SettingsContexto = {
  config: Config
  personalidade: Personalidade // atalho pro campo mais usado
  definirPersonalidade: (p: Personalidade) => void
}

const Contexto = createContext<SettingsContexto | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  // carrega a preferência salva UMA vez, na montagem (initializer preguiçoso)
  const [config, setConfig] = useState<Config>(() => repo.carregar())

  // salva sempre que a config muda
  useEffect(() => {
    repo.salvar(config)
  }, [config])

  function definirPersonalidade(p: Personalidade) {
    setConfig((prev) => ({ ...prev, personalidade: p }))
  }

  return (
    <Contexto.Provider value={{ config, personalidade: config.personalidade, definirPersonalidade }}>
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
