/// <reference types="vite/client" />

// Tipagem das nossas variáveis de ambiente (as que começam com VITE_ ficam
// disponíveis no navegador via import.meta.env). Todas opcionais: se não definir,
// o código usa um padrão. Definir em `.env.local` (não versionado).
interface ImportMetaEnv {
  readonly VITE_GROQ_API_KEY?: string
  readonly VITE_GROQ_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
