/*
  Sessões de Estudos (rota /sessoes): histórico de tudo que o aluno já
  estudou, agrupado por matéria, com métricas no topo. PURA no sentido de
  dado — nada aqui chama IA (ver application/metricasSessoes); é só
  agregação sobre o que `useStudies()` já tem.

  "Continuar" numa sessão em andamento RETOMA de verdade o Study já salvo:
  manda o StudySalvo inteiro via state da rota pro /estudar, que detecta
  isso e pula direto pra etapa 'aula' no bloco onde o aluno parou — sem
  chamar a IA de novo (ver StudySession.tsx, variável `retomar`).
*/
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StudySalvo } from '../../domain/study'
import { useStudies } from '../studies'
import { tendenciaRecente, blocoMaisFraco, frequenciaEstudo } from '../../application/metricasSessoes'
import Sidebar from './Sidebar'

function agruparPorMateria(estudos: StudySalvo[]): [string, StudySalvo[]][] {
  const grupos = new Map<string, StudySalvo[]>()
  for (const e of estudos) {
    const lista = grupos.get(e.materia) ?? []
    lista.push(e)
    grupos.set(e.materia, lista)
  }
  return [...grupos.entries()]
}

function SessoesEstudo() {
  const navigate = useNavigate()
  const { estudos } = useStudies()

  const tendencia = tendenciaRecente(estudos)
  const blocoFraco = blocoMaisFraco(estudos)
  const frequencia = frequenciaEstudo(estudos)
  const temMetrica = tendencia || blocoFraco || frequencia
  const grupos = agruparPorMateria(estudos)

  return (
    <div className="relative isolate overflow-hidden h-svh flex flex-col bg-[#2e2f36] text-white lg:flex-row">
      <Sidebar apenasDesktop aoSelecionar={() => {}} />
      <div className="relative flex min-w-0 min-h-0 flex-1 flex-col bg-[#0a0d1f]">
        <header className="px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mx-auto flex w-full items-center gap-3 lg:max-w-[860px]">
            <button type="button" onClick={() => navigate('/')} aria-label="Voltar" className="shrink-0 text-3xl leading-none -mt-1">
              ‹
            </button>
            <span className="text-lg font-semibold">Sessões de Estudos</span>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto sem-scrollbar px-5 pt-6 pb-10">
          <div className="mx-auto flex w-full flex-col gap-6 lg:max-w-[860px]">
            {estudos.length === 0 ? (
              <p className="mt-10 text-center text-sm text-white/50">
                Nenhum estudo ainda — comece um em "Estudar" pra ver seu histórico aqui.
              </p>
            ) : (
              <>
                {temMetrica && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {tendencia && <CardMetrica titulo={`Tendência em ${tendencia.materia}`} valor={<Tendencia t={tendencia} />} />}
                    {blocoFraco && (
                      <CardMetrica
                        titulo="Tópico mais fraco"
                        valor={<span className="text-base font-semibold">{blocoFraco.titulo}</span>}
                        legenda={`${blocoFraco.erros} erro${blocoFraco.erros === 1 ? '' : 's'} registrado${blocoFraco.erros === 1 ? '' : 's'}`}
                      />
                    )}
                    {frequencia && (
                      <CardMetrica
                        titulo="Frequência"
                        valor={<span className="text-base font-semibold">{frequencia.totalSessoes} sessões</span>}
                        legenda={
                          frequencia.diasConsecutivos > 1
                            ? `${frequencia.diasConsecutivos} dias seguidos estudando`
                            : undefined
                        }
                      />
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-5">
                  {grupos.map(([materia, lista]) => (
                    <div key={materia}>
                      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-white/40">{materia}</p>
                      <div className="flex flex-col gap-2">
                        {lista.map((e) => (
                          <ItemSessao
                            key={e.id}
                            estudo={e}
                            aoContinuar={() => navigate('/estudar', { state: { retomar: e } })}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function CardMetrica({ titulo, valor, legenda }: { titulo: string; valor: ReactNode; legenda?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{titulo}</p>
      <div className="mt-1.5">{valor}</div>
      {legenda && <p className="mt-1 text-xs text-white/50">{legenda}</p>}
    </div>
  )
}

function Tendencia({ t }: { t: { direcao: 'subindo' | 'caindo' | 'estavel'; atual: number; anterior: number } }) {
  const cor = t.direcao === 'subindo' ? 'text-emerald-400' : t.direcao === 'caindo' ? 'text-red-400' : 'text-white/80'
  const seta = t.direcao === 'subindo' ? '↑' : t.direcao === 'caindo' ? '↓' : '→'
  return (
    <span className={`text-base font-semibold ${cor}`}>
      {seta} {Math.round(t.atual * 100)}%{' '}
      <span className="text-xs font-normal text-white/40">(antes {Math.round(t.anterior * 100)}%)</span>
    </span>
  )
}

function ItemSessao({ estudo, aoContinuar }: { estudo: StudySalvo; aoContinuar: () => void }) {
  const concluido = estudo.resultado !== null
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white/90">{estudo.estudo.nome}</p>
        <p className="text-xs text-white/50">
          {concluido
            ? `${estudo.resultado!.acertos}/${estudo.resultado!.total} acertos`
            : `bloco ${(estudo.progresso?.blocoAtual ?? 0) + 1}/${estudo.progresso?.totalBlocos ?? '?'}`}{' '}
          · {new Date(estudo.data).toLocaleDateString('pt-BR')}
        </p>
      </div>
      {!concluido && (
        <button
          type="button"
          onClick={aoContinuar}
          className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/10"
        >
          Continuar
        </button>
      )}
    </div>
  )
}

export default SessoesEstudo
