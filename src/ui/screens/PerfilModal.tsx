/*
  Modal de PERFIL — maior que o ModalPerfil do Sidebar (que é só o menu da
  conta). Este é o FORMULÁRIO de verdade: nome, curso, matérias e nível.

  Dois usos, mesmo componente:
  - ONBOARDING: abre automaticamente no 1º login (quando falta o curso).
  - EDIÇÃO: abre ao tocar em "Perfil" dentro do ModalPerfil (Sidebar).

  Tela cheia no MOBILE (como uma tela própria, sem cantos arredondados) —
  no DESKTOP vira um cartão grande centralizado (maior que os outros modais,
  porque aqui tem formulário, não só uma lista de opções).
*/
import { useEffect, useState, type ReactNode } from 'react'
import { type Nivel, type Perfil } from '../../domain/perfil'
import { AREAS_CURSOS } from '../../domain/cursos'
import { materiasDoCurso } from '../../domain/materiasPorCurso'

const NIVEIS: { valor: Nivel; label: string }[] = [
  { valor: 'iniciante', label: 'Iniciante' },
  { valor: 'intermediario', label: 'Intermediário' },
  { valor: 'avancado', label: 'Avançado' },
]

function PerfilModal({
  perfil,
  onboarding = false,
  aoSalvar,
  aoFechar,
}: {
  perfil: Perfil
  // true = veio do onboarding automático (tom de boas-vindas no título)
  onboarding?: boolean
  aoSalvar: (dados: Perfil) => void
  aoFechar: () => void
}) {
  const [curso, setCurso] = useState(perfil.curso ?? '')
  const [materias, setMaterias] = useState<string[]>(perfil.materias ?? [])
  const [nivel, setNivel] = useState<Nivel | ''>(perfil.nivel ?? '')
  // picker de curso é um overlay PRÓPRIO (não <select> nativo): no celular o
  // select nativo abre o picker do sistema e ignora todo o nosso CSS — não dá
  // pra deixar o título da área com opacidade menor daquela forma.
  const [cursoAberto, setCursoAberto] = useState(false)
  const [materiaPickerAberto, setMateriaPickerAberto] = useState(false)

  // troca de curso: as matérias escolhidas eram de outro curso, então zera —
  // evita ficar com matérias "soltas" de um curso que não é mais o selecionado.
  function trocarCurso(novoCurso: string) {
    setCurso(novoCurso)
    setMaterias([])
  }

  function alternarMateria(materia: string) {
    setMaterias((prev) => (prev.includes(materia) ? prev.filter((m) => m !== materia) : [...prev, materia]))
  }

  function removerMateria(materia: string) {
    setMaterias((prev) => prev.filter((m) => m !== materia))
  }

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const podeSalvar = curso.trim().length > 0

  function salvar() {
    if (!podeSalvar) return
    aoSalvar({
      nome: perfil.nome,
      curso: curso.trim(),
      nivel: nivel || undefined,
      materias,
    })
    aoFechar()
  }

  return (
    <div className="fixed inset-0 z-[80] flex lg:items-center lg:justify-center" role="dialog" aria-modal="true">
      {/* fundo: só existe (clicável p/ fechar) no desktop — no mobile é tela cheia, sem o que fechar atrás */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm lg:block hidden" onClick={aoFechar} />

      <div className="animar-subida relative z-10 flex h-dvh w-full flex-col bg-[#141416] text-white lg:h-auto lg:max-h-[85vh] lg:w-[34rem] lg:rounded-3xl lg:border lg:border-white/10">
        {/* cabeçalho */}
        <div className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 lg:pt-6">
          <div>
            <h2 className="text-xl font-bold">{onboarding ? 'Vamos se conhecer!' : 'Seu perfil'}</h2>
            {onboarding && (
              <p className="mt-1 text-sm text-white/55">
                Ajude o Astrodny te conhecer melhor fazendo ele responder direto ao ponto, lembrar das suas provas e criar estudos das suas matérias.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <IconeFechar />
          </button>
        </div>

        {/* formulário (rola se precisar, sem derrubar o rodapé) */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <Campo label="Nome">
            <p className="rounded-xl bg-white/5 px-4 py-3 text-[15px] text-white/70">{perfil.nome}</p>
          </Campo>

          <Campo label="Curso" obrigatorio>
            <button
              type="button"
              autoFocus={onboarding}
              onClick={() => setCursoAberto(true)}
              className={`w-full truncate rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left text-[15px] outline-none transition-colors focus:border-white/40 ${
                curso ? 'text-white' : 'text-white/35'
              }`}
            >
              {curso || 'Selecione seu curso'}
            </button>
          </Campo>

          <Campo label="Matérias que você está estudando agora">
            {materias.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {materias.map((m) => (
                  <span
                    key={m}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/85"
                  >
                    <span className="truncate">{m}</span>
                    <button
                      type="button"
                      onClick={() => removerMateria(m)}
                      aria-label={`Remover ${m}`}
                      className="shrink-0 text-white/40 transition-colors hover:text-white"
                    >
                      <IconeFechar tamanho={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setMateriaPickerAberto(true)}
              disabled={!curso}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left text-[15px] text-white/35 outline-none transition-colors focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {curso ? 'Selecionar matérias do curso' : 'Selecione um curso primeiro'}
            </button>
          </Campo>

          <Campo label="Nível">
            <div className="flex gap-2">
              {NIVEIS.map((n) => (
                <button
                  key={n.valor}
                  type="button"
                  onClick={() => setNivel(n.valor)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    nivel === n.valor
                      ? 'border-white/80 bg-white/15 text-white'
                      : 'border-white/15 text-white/60 hover:bg-white/5'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </Campo>
        </div>

        {/* rodapé: ações */}
        <div className="flex gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={aoFechar}
            className="flex-1 rounded-full border border-white/15 px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/5"
          >
            {onboarding ? 'Agora não' : 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={!podeSalvar}
            className="flex-1 rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#142073] transition-opacity disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* picker de curso (overlay próprio, por cima deste modal) */}
      {cursoAberto && (
        <CursoPicker
          selecionado={curso}
          aoSelecionar={trocarCurso}
          aoFechar={() => setCursoAberto(false)}
        />
      )}

      {/* picker de matérias do curso escolhido (multi-seleção) */}
      {materiaPickerAberto && (
        <MateriaPicker
          curso={curso}
          selecionadas={materias}
          aoAlternar={alternarMateria}
          aoFechar={() => setMateriaPickerAberto(false)}
        />
      )}
    </div>
  )
}

// Seletor de curso: bottom sheet (mobile) / cartão (desktop) com busca e as
// áreas agrupadas. O TÍTULO de cada área fica em opacidade baixa (text-white/35,
// sem hover, não clicável); as OPÇÕES (os cursos) ficam em opacidade normal e
// são os botões de verdade.
function CursoPicker({
  selecionado,
  aoSelecionar,
  aoFechar,
}: {
  selecionado: string
  aoSelecionar: (curso: string) => void
  aoFechar: () => void
}) {
  const [busca, setBusca] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const termo = busca.trim().toLowerCase()
  const grupos = termo
    ? AREAS_CURSOS.map((grupo) => ({
        ...grupo,
        cursos: grupo.cursos.filter((c) => c.toLowerCase().includes(termo)),
      })).filter((grupo) => grupo.cursos.length > 0)
    : AREAS_CURSOS

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={aoFechar} />

      <div className="animar-subida relative z-10 flex max-h-[80vh] w-full flex-col border border-white/10 bg-[#141416] text-white rounded-t-3xl lg:w-[26rem] lg:rounded-3xl">
        <div className="mx-auto mb-2 mt-3 h-1 w-10 rounded-full bg-white/20 lg:hidden" />

        <div className="px-4 pb-3 pt-2 lg:pt-4">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar curso…"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/40"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {grupos.map((grupo) => (
            <div key={grupo.area}>
              {/* título da área — opacidade baixa, só organiza, não é clicável */}
              <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-white/35">{grupo.area}</p>
              {grupo.cursos.map((nomeCurso) => (
                <button
                  key={nomeCurso}
                  type="button"
                  onClick={() => {
                    aoSelecionar(nomeCurso)
                    aoFechar()
                  }}
                  className={`block w-full rounded-lg px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-white/5 ${
                    nomeCurso === selecionado ? 'bg-white/10 text-white' : 'text-white/85'
                  }`}
                >
                  {nomeCurso}
                </button>
              ))}
            </div>
          ))}
          {grupos.length === 0 && <p className="px-3 py-8 text-center text-sm text-white/40">Nenhum curso encontrado.</p>}
        </div>
      </div>
    </div>
  )
}

// Seletor de MATÉRIAS do curso escolhido — multi-seleção (toggle, não fecha ao
// escolher) com busca. Mesmo padrão visual do CursoPicker; some um "Concluir"
// no rodapé pra fechar quando terminar de marcar.
function MateriaPicker({
  curso,
  selecionadas,
  aoAlternar,
  aoFechar,
}: {
  curso: string
  selecionadas: string[]
  aoAlternar: (materia: string) => void
  aoFechar: () => void
}) {
  const [busca, setBusca] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  // base do curso + o que já foi adicionado manualmente antes (senão uma
  // matéria "criada pelo aluno" desapareceria da lista ao reabrir o picker).
  const todas = [...new Set([...materiasDoCurso(curso), ...selecionadas])]
  const termo = busca.trim()
  const termoLower = termo.toLowerCase()
  const materias = termo ? todas.filter((m) => m.toLowerCase().includes(termoLower)) : todas

  // só oferece "criar" quando o termo buscado não é NENHUMA matéria já existente
  // (senão "Programação" sempre ofereceria criar "Programação" de novo).
  const podeCriar = termo.length > 0 && !todas.some((m) => m.toLowerCase() === termoLower)

  function criarEAlternar() {
    aoAlternar(termo)
    setBusca('')
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={aoFechar} />

      <div className="animar-subida relative z-10 flex max-h-[80vh] w-full flex-col border border-white/10 bg-[#141416] text-white rounded-t-3xl lg:w-[26rem] lg:rounded-3xl">
        <div className="mx-auto mb-2 mt-3 h-1 w-10 rounded-full bg-white/20 lg:hidden" />

        <div className="px-4 pb-3 pt-2 lg:pt-4">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && podeCriar) {
                e.preventDefault()
                criarEAlternar()
              }
            }}
            placeholder="Buscar matéria… ou digitar uma nova"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/40"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {materias.map((materia) => {
            const marcada = selecionadas.includes(materia)
            return (
              <button
                key={materia}
                type="button"
                onClick={() => aoAlternar(materia)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-white/5 ${
                  marcada ? 'text-white' : 'text-white/85'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    marcada ? 'border-white bg-white' : 'border-white/30'
                  }`}
                >
                  {marcada && <IconeCheck />}
                </span>
                <span className="truncate">{materia}</span>
              </button>
            )
          })}

          {/* não achou? cria e já marca como selecionada — some a lacuna "não achei a matéria" */}
          {podeCriar && (
            <button
              type="button"
              onClick={criarEAlternar}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-white/85 transition-colors hover:bg-white/5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-dashed border-white/40 text-white/60">+</span>
              <span className="truncate">
                Adicionar <span className="font-semibold text-white">"{termo}"</span> como matéria
              </span>
            </button>
          )}

          {materias.length === 0 && !podeCriar && (
            <p className="px-3 py-8 text-center text-sm text-white/40">Nenhuma matéria encontrada.</p>
          )}
        </div>

        <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={aoFechar}
            className="w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#142073]"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({
  label,
  dica,
  obrigatorio,
  children,
}: {
  label: string
  dica?: string
  obrigatorio?: boolean
  children: ReactNode
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium text-white/80">
        {label}
        {obrigatorio && <span className="text-white/40"> (obrigatório)</span>}
      </label>
      {children}
      {dica && <p className="mt-1 text-xs text-white/40">{dica}</p>}
    </div>
  )
}

function IconeFechar({ tamanho = 20 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

// Check dentro da caixinha marcada (MateriaPicker)
function IconeCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#141416" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export default PerfilModal
