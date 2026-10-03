# Astrodny

Assistente acadêmico pessoal para universitários (mobile-first, PWA).

📄 Visão, arquitetura e roadmap: 

## Stack

React + TypeScript + Vite · Tailwind CSS v4 · vite-plugin-pwa · React Router ·
pdfjs-dist · Vitest

## Rodar no PC

```bash
npm install      # só na primeira vez
npm run dev      # inicia o servidor de desenvolvimento
```

Abre em `http://localhost:5173`.

## Rodar / testar no CELULAR (mesma Wi-Fi)

O Vite já está configurado com `host: true`. Ao rodar `npm run dev`, ele mostra
uma linha **Network** com o IP do PC, por exemplo:

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.0.12:5173/     <-- este
```

1. Celular e PC na **mesma rede Wi-Fi**.
2. No navegador do celular, abra o endereço **Network**.
3. Para instalar como "app": menu do navegador → **Adicionar à tela inicial**.

> Se não abrir no celular, o Firewall do Windows pode estar bloqueando a porta
> 5173 — libere-a para redes privadas.

## Outros comandos

```bash
npm run build    # gera a versão de produção
npm run preview  # pré-visualiza a build
npm run lint     # checa o código (oxlint)
npx vitest       # roda os testes
```

## Estrutura (`src/`)

Cada pasta tem um `_LEIA-ME.md` explicando sua responsabilidade:

- `ui/` — as telas
- `motor/` — o método de estudo guiado (o diferencial)
- `ia/` — a porta ProvedorIA (mock / ollama / api)
- `dados/` — Perfil + Memória
- `pdf/` — extração de texto de PDF
