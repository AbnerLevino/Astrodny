import { Routes, Route } from 'react-router-dom'
import Painel from './ui/screens/Painel'
import Conversa from './ui/screens/Conversa'
import StudySession from './ui/screens/StudySession'
import Trabalho from './ui/screens/Trabalho'
import Settings from './ui/screens/Settings'

/*
  Moldura de celular + rotas.
  "/"         -> Painel (tela inicial: título + sugestões + os 4 atalhos)
  "/chat"     -> Conversa, chat em branco (a conversa acontece aqui, inline)
  "/chat/:id" -> Conversa, abre um chat existente do histórico
  "/estudar"  -> Sessão de Estudo (o fluxo de 5 telas)
  "/trabalhos"-> Trabalhos (colar texto -> IA estrutura -> visualizer ABNT)
  "/config"   -> Configurações (personalidade do tutor, etc.)
*/
function App() {
  return (
    <div className="min-h-dvh w-full flex justify-center bg-[#05060f]">
      {/* moldura de celular SÓ no mobile: em telas grandes (lg+) o teto some e o
          app ocupa a largura toda, pra caber a sidebar fixa + o conteúdo. */}
      <div className="w-full max-w-[440px] lg:max-w-none">
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/chat" element={<Conversa />} />
          <Route path="/chat/:id" element={<Conversa />} />
          <Route path="/estudar" element={<StudySession />} />
          <Route path="/trabalhos" element={<Trabalho />} />
          <Route path="/config" element={<Settings />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
