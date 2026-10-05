# Runbook — Colocar o Astrodny no ar (Vercel + Supabase)

> Passo a passo pra publicar. Tudo aqui é **ops** (ações nos painéis, exigem seu login).
> O código já está pronto e no GitHub: https://github.com/AbnerLevino/Astrodny (branch `main`).

## Estado atual (o que já está feito)
- ✅ Backend serverless em `api/` (`generate`, `stream`) — cadeia Gemini→Groq server-side, coleta anônima no Supabase. Testado contra as APIs reais.
- ✅ Cliente `proxyProvider` + `deviceAnon`; troca dev/prod (`import.meta.env.PROD`): DEV usa Ollama/diretos, PROD usa o proxy.
- ✅ Código no GitHub (`AbnerLevino/Astrodny`, `main`). `.env.local` protegido (ignorado via `*.local`).
- ✅ Tabela `astrocore_dataset` criada no banco (migrar/confirmar no Supabase).

## Regra de ouro da segurança
No Vercel, cadastrar **apenas** as variáveis **sem** o prefixo `VITE_`. As `VITE_*` do `.env.local` são só pra desenvolvimento — se forem pro Vercel, a chave vaza no bundle do navegador.

---

## Passo 1 — Supabase (pegar as credenciais)
1. Abrir o projeto no [supabase.com](https://supabase.com) → **Settings → API**.
2. Copiar:
   - **Project URL** (ex.: `https://xxxx.supabase.co`) → será `SUPABASE_URL`.
   - **service_role key** (a secreta, NÃO a `anon`) → será `SUPABASE_SERVICE_KEY`.
3. Confirmar que a tabela `astrocore_dataset` existe (rodar o SQL no SQL Editor, se ainda não rodou lá).

## Passo 2 — Vercel (importar o projeto)
1. [vercel.com](https://vercel.com) → **Add New → Project** → importar `AbnerLevino/Astrodny` do GitHub.
2. Framework: **Vite** (detecta sozinho). Build/Output: deixar o padrão. A pasta `api/` vira funções automaticamente.

## Passo 3 — Vercel (variáveis de ambiente) — SÓ as sem `VITE_`
Em **Project → Settings → Environment Variables**, adicionar:

| Nome | Valor |
|---|---|
| `GROQ_API_KEY` | (a chave do Groq) |
| `GROQ_MODEL` | `openai/gpt-oss-120b` |
| `GEMINI_API_KEY` | (a chave do Gemini) |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `SUPABASE_URL` | (Project URL do Passo 1) |
| `SUPABASE_SERVICE_KEY` | (service_role key do Passo 1) |

## Passo 4 — Deploy e teste
1. **Deploy** (o Vercel faz sozinho após o import; ou botão **Redeploy** após salvar as variáveis).
2. Abrir a URL do Vercel no **celular**.
3. Testar: montar um estudo (objetiva e completa) + mandar uma mensagem no chat.
4. Conferir no Supabase → **Table Editor → astrocore_dataset** se as linhas estão chegando (type/input/output/device_anon).

## Depois (quando quiser)
- **Piloto da amiga:** não divulgar a URL (ou pôr um PIN simples). O deploy já é o "ambiente dela".
- **Teste local do backend** (opcional, antes de deploy): `npm i -g vercel` → `vercel dev` → serve o front + `api/` juntos.
- Conferir os limites do `gemini-3.8-flash` (os números anotados no spec eram do `2.0-flash`).

> Dúvidas de conceito (o que a `api` faz, por que a chave vai pra lá): ver o spec em
> `docs/superpowers/specs/2026-10-03-astrodny-infra-distribuicao-design.md`.
