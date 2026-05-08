# Sistema de Ponto — Instruções de Instalação

## O que é este sistema
Sistema web de registro de ponto com foto de confirmação. Roda localmente no computador da loja, acessível por qualquer dispositivo na mesma rede Wi-Fi.

---

## Requisitos
- Windows 10 ou 11
- Node.js instalado (baixar em https://nodejs.org — versão LTS)
- Câmera (webcam) conectada ao computador
- Navegador Chrome ou Edge (recomendado)

---

## Instalação (fazer apenas uma vez)

1. Baixe e descompacte a pasta `ponto-sistema` em qualquer lugar do computador (ex: `C:\ponto-sistema`)
2. Execute o arquivo **`instalar.bat`** com duplo clique
3. Aguarde a instalação terminar (~2 minutos)
4. Um atalho **"Sistema de Ponto"** será criado na área de trabalho

---

## Uso diário

1. Clique no atalho **"Sistema de Ponto"** na área de trabalho
2. O servidor inicia e o navegador abre automaticamente
3. Selecione a loja e entre com a senha (padrão: **1234**)
4. Deixe a janela do terminal aberta enquanto estiver usando

**Para encerrar:** feche a janela preta do terminal (ou pressione Ctrl+C nela)

---

## Acesso de outros computadores na mesma rede

Outros dispositivos (tablets, notebooks) na mesma rede Wi-Fi podem acessar digitando no navegador:

```
http://IP_DO_COMPUTADOR:3000
```

Para descobrir o IP: abra o Prompt de Comando e digite `ipconfig`, procure "Endereço IPv4".

Exemplo: `http://192.168.1.10:3000`

---

## Senhas

- **Senha padrão de todas as lojas:** `1234`
- **Senha master (acesso a qualquer loja):** `master2024`
- Para alterar a senha de uma loja: entre na loja → aba Config → "Alterar senha"

---

## Onde ficam os dados

- **Banco de dados:** `data/ponto.db` (registros, funcionários, configurações)
- **Fotos:** pasta `fotos/` (arquivos .jpg comprimidos)

**Faça backup regularmente** copiando a pasta inteira para um HD externo ou pen drive.

---

## Descarte automático de fotos

O sistema remove fotos automaticamente após o número de dias configurado (padrão: 30 dias). Você pode ajustar em **Config → Manter fotos (dias)**.

Para descartar manualmente: aba **Fotos → Descartar antigas**.

---

## Problemas comuns

**"Câmera não disponível"**
- Verifique se a webcam está conectada
- Feche outros programas que estejam usando a câmera
- Permita o acesso à câmera quando o navegador perguntar

**Porta 3000 em uso**
- Abra o arquivo `server.js` e altere `const PORT = 3000` para outro número (ex: 3001)
- Atualize os scripts .bat com o novo número

**Sistema lento na primeira abertura**
- Normal — o Node.js precisa inicializar o banco de dados. Aguarde 10-15 segundos.

---

## Estrutura de arquivos

```
ponto-sistema/
├── server.js          ← Servidor principal
├── package.json       ← Dependências
├── instalar.bat       ← Instalação (executar uma vez)
├── iniciar.bat        ← Iniciar o sistema
├── data/
│   └── ponto.db       ← Banco de dados SQLite
├── fotos/             ← Fotos de confirmação
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

---

## Suporte técnico

Sistema desenvolvido sob medida. Para dúvidas ou ajustes, entre em contato com o desenvolvedor.
