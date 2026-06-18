# Sistema de Ponto — Grupo Shalom (v2)

Mesma estrutura do projeto anterior: **Express + SQLite + pasta `public`**, mesmo serviço no Render, mesma URL (`ponto-shalom.onrender.com`).

## Estrutura
```
ponto-shalom/
├── server.js          # backend (API + SQLite)
├── package.json
├── .gitignore
└── public/
    ├── index.html     # telas
    ├── css/style.css
    └── js/app.js       # lógica (conversa com a API)
```

## Como atualizar (sem mudar a URL)
Você já tem o repositório no GitHub e o serviço no Render. É só substituir os arquivos:

1. Copie `server.js`, `package.json` e a pasta `public/` por cima dos antigos no seu repositório local.
2. Na janela do Git, rode:
   ```
   git add .
   git commit -m "sistema de ponto v2"
   git push origin main
   ```
3. O Render detecta o push e republica **no mesmo endereço**.

## Configuração do Render (mantém a que você já tem)
- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- **Disco persistente:** já montado em `/data` (é onde ficam o banco e as fotos — nada se perde em deploy).
- **Environment → variável `TZ` = `America/Sao_Paulo`** (recomendado; o código já calcula o horário em horário de Brasília de qualquer forma).

## Acesso
- Senha padrão de cada loja: **1234**
- Senha master (todas as lojas): **master2024**
- Troque a senha de cada loja na aba **Config**.

## Observação sobre os dados
A v2 usa um modelo de dados novo. Os funcionários precisam ser cadastrados de novo (o cadastro agora é rápido, em uma tela só). O banco fica no disco persistente, então a partir daí nada se perde.

## Rodar localmente (opcional)
```
npm install
node server.js
# abre em http://localhost:3000  (usa a pasta ./data local)
```
