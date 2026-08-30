# Design — Combat Maps

Dois mundos visuais convivem neste repositório, de propósito.

## 1. Console do mestre (`/`, `/ar.html`)

Interface de operação, usada durante a partida. Ver `src/console.css`.

- **Papel e tinta.** Fundo `#f4f1ea`, superfícies `#fffefa`, tinta `#1b1913`.
  Claro porque o mestre lê texto denso nele a noite toda.
- **Os retângulos escuros são conteúdo, não cromo.** Visor da câmera e palco do
  tabuleiro ficam em `#16150f` — são o material do jogo dentro da interface.
- **Painéis sem borda.** Só sombra, em três camadas (contato, difusão,
  penumbra). Uma sombra única não segura a separação quando a borda sai.
- **Tipografia:** Inter Variable na interface, mono do sistema para dados e
  coordenadas (uso legítimo: medida, não fantasia técnica).
- **Ícones:** Heroicons 24/outline, um conjunto só, para stroke e peso óptico
  baterem.
- Acento `#2a4fb0`; verde `#2b6b45`, âmbar `#9a6410` e vermelho `#a83228` como
  estados.

A janela de projeção (`/projector.html`) é preta absoluta: ali cada pixel aceso
vira luz na mesa.

## 2. Landing (`/landing`)

Superfície de venda. Ver `landing/styles.css`.

- **Forma:** showroom premium de produto físico — o padrão da categoria,
  escolhido pelo cliente sobre as direções alternativas e executado em fidelidade
  total. A barra de acabamento é a referência que ele forneceu.
- **Papel quente quase branco** (`#faf8f5`), tinta grafite (`#191510`), **bronze
  como único acento** (`#a9772f`).
- **Preto absoluto** (`#05060a`) nas duas seções em que o produto aparece em
  ação: a mesa projetada e a lista de espera. A página alterna sala acesa e sala
  apagada porque é isso que o produto faz.
- **Tipografia:** Schibsted Grotesk para voz (títulos em peso 500, tracking
  `-0.03em`), Azeret Mono para dados, preços unitários e etiquetas.
- **Sombras** com deslocamento e desfoque, nunca halo colorido. Cartões de plano
  esticam juntos para os botões pousarem na mesma linha.
- **Movimento:** uma entrada só, de baixo para cima com ease-out exponencial,
  escalonada por `data-delay`. Desligada em `prefers-reduced-motion`.

### Regras de honestidade que o visual carrega

- A foto do hardware é a única imagem fotográfica. Toda cena de jogo é
  ilustração vetorial e está rotulada como tal na própria página.
- Especificações aparecem como **metas de projeto**, não medições.
- Nenhum depoimento, logo de imprensa, contador de vendas ou prazo de entrega —
  porque nenhum deles existe ainda.
