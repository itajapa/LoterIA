# LoterIA - Analisador de Loterias com IA

LoterIA é um projeto educacional desenvolvido em Python com o objetivo de praticar análise de dados, lógica de programação e simulações estatísticas aplicadas a jogos de loteria.
O projeto foi criado como parte dos meus estudos em tecnologia da informação e ciência de dados.

## ✨ Funcionalidades

- **Análise com IA:** Utiliza a inteligência artificial do Google Gemini para processar dezenas de concursos anteriores.
- **Geração de Jogos:** Cria sugestões de jogos otimizadas com base na análise de frequência, probabilidades e outros padrões.
- **Histórico de Jogos:** Permite salvar os jogos gerados para conferência futura.
- **Conferência Automática e Manual:** Simule resultados ou aguarde o app conferir automaticamente seus jogos salvos com os resultados oficiais.
- **Suporte a Múltiplas Loterias:** Facilmente escalável para incluir diferentes tipos de jogos.

## 🚀 Tecnologias Utilizadas

- **Frontend:** React com TypeScript
- **Inteligência Artificial:** Google Gemini API (`gemini-2.5-flash`)
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
