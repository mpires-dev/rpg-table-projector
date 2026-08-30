# Mesa AR — RPG de mesa com tabuleiro projetado

Uma mesa de RPG onde o tabuleiro é **projetado** e as peças físicas são
reconhecidas por uma câmera. Cada peça leva um marcador ArUco colado no topo; o
app sabe qual peça é, em que casa ela está e para onde está virada.

Roda 100% no navegador: Vite + Canvas 2D + [js-aruco2](https://github.com/damianofalcioni/js-aruco2)
(vendorizado em `src/vendor/`, MIT). Sem servidor, sem WASM, sem build pesado.

**No ar:** https://rpg-table-projector-production.up.railway.app

Em produção quem serve o build é o `server.js` — http nativo do Node, sem
dependências: o app é estático, e uma biblioteca a mais aqui seria superfície de
atualização de segurança para nada.

## As três telas

| Rota | Onde fica | Papel |
| --- | --- | --- |
| `/` | monitor do notebook | **Console do mestre**: preview da câmera, peças em cena, log da partida, editor do mapa, ajustes |
| `/projector.html` | saída do projetor | **Tabuleiro 6×6** e os efeitos. Fundo preto, sem interface |
| `/markers.html` | qualquer lugar | Folha de marcadores para imprimir |
| `/ar.html` | celular | Modo AR de mão: overlay direto sobre o vídeo, sem projetor |

As telas conversam por `BroadcastChannel`, que só funciona **na mesma origem** —
mesmo protocolo, host e porta. Por isso são rotas do mesmo servidor, e não
servidores em portas diferentes. Trocar `src/bus.js` por um WebSocket é o
caminho para a câmera rodar no celular e a projeção no notebook.

## Rodando

```bash
npm install
npm run dev     # sobe em https (a câmera não abre em http fora de localhost)
npm run selftest # 17 checagens de detecção, matemática e regras, sem browser
```

Abra `https://localhost:5173/`, ligue a câmera e clique em **Projeção** para
abrir a segunda janela. Arraste ela para o monitor do projetor e aperte **F**.

Sem marcadores em mãos, use **Simular**: as peças viram fichas arrastáveis no
tabuleiro do console e a projeção responde igual. Abrir `/?sim=1` já entra nesse
modo — atalho para ensaiar a demo sem montar a mesa.

## O tabuleiro

Grade fixa de **6×6**, sempre um quadrado centralizado na área de projeção, com
colunas A–F e linhas 1–6. A peça não fica "num ponto qualquer": ela fica numa
casa, e é a casa que as regras enxergam.

Terrenos pintáveis pelo console (clique numa casa; clicar de novo limpa):
**normal, difícil, água, lava, parede, objetivo**. O mapa é salvo no
`localStorage` e vai para a projeção na hora.

Distâncias usam **Chebyshev** — diagonal conta como uma casa, como na maioria
das mesas.

## O que a câmera precisa ver

Marcadores **ArUco** do dicionário **ARUCO_MIP_36h12**: quadrado preto com
padrão de 6×6 quadrículas e borda branca. Um por peça, colado no **topo**.

Os IDs **0 a 5** já vêm cadastrados com os personagens padrão.
`docs/marcadores-teste.svg` tem esses seis prontos; `/markers.html` gera
qualquer faixa até o ID 249.

- **A borda branca faz parte do marcador.** Recortar rente ao preto é a causa
  número um de "não detecta".
- **Tamanho manda na distância.** 3 cm lê até ~1 m, 6 cm até ~2 m.
- **Contraste, não intensidade.** Luz difusa bate luz forte; papel fosco bate
  papel brilhante.
- **Nunca repita um ID** em duas peças.

## Por que ele via cinco peças quando você mostrava uma

O dicionário 36h12 tolera até **12 bits errados** por marcador, e o js-aruco2 usa
essa tolerância como corte por padrão. É ótimo para robustez e péssimo para falso
positivo: com essa folga, quase qualquer quadrado escuro com textura dentro casa
com *algum* dos 250 códigos.

São quatro filtros em série, todos ajustáveis no console:

1. **Distância de Hamming ≤ 3** (era 12). Sozinho, resolve a maior parte.
2. **Confirmação temporal**: 3 quadros seguidos vendo o mesmo ID antes de aceitar
   a peça. Falso positivo raramente sobrevive a três quadros no mesmo lugar.
3. **Só IDs do elenco** (ligado por padrão). Um ID que ninguém cadastrou não
   entra em cena — é o filtro mais brutal e o mais eficaz.
4. **Tamanho mínimo** e **um marcador por ID** por quadro (fica o maior).

O painel de diagnóstico embaixo do preview mostra os três números:
`lidos · fora do elenco · confirmados`. Se "lidos" for alto e "confirmados"
estável, os filtros estão trabalhando.

## Performance

A detecção roda num **Web Worker** com `OffscreenCanvas`; o main thread só faz
`createImageBitmap` e desenha. Onde worker ou OffscreenCanvas não existem, cai
sozinho para a thread principal sem mudar o resto do app.

Há sempre **um frame em voo por vez**: se a detecção ainda não voltou, o frame
novo é descartado em vez de entrar na fila. Enfileirar faria a posição projetada
atrasar cada vez mais em relação à peça de verdade.

O desenho não espera pela detecção — segue em 60 fps com as últimas posições
conhecidas, suavizadas por média móvel exponencial.

## Calibração (câmera → projetor)

Câmera e projetor olham a mesa de ângulos diferentes; quem concilia os dois é uma
**homografia** (matriz 3×3).

1. Com a projeção aberta, clique em **Calibrar** no console.
2. A projeção acende 4 alvos numerados na mesa.
3. Clique no preview da câmera exatamente onde cada alvo aparece, na ordem.

A matriz fica salva no `localStorage`. Se os 4 cliques saírem quase alinhados, o
app avisa e recomeça em vez de gravar uma matriz torta.

Sem calibração a projeção desenha direto — o suficiente para testar no PC sem
projetor nenhum.

## Estrutura

| Arquivo | O que faz |
| --- | --- |
| `src/console.js` | Console do mestre (tela `/`) |
| `src/projector.js` | Janela de projeção |
| `src/ar.js` | Modo AR de celular (`/ar.html`) |
| `src/vision.js` | Câmera + detector + tracker, o arranjo usado pelas duas telas |
| `src/camera.js` | `getUserMedia`, troca de câmera, lanterna |
| `src/detectCore.js` | Detecção de um frame e os filtros anti-falso-positivo |
| `src/detector.worker.js` | A detecção rodando fora do main thread |
| `src/detectorClient.js` | Fachada worker/fallback, com um frame em voo por vez |
| `src/tracker.js` | Suavização, confirmação temporal e hold; define as coordenadas |
| `src/board.js` | Tabuleiro 6×6: layout, casas, terrenos, desenho |
| `src/rules.js` | Lógica de jogo (ameaça por adjacência). É aqui que entram regras novas |
| `src/events.js` | Transições viram linhas do log do mestre |
| `src/projectorScene.js` | O desenho da projeção, compartilhado com os previews |
| `src/overlay.js` | Auras, rótulos, setas, linhas de ameaça |
| `src/homography.js` | A matriz 3×3 da calibração, resolvida na mão |
| `src/calibration.js` | Alvos, persistência e conversão câmera → projeção |
| `src/viewport.js` | Coordenada normalizada → pixel (corrige `object-fit: cover`) |
| `src/board.js`, `src/roster.js` | Estado persistido: mapa e elenco |
| `tools/selftest.mjs` | `npm run selftest` |

### Coordenadas

Tudo circula normalizado **pela largura do frame**: `nx = x/largura`,
`ny = y/largura`. Os dois eixos divididos pela largura preservam a proporção,
então distância euclidiana continua sendo distância de verdade. `ny` vai de 0 até
`altura/largura` em vez de 0..1 — é de propósito.

O tabuleiro vive no espaço da projeção; a homografia leva a peça da câmera para
lá, e só então ela vira uma casa.

## Antes de caçar bug na câmera

```bash
npm run selftest
```

Cobre detecção sobre marcador sintético, os filtros de Hamming e tamanho, a
confirmação temporal e o hold do tracker, a homografia, o caminho
câmera → projeção e as 36 casas do tabuleiro. Se passar, o problema está na
captura: iluminação, foco, tamanho do marcador ou distância.

## Próximos passos

- Efeitos por terreno na projeção (dano em lava, movimento reduzido em difícil).
- Iniciativa e turnos no console.
- Câmera no celular + projeção no PC: trocar `src/bus.js` por WebSocket.
- Trava de foco/exposição, para o projetor não fazer o autofoco passear.
