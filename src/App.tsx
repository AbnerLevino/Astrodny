import { Routes, Route } from 'react-router-dom'
import Home from './ui/screens/Home'
import StudySession from './ui/screens/StudySession'
import Settings from './ui/screens/Settings'

/*
  Moldura de celular + rotas.
  "/"        -> Home (a conversa acontece aqui mesmo, inline)
  "/estudar" -> Sessão de Estudo (o fluxo de 5 telas)
  "/config"  -> Configurações (personalidade do tutor, etc.)
*/
function App() {
  return (
    <div className="min-h-dvh w-full flex justify-center bg-[#05060f]">
      <div className="w-full max-w-[440px]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/estudar" element={<StudySession />} />
          <Route path="/config" element={<Settings />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
