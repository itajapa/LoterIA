# LoterIA - Analisador de Loterias com IA

LoterIA é um projeto educacional desenvolvido em Python com o objetivo de praticar análise de dados, lógica de programação e simulações estatísticas aplicadas a jogos de loteria.
O projeto foi criado como parte dos meus estudos em tecnologia da informação e ciência de dados.

## ✨ Funcionalidades

- **Análise assistida por IA: uso da API Google Gemini para apoiar a interpretação de dados históricos de concursos, com foco educacional.
- **Geração de jogos baseada em regras: criação de sugestões de jogos a partir de frequência de números, probabilidades simples e regras definidas em código.
- **Histórico de jogos: armazenamento local dos jogos gerados para conferência futura.
- **Conferência automática e manual: simulação de resultados ou conferência dos jogos com dados oficiais.
- **Projeto extensível: estrutura preparada para inclusão de outros tipos de loterias.
## 🚀 Tecnologias Utilizadas

- **Frontend:** React com TypeScript
- **Inteligência Artificial:** Google Gemini API (`gemini-2.5-flash`)
- **Linguagem: Python (processamento e regras de negócio)
- **Hospedagem:** Netlify

## ⚙️ Como Executar o Projeto Localmente

**Pré-requisitos:**
- [Node.js](https://nodejs.org/) (versão LTS recomendada)

**Passos:**

1.  **Clone o repositório (ou use os arquivos que você já tem):**
    ```bash
    git clone https://github.com/itajapa/LoterIA.git
    cd LoterIA
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Inicie o servidor de desenvolvimento:**
    O aplicativo abrirá em `http://localhost:5173` (ou outra porta disponível).
    ```bash
    npm run dev
    ```

4.  **Para publicar:**
    Gere a pasta de produção `dist` e faça o deploy em um serviço como Netlify.
    ```bash
    npm run build
    ```
