# Landing — Combat Maps

HTML, CSS e JS puros. Sem build, sem dependência: abra `index.html` ou sirva a
pasta.

```bash
python3 -m http.server 8177    # e abra http://localhost:8177
```

## Antes de publicar

1. **Para onde vão os cadastros.** Em `main.js`, preencha `ENDPOINT` com a URL do
   serviço que vai receber o formulário (Formspree, Getform, um Worker seu). Sem
   ele, o formulário abre o cliente de e-mail do visitante com a resposta pronta —
   funciona, mas depende de a pessoa apertar enviar.
2. **O e-mail de contato.** `EMAIL_FALLBACK` em `main.js` e o endereço citado nas
   mensagens de erro estão como `contato@combatmaps.com.br`.
3. **As fotos que faltam.** Hoje existe uma só: `assets/projetor.jpg` (+ `.webp`).
   Quando chegarem as outras duas ou três, os lugares naturais são: a mesa em uso
   vista de cima, o aparelho instalado no teto de uma sala real, e o detalhe do
   marcador colado na miniatura. A cena da mesa hoje é uma **ilustração** e está
   rotulada como tal na página — troque-a pela foto real assim que possível.

## Preços na página

**US$ 799**, um preço só. Aparece em dois lugares: o cartão da seção de preço e a
pergunta de validação do formulário (que também vai no corpo do e-mail em
`main.js`). Se mudar, mude nos dois.
