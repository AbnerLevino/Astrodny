/*
  CASO DE USO (application) — pure: pega a amostra de mensagens de abertura
  pro motor de insight do Painel. Só a 1ª mensagem de cada chat criado nas
  últimas 5h, até um limite — enriquece o prompt aos poucos sem explodir
  tokens nem ler conversas inteiras.
*/
import type { Chat } from '../domain/chat'

const JANELA_MS = 5 * 60 * 60 * 1000 // 5 horas
const LIMITE = 5

export function amostrarMensagensDeAbertura(chats: Chat[], agora: number): string[] {
  return chats
    .filter((c) => c.criadoEm !== undefined && agora - c.criadoEm <= JANELA_MS)
    .sort((a, b) => (b.criadoEm ?? 0) - (a.criadoEm ?? 0)) // mais recentes primeiro
    .slice(0, LIMITE)
    .map((c) => c.mensagens[0]?.texto)
    .filter((texto): texto is string => !!texto)
}
