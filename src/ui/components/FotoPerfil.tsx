/*
  Avatar do usuário — foto real (Google, se logado) ou um avatar genérico
  (estilo "órbita" dos outros ícones do app, ver IconePerfil em Sidebar.tsx).
  Centralizado aqui porque aparece em 4 telas (Painel, Sidebar x2, Conversa) e
  ANTES disso cada uma usava a mesma imagem estática "/perfil.png" — que não é
  um placeholder genérico, é a foto de uma pessoa real, igual pra todo mundo.
*/

function IconeAvatarGenerico() {
  return (
    <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.3" />
      <circle cx="12" cy="10" r="2.7" />
      <path d="M6.8 18a5.3 5.3 0 0 1 10.4 0" />
    </svg>
  )
}

function FotoPerfil({ foto, className }: { foto: string | null | undefined; className: string }) {
  if (foto) return <img src={foto} alt="" className={`${className} object-cover`} />

  return (
    <span className={`${className} flex items-center justify-center bg-white/10 text-white/70`}>
      <IconeAvatarGenerico />
    </span>
  )
}

export default FotoPerfil
