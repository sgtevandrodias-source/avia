import { CATEGORIA_COMPARTILHADO, type Item, type ItemCompartilhadoLocal } from '../types/item';

/**
 * Converte um compartilhamento recebido e aceito num Item compatível com
 * ItemCard/PeriodoScreen/CalendarioScreen — id é o do COMPARTILHAMENTO
 * (nunca colide com um id de item próprio), categoria usa o sentinela
 * CATEGORIA_COMPARTILHADO (não existe em CategoriasContext; o nome/ícone/cor
 * de exibição vêm do próprio snapshot, ver categoriaNomeCompartilhado/etc.).
 * Sem recorrência/prioridade/lembrete própria — quem "dono" dessas
 * propriedades é sempre o item original de quem compartilhou.
 */
export function itemDeCompartilhamento(c: ItemCompartilhadoLocal): Item {
  return {
    id: c.id,
    textoOriginal: c.textoOriginal,
    titulo: c.titulo,
    data: c.data,
    horaCompromisso: c.horaCompromisso,
    horaLimite: c.horaLimite,
    tipoHorario: c.tipoHorario,
    categoria: CATEGORIA_COMPARTILHADO,
    status: c.concluidoPeloDestinatario ? 'feito' : 'pendente',
    recorrencia: 'nenhuma',
    lembreteOffsetMinutos: 0,
    prioridade: false,
    origemRecorrenciaId: null,
    recorrenciaGeradaAte: null,
    notas: c.notas,
    criadoEm: c.atualizadoEm,
    concluidoEm: null,
    atualizadoEm: c.atualizadoEm,
    somenteLeitura: true,
    compartilhamentoId: c.id,
    compartilhadoPorNome: c.criadorNome,
    categoriaNomeCompartilhado: c.categoriaNome,
    categoriaIconeCompartilhado: c.categoriaIcone,
    categoriaCorCompartilhado: c.categoriaCor,
  };
}
