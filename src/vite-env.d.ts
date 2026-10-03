/// <reference types="vite/client" />

// Tipagem das nossas variáveis de ambiente (as que começam com VITE_ ficam
// disponíveis no navegador via import.meta.env). Todas opcionais: se não definir,
// o código usa um padrão. Definir em `.env.local` (não versionado).
interface ImportMetaEnv {
  readonly VITE_OLLAMA_URL?: string // onde o Ollama/proxy responde
  readonly VITE_OLLAMA_MODEL?: string // qual modelo usar (ex.: llama3.1:8b)
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
