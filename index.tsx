import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- Utility Functions ---
const API_BASE_URL = 'https://loteriascaixa-api.herokuapp.com/api';

const LOTTERY_CONFIG = {
  lotofacil: { name: 'Lotofácil', numbers: 15, total: 25, apiName: 'lotofacil', winningTiers: [11, 12, 13, 14, 15] },
  megasena: { name: 'Mega-Sena', numbers: 6, total: 60, apiName: 'megasena', winningTiers: [4, 5, 6] },
};

type LotteryType = keyof typeof LOTTERY_CONFIG;

interface Game {
  id: string;
  numbers: number[];
  hits?: number | null;
}

interface SavedGame {
  id: string;
  type: LotteryType;
  games: Game[];
  targetContest: number;
  createdAt: string;
  isTeimosinha: boolean;
  manualCheck?: number[] | null;
  officialResult?: number[] | null;
}

interface TeimosinhaSavedGame extends SavedGame {
  isTeimosinha: true;
  teimosinhaContests: number;
  results: Record<number, { hits: number | null, drawnNumbers?: number[] }>;
}

const fetchLotteryApi = async (path: string) => {
    const response = await fetch(`${API_BASE_URL}/${path}`);
    if (!response.ok) {
        let errorMessage = `A API respondeu com o status ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage += `: ${errorData.message || 'Detalhes do erro não disponíveis.'}`;
        } catch (e) {
            errorMessage += '. Falha ao ler detalhes do erro.';
        }
        throw new Error(errorMessage);
    }
    return await response.json();
};


// --- Main App Component ---
const App = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedGame, setSelectedGame] = useState<LotteryType | null>(null);
  const [contestsToAnalyze, setContestsToAnalyze] = useState(10);
  const [pastResults, setPastResults] = useState<any[]>([]);
  const [targetContest, setTargetContest] = useState<number | null>(null);
  const [loadingGame, setLoadingGame] = useState<LotteryType | null>(null);
  const [error, setError] = useState('');
  const [savedGames, setSavedGames] = useState<(SavedGame | TeimosinhaSavedGame)[]>(() => {
    try {
      const item = window.localStorage.getItem('loterIA_savedGames');
      return item ? JSON.parse(item) : [];
    } catch (error) {
      return [];
    }
  });
  const [viewingGameId, setViewingGameId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(() => window.localStorage.getItem('loterIA_apiKey'));
  const [showApiModal, setShowApiModal] = useState(false);
  
  useEffect(() => {
    try {
      window.localStorage.setItem('loterIA_savedGames', JSON.stringify(savedGames));
    } catch (error) {
      console.error('Failed to save games to localStorage:', error);
    }
  }, [savedGames]);

  useEffect(() => {
    if (apiKey) {
      window.localStorage.setItem('loterIA_apiKey', apiKey);
    } else {
      window.localStorage.removeItem('loterIA_apiKey');
    }
  }, [apiKey]);


 const handleSelectGameType = async (gameType: LotteryType, numToAnalyze: number) => {
    setLoadingGame(gameType);
    setError('');
    setSelectedGame(gameType);
    setContestsToAnalyze(numToAnalyze);

    try {
      const apiName = LOTTERY_CONFIG[gameType].apiName;
      
      const latestContestData = await fetchLotteryApi(`${apiName}/latest`);
      const latestContestNumber = latestContestData.concurso;
      setTargetContest(latestContestNumber + 1);

      // Fetch each contest individually to ensure correctness, as the bulk API endpoint is unreliable.
      const contestPromises = [];
      for (let i = 0; i < numToAnalyze; i++) {
        const contestNum = latestContestNumber - i;
        const promise = fetchLotteryApi(`${apiName}/${contestNum}`).catch(err => {
            console.warn(`Could not fetch contest ${contestNum}:`, err);
            return null; // Return null on failure so Promise.all doesn't reject
        });
        contestPromises.push(promise);
      }
      
      const results = await Promise.all(contestPromises);
      
      // Filter out any nulls from failed requests and contests that don't exist yet
      const validResults = results.filter(r => r != null && r.concurso);

      const formattedResults = validResults.map(r => ({
          numero: r.concurso,
          listaDezenas: r.dezenas.map((d: string) => parseInt(d, 10))
      })).sort((a, b) => b.numero - a.numero);

      setPastResults(formattedResults.filter(r => r && r.listaDezenas && r.listaDezenas.length > 0));
      setCurrentPage('confirm');

    } catch (err) {
      setError(err instanceof Error ? `Falha ao buscar dados: ${err.message}` : `Falha ao buscar dados da loteria. Verifique sua conexão.`);
      setCurrentPage('home');
    } finally {
      setLoadingGame(null);
    }
  };
  
  const resetToHome = () => {
    setCurrentPage('home');
    setSelectedGame(null);
    setPastResults([]);
    setError('');
    setLoadingGame(null);
  };
  
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage 
                  onGameSelect={handleSelectGameType} 
                  loadingGame={loadingGame} 
                  error={error}
                  contestsToAnalyze={contestsToAnalyze}
                  setContestsToAnalyze={setContestsToAnalyze}
                />;
      case 'confirm':
        return <ConfirmationPage
                  pastResults={pastResults}
                  gameType={selectedGame!}
                  onConfirm={() => setCurrentPage('generate')}
                />;
      case 'generate':
          return <GeneratePage 
                    pastResults={pastResults}
                    selectedGame={selectedGame!}
                    targetContest={targetContest!}
                    apiKey={apiKey}
                    onSaveGames={(games, isTeimosinha, teimosinhaContests) => {
                        if (!selectedGame || !targetContest) return;
                        const newSavedGame: SavedGame | TeimosinhaSavedGame = {
                            id: `saved-${Date.now()}`,
                            type: selectedGame,
                            games: games,
                            targetContest: targetContest,
                            createdAt: new Date().toISOString(),
                            isTeimosinha,
                            ...(isTeimosinha && teimosinhaContests && { 
                                teimosinhaContests,
                                results: {}
                            })
                        };
                        setSavedGames(prev => [...prev, newSavedGame]);
                    }}
                 />;
      case 'history':
        return <HistoryPage savedGames={savedGames} onView={(id) => { setViewingGameId(id); setCurrentPage('details'); }} onDelete={(id) => {
             if (window.confirm("Tem certeza que deseja excluir este jogo salvo? Esta ação não pode ser desfeita.")) {
                setSavedGames(prev => prev.filter(game => game.id !== id));
            }
        }} />;
      case 'details':
        const gameToView = savedGames.find(g => g.id === viewingGameId);
        return gameToView ? <DetailPage game={gameToView} setSavedGames={setSavedGames} /> : <p>Jogo não encontrado.</p>;
      default:
        return <HomePage 
                  onGameSelect={handleSelectGameType} 
                  loadingGame={loadingGame} 
                  error={error}
                  contestsToAnalyze={contestsToAnalyze}
                  setContestsToAnalyze={setContestsToAnalyze}
                />;
    }
  };

  return (
    <div className="container">
        <AppHeader 
          currentPage={currentPage} 
          resetToHome={resetToHome} 
          onHistory={() => setCurrentPage('history')}
          onApiClick={() => setShowApiModal(true)}
        />
        {renderPage()}
        {showApiModal && (
            <ApiModal
                currentApiKey={apiKey}
                onClose={() => setShowApiModal(false)}
                onSave={(key) => {
                    setApiKey(key);
                    setShowApiModal(false);
                }}
            />
        )}
    </div>
  );
};


// --- Sub-components (Pages) ---

const AppHeader = ({ currentPage, resetToHome, onHistory, onApiClick }: { currentPage: string, resetToHome: () => void, onHistory: () => void, onApiClick: () => void }) => {
    const isHomePage = currentPage === 'home';
    const headerClass = isHomePage ? "app-header" : "app-header persistent-header";
    
    return (
        <header className={headerClass}>
            <div>
                <h1>Loter<b>IA</b></h1>
                {isHomePage && (
                    <>
                        <p>Analisador de Loterias com IA</p>
                        <i>AppWeb criado por Paulo Assis</i>
                    </>
                )}
            </div>
            <div className="header-actions">
                 {!isHomePage && <button className="btn-tertiary" onClick={resetToHome}>Início</button>}
                 <button className="btn-tertiary" onClick={onHistory}>Histórico</button>
                 <button className="btn-tertiary" onClick={onApiClick}>API</button>
            </div>
        </header>
    );
};

const HomePage = ({ onGameSelect, loadingGame, error, contestsToAnalyze, setContestsToAnalyze }: { 
    onGameSelect: (game: LotteryType, num: number) => void, 
    loadingGame: LotteryType | null, 
    error: string,
    contestsToAnalyze: number,
    setContestsToAnalyze: (num: number) => void,
}) => {
    const contestOptions = [3, 5, 10, 15, 50, 100, 200];
    return (
        <main>
            {error && <p className="error-message">{error}</p>}
            <div className="input-group" style={{ justifyContent: 'center', margin: '1rem 0 2rem' }}>
              <label htmlFor="contestsToAnalyze">Analisar os últimos:</label>
              <select
                id="contestsToAnalyze"
                value={contestsToAnalyze}
                onChange={(e) => setContestsToAnalyze(Number(e.target.value))}
                disabled={!!loadingGame}
              >
                {contestOptions.map(opt => <option key={opt} value={opt}>{opt} concursos</option>)}
              </select>
            </div>

            <div className="game-selection">
            <div className="game-option">
                <button
                style={{ '--game-color': 'var(--secondary-color-lotofacil)' } as React.CSSProperties}
                className="game-btn"
                onClick={() => onGameSelect('lotofacil', contestsToAnalyze)}
                disabled={!!loadingGame}
                >
                {loadingGame === 'lotofacil' ? <span className="loader"></span> : 'Lotofácil'}
                </button>
                <p className="draw-days">Sorteios todas às Seg, Ter, Qua, Qui, Sex e Sáb.</p>
            </div>
            <div className="game-option">
                <button
                style={{ '--game-color': 'var(--secondary-color-megasena)' } as React.CSSProperties}
                className="game-btn"
                onClick={() => onGameSelect('megasena', contestsToAnalyze)}
                disabled={!!loadingGame}
                >
                {loadingGame === 'megasena' ? <span className="loader"></span> : 'Mega-Sena'}
                </button>
                <p className="draw-days">Sorteios todas às Ter, Qui e Sáb.</p>
            </div>
            </div>
        </main>
    );
};

const ConfirmationPage = ({ pastResults, gameType, onConfirm }: {
  pastResults: any[],
  gameType: LotteryType,
  onConfirm: () => void,
}) => {
  return (
    <main>
      <h2>Confirmar Dados para Análise</h2>
      <p>A IA irá analisar os resultados dos <b>{pastResults.length}</b> concursos anteriores da <b>{LOTTERY_CONFIG[gameType].name}</b> abaixo.</p>
      
       <div className="action-buttons confirmation-actions">
        <button className="btn-primary" onClick={onConfirm}>CONFIRMAR JOGOS E ANALISAR IA</button>
      </div>

      <div className="results-list-wrapper">
        <ul className="results-list">
          {pastResults.map(r => (
            <li key={r.numero}>
              <b>Nº {r.numero}:</b> {r.listaDezenas.join(', ')}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

const GeneratePage = ({ pastResults, selectedGame, targetContest, onSaveGames, apiKey }: {
  pastResults: any[],
  selectedGame: LotteryType,
  targetContest: number,
  onSaveGames: (games: Game[], isTeimosinha: boolean, teimosinhaContests?: number) => void,
  apiKey: string | null;
}) => {
  const gameOptions = [1, 10, 20, 50, 100, 200];
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [generatedGames, setGeneratedGames] = useState<Game[]>([]);
  const [showTeimosinhaModal, setShowTeimosinhaModal] = useState(false);
  const [savedAsGame, setSavedAsGame] = useState(false);
  const [savedAsTeimosinha, setSavedAsTeimosinha] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleAnalysisAndGeneration = async (numberOfGames: number) => {
    setIsGenerating(true);
    setError('');
    setGeneratedGames([]);
    setSavedAsGame(false);
    setSavedAsTeimosinha(false);

    if (!apiKey) {
        setError("Por favor, configure sua chave de API do Google no botão 'API' do cabeçalho para gerar jogos.");
        setIsGenerating(false);
        return;
    }

    const loadingMessages = [
      "Consultando a IA do Google...", "Analisando padrões nos concursos solicitados...", "Verificando dezenas quentes e frias...", "Calculando equilíbrio de pares e ímpares...", "Analisando a soma das dezenas...", "Identificando números repetidos do concurso anterior...", "Analisando distribuição entre moldura e miolo...", "Considerando a presença de números primos e Fibonacci...", "Gerando jogos otimizados com base na sua análise...",
    ];
    let messageIndex = 0;
    const interval = setInterval(() => {
      setLoadingMessage(loadingMessages[messageIndex % loadingMessages.length]);
      messageIndex++;
    }, 2000);

    try {
      const config = LOTTERY_CONFIG[selectedGame];
      const pastResultsText = pastResults.map(r => `Concurso ${r.numero}: ${r.listaDezenas.join(', ')}`).join('\n');
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
        Você é um especialista em Análise Combinatória, Teoria das Probabilidades e Estatística Descritiva, focado em loterias. Sua tarefa é analisar profundamente os dados dos últimos ${pastResults.length} concursos da ${config.name} que estou fornecendo e, com base NESSA ANÁLISE MULTIFATORIAL, gerar ${numberOfGames} jogo(s) com alta probabilidade estatística.

        DADOS PARA ANÁLISE:
        ${pastResultsText}

        INSTRUÇÕES DE ANÁLISE E GERAÇÃO:
        1.  Baseie-se EXCLUSIVAMENTE nos dados fornecidos para sua análise.
        2.  Aplique os seguintes estudos estatísticos de forma combinada para otimizar a escolha das dezenas:
            a. **Frequência e Atraso:** Identifique as dezenas "quentes" (mais sorteadas) e "frias" (com maior ciclo de atraso) nos dados fornecidos. Busque um equilíbrio entre elas.
            b. **Pares e Ímpares:** Analise a proporção de números pares e ímpares nos resultados passados e gere jogos que sigam a tendência mais comum (ex: 8 ímpares e 7 pares na Lotofácil).
            c. **Soma das Dezenas:** Calcule a soma das dezenas de cada concurso passado para encontrar a faixa de soma mais frequente. Gere jogos cuja soma total esteja dentro dessa faixa de alta probabilidade.
            d. **Repetição do Concurso Anterior:** Verifique a média de dezenas que se repetem do concurso anterior e aplique essa média na sua geração.
            e. **Moldura e Miolo:** Analise a distribuição de dezenas entre a "moldura" (números nas bordas do volante) e o "miolo" (números centrais), buscando replicar a proporção mais sorteada.
            f. **Números Especiais:** Considere a frequência de números Primos e da sequência de Fibonacci nos resultados para ponderar sua inclusão nos jogos.

        3.  Cada jogo gerado para a ${config.name} deve conter exatamente ${config.numbers} números únicos, entre 1 e ${config.total}.
        4.  Retorne APENAS uma lista de jogos em formato JSON, como no exemplo: {"games": [[1,2,3...], [4,5,6...]]}. Não inclua texto, explicações, markdown ou qualquer coisa fora do JSON puro.
      `;
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash', contents: prompt, config: {
          responseMimeType: "application/json", responseSchema: {
            type: Type.OBJECT, properties: {
              games: {
                type: Type.ARRAY, items: {
                  type: Type.ARRAY, items: { type: Type.INTEGER, },
                },
              },
            },
          },
        },
      });
      
      const responseText = result.text;
      if (typeof responseText !== 'string' || responseText.trim() === '') {
        console.error("Invalid or empty response from AI:", result);
        throw new Error("A resposta da IA veio vazia ou em formato inválido. Isso pode ocorrer devido a filtros de segurança ou instabilidade na API. Por favor, tente gerar os jogos novamente.");
      }
      
      const jsonResponse = JSON.parse(responseText.trim());
      if (!jsonResponse.games || !Array.isArray(jsonResponse.games)) {
        throw new Error("A resposta da IA não veio no formato esperado (JSON com uma chave 'games').");
      }
      const games: Game[] = jsonResponse.games.map((numbers: number[], index: number) => ({
        id: `game-${Date.now()}-${index}`,
        numbers: numbers.sort((a, b) => a - b),
      }));
      setGeneratedGames(games);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? `Erro ao gerar jogos: ${err.message}` : 'Ocorreu um erro desconhecido.');
    } finally {
      setIsGenerating(false);
      clearInterval(interval);
      setLoadingMessage('');
    }
  };
  
  const handleSaveGame = () => {
    onSaveGames(generatedGames, false);
    setSavedAsGame(true);
    setSuccessMessage('Jogo salvo no histórico com sucesso!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };
  
  const handleSaveTeimosinha = (contests: number) => {
    onSaveGames(generatedGames, true, contests);
    setSavedAsTeimosinha(true);
    setShowTeimosinhaModal(false);
    setSuccessMessage('Teimosinha salva no histórico com sucesso!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  return (
    <main>
      <h2>Gerar Jogos</h2>
      <p>Com base na análise, quantos jogos você quer que a IA gere para o concurso nº {targetContest}?</p>
      {error && <p className="error-message">{error}</p>}
      <div className="generation-buttons">
        {gameOptions.map(opt => (
          <button key={opt} className="btn-primary" onClick={() => handleAnalysisAndGeneration(opt)} disabled={isGenerating}>
            Gerar {opt} {opt === 1 ? 'jogo' : 'jogos'}
          </button>
        ))}
      </div>
      
      {isGenerating && (
        <div className="loading-container" style={{padding: '2rem 0'}}>
          <span className="loader loader-dark"></span>
          <p className="loading-feedback">{loadingMessage || "Aguarde..."}</p>
        </div>
      )}

      {generatedGames.length > 0 && !isGenerating && (
        <div className="results-container">
            <h3 style={{marginTop: '3rem'}}>Jogos Gerados</h3>
             {successMessage && <div className="success-message">{successMessage}</div>}
            <div className="results-header-with-actions">
                <div className="results-header-titles">
                    <span>Jogo Nº</span>
                    <span>Números</span>
                </div>
                <div className="generation-actions">
                    <button className="btn-secondary" onClick={handleSaveGame} disabled={savedAsGame}>
                        Salvar Jogo
                    </button>
                    <button className="btn-primary" onClick={() => setShowTeimosinhaModal(true)} disabled={generatedGames.length !== 1 || savedAsTeimosinha}>
                        Salvar como Teimosinha
                    </button>
                </div>
            </div>
            <div className="results-table-wrapper">
                <table className="results-table">
                    <tbody>
                        {generatedGames.map((game: Game, index: number) => (
                            <tr key={game.id}>
                                <td>{index + 1}</td>
                                <td>{game.numbers.join(', ')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}
      
       {showTeimosinhaModal && generatedGames.length === 1 && (
          <TeimosinhaModal 
              onClose={() => setShowTeimosinhaModal(false)} 
              onSave={handleSaveTeimosinha} 
          />
      )}
    </main>
  );
};

const HistoryPage = ({ savedGames, onView, onDelete }: { savedGames: (SavedGame | TeimosinhaSavedGame)[], onView: (id: string) => void, onDelete: (id: string) => void }) => {
    const sortedGames = [...savedGames].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const isWinner = (game: SavedGame | TeimosinhaSavedGame): boolean => {
        const winningTiers = LOTTERY_CONFIG[game.type].winningTiers;
        if (game.isTeimosinha) {
            const teimosinha = game as TeimosinhaSavedGame;
            return Object.values(teimosinha.results).some(r => r.hits !== null && winningTiers.includes(r.hits));
        } else {
            const resultToUse = game.officialResult || game.manualCheck;
            if (!resultToUse) return false;
            
            // For single games, we need to check if ANY of the generated games is a winner.
            return game.games.some(g => {
                const hits = g.numbers.filter(n => resultToUse.includes(n)).length;
                return winningTiers.includes(hits);
            });
        }
    };
    
    return (
      <main>
        <h2>Histórico de Jogos Salvos</h2>
        {sortedGames.length > 0 ? (
          <ul className="history-list">
            {sortedGames.map(game => {
              let title = `${LOTTERY_CONFIG[game.type].name} - Concurso ${game.targetContest}`;
              if (game.isTeimosinha) {
                const teimosinha = game as TeimosinhaSavedGame;
                const endContest = teimosinha.targetContest + teimosinha.teimosinhaContests - 1;
                title = `${LOTTERY_CONFIG[game.type].name} - Teimosinha para ${teimosinha.teimosinhaContests} concursos - Concurso ${teimosinha.targetContest} ao ${endContest}`;
              }
              const isWinningGame = isWinner(game);

              return (
              <li key={game.id} className="history-item">
                <div className="history-item-info">
                  <strong>
                    {title}
                    {isWinningGame && <span className="winner-tag">Premiado</span>}
                  </strong>
                  <small>
                    Salvo em: {new Date(game.createdAt).toLocaleString()} | {game.games.length} jogo(s)
                  </small>
                   <div className="conference-summary">
                    {game.officialResult ? (
                      <span className="official">Conferido oficialmente</span>
                    ) : game.manualCheck ? (
                      <span className="manual">Conferência manual salva</span>
                    ) : (
                      'Aguardando resultado'
                    )}
                  </div>
                </div>
                <div className="history-item-actions">
                    <button className="btn-primary" onClick={() => onView(game.id)}>Ver Detalhes</button>
                    <button className="btn-delete" onClick={() => onDelete(game.id)}>Excluir</button>
                </div>
              </li>
            )})}
          </ul>
        ) : (
          <p>Nenhum jogo salvo ainda.</p>
        )}
      </main>
    );
};

const HitsDistributionSummary = ({ game, resultToUse }: { game: SavedGame, resultToUse: number[] }) => {
    const winningTiers = LOTTERY_CONFIG[game.type].winningTiers;
    const hitsByTier: Record<number, number> = {};

    game.games.forEach(g => {
        const hits = g.numbers.filter(n => resultToUse.includes(n)).length;
        if (winningTiers.includes(hits)) {
            hitsByTier[hits] = (hitsByTier[hits] || 0) + 1;
        }
    });

    const summaryParts = Object.entries(hitsByTier)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([tier, count]) => `${count} ${count > 1 ? 'jogos' : 'jogo'} com ${tier} pontos`);
    
    if (summaryParts.length === 0) {
        return (
             <div className="hits-distribution-summary no-prize">
                Nenhuma premiação encontrada nesta simulação.
            </div>
        )
    }

    const summaryText = `${LOTTERY_CONFIG[game.type].name}: Foram ${summaryParts.join(', ')}.`;

    return <div className="hits-distribution-summary">{summaryText}</div>;
};


const DetailPage = ({ game, setSavedGames }: { game: SavedGame | TeimosinhaSavedGame, setSavedGames: React.Dispatch<React.SetStateAction<(SavedGame | TeimosinhaSavedGame)[]>> }) => {
    const [manualCheckActive, setManualCheckActive] = useState(false);
    const { numbers: numCount, total: totalCount } = LOTTERY_CONFIG[game.type];
    const [manualNumbers, setManualNumbers] = useState<string[]>(Array(numCount).fill(''));
    const [error, setError] = useState('');
    const [isLoadingResult, setIsLoadingResult] = useState(false);
    const manualInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const resultToUse = game.officialResult || game.manualCheck || [];

    // Effect to fetch official result for single games, this will overwrite any manual checks
    useEffect(() => {
        if (!game.officialResult && !game.isTeimosinha) {
            const fetchOfficialResult = async () => {
                setIsLoadingResult(true);
                setError('');
                try {
                    const data = await fetchLotteryApi(`${LOTTERY_CONFIG[game.type].apiName}/${game.targetContest}`);
                    if (data && data.dezenas) {
                        const drawnNumbers = data.dezenas.map((d: string) => parseInt(d, 10)).sort((a: number, b: number) => a - b);
                        setSavedGames(prev => prev.map(g => g.id === game.id ? { ...g, officialResult: drawnNumbers, manualCheck: null } : g));
                    } else {
                        console.log(`Resultado oficial para o concurso ${game.targetContest} ainda não disponível.`);
                    }
                } catch (err) {
                    setError(`Não foi possível buscar o resultado oficial. O concurso pode ainda não ter ocorrido.`);
                } finally {
                    setIsLoadingResult(false);
                }
            };
            fetchOfficialResult();
        }
    }, [game.id, game.officialResult, game.targetContest, game.type, game.isTeimosinha, setSavedGames]);

     // Effect to update Teimosinha results
    useEffect(() => {
        if (game.isTeimosinha) {
            const teimosinha = game as TeimosinhaSavedGame;
            const contestsToUpdate = Array.from({ length: teimosinha.teimosinhaContests }, (_, i) => teimosinha.targetContest + i)
                .filter(contestNum => !teimosinha.results[contestNum]?.drawnNumbers);

            if (contestsToUpdate.length > 0) {
                const updateResults = async () => {
                    setIsLoadingResult(true);
                    try {
                        const contestPromises = contestsToUpdate.map(contestNum => 
                            fetchLotteryApi(`${LOTTERY_CONFIG[teimosinha.type].apiName}/${contestNum}`).catch(() => null)
                        );
                        const resultsData = await Promise.all(contestPromises);
                        const resultsArray = resultsData.filter(r => r != null);

                        const updatedResults = { ...teimosinha.results };
                        let hasUpdates = false;

                        resultsArray.forEach(result => {
                            if (result && result.concurso && result.dezenas) {
                                hasUpdates = true;
                                const drawnNumbers = result.dezenas.map((d: string) => parseInt(d, 10)).sort((a: number, b: number) => a - b);
                                const hits = teimosinha.games[0].numbers.filter(n => drawnNumbers.includes(n)).length;
                                updatedResults[result.concurso] = { drawnNumbers, hits };
                            }
                        });

                        if (hasUpdates) {
                             setSavedGames(prev => prev.map(g => g.id === teimosinha.id ? { ...g, results: updatedResults } : g));
                        }
                    } catch (err) {
                        console.error("Erro ao atualizar Teimosinha:", err);
                    } finally {
                        setIsLoadingResult(false);
                    }
                };
                updateResults();
            }
        }
    }, [game, setSavedGames]);

    useEffect(() => {
        if (game.manualCheck) {
            const formatted = game.manualCheck.map(n => String(n).padStart(2, '0'));
            setManualNumbers([...formatted, ...Array(numCount - formatted.length).fill('')]);
        } else {
            setManualNumbers(Array(numCount).fill(''));
        }
    }, [game.manualCheck, numCount]);

    const handleManualNumberChange = (index: number, value: string) => {
        if (/^\d{0,2}$/.test(value)) {
            const newNumbers = [...manualNumbers];
            newNumbers[index] = value;
            setManualNumbers(newNumbers);
            if (value.length >= 2 && index < numCount - 1) {
                manualInputRefs.current[index + 1]?.focus();
            }
        }
    };

    const handleSaveManualCheck = () => {
        setError('');
        const numbers = manualNumbers.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
        if (numbers.length !== numCount) {
            setError(`Por favor, preencha todos os ${numCount} números.`);
            return;
        }
        
        const seen = new Set();
        const duplicates = new Set<number>();
        for (const num of numbers) {
            if (seen.has(num)) {
                duplicates.add(num);
            }
            seen.add(num);
        }

        if (duplicates.size > 0) {
            const duplicateList = Array.from(duplicates).sort((a,b) => a - b).join(', ');
            setError(`Existem números repetidos: ${duplicateList}. Por favor, corrija.`);
            return;
        }

        if (numbers.some(n => n < 1 || n > totalCount)) {
            setError(`Os números devem estar entre 1 e ${totalCount}.`);
            return;
        }
        setSavedGames(prev => prev.map(g => g.id === game.id ? { ...g, manualCheck: numbers.sort((a, b) => a - b), officialResult: null } : g));
        setManualCheckActive(false);
    };

    const handleRemoveManualCheck = () => {
        setSavedGames(currentGames => {
            const newGames = currentGames.map(g => {
                if (g.id !== game.id) {
                    return g;
                }
                return {
                    ...g,
                    manualCheck: null,
                };
            });
            return newGames;
        });
        setManualCheckActive(false);
    };

    const calculateHits = (gameNumbers: number[], drawnNumbers: number[]) => {
        if (!drawnNumbers || drawnNumbers.length === 0) return null;
        return gameNumbers.filter(n => drawnNumbers.includes(n)).length;
    };
    
    if (game.isTeimosinha) {
        const teimosinha = game as TeimosinhaSavedGame;
        const gameNumbers = teimosinha.games[0].numbers;
        return (
             <main>
                <h2>Detalhes da Teimosinha</h2>
                <p><strong>{LOTTERY_CONFIG[teimosinha.type].name}</strong> - {teimosinha.teimosinhaContests} concursos</p>
                <div className="teimosinha-game">
                    Seu jogo: <span>{gameNumbers.join(', ')}</span>
                </div>
                 {isLoadingResult && <div className="loading-container"><span className="loader loader-dark"></span> <p>Buscando resultados oficiais...</p></div>}
                 <div className="results-table-wrapper">
                    <table className="results-table teimosinha-details-table">
                        <thead>
                            <tr>
                                <th>Concurso</th>
                                <th>Resultado Oficial</th>
                                <th>Acertos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: teimosinha.teimosinhaContests }, (_, i) => teimosinha.targetContest + i).map(contestNum => {
                                const result = teimosinha.results[contestNum];
                                const drawn = result?.drawnNumbers;
                                const hits = result?.hits;
                                const isWinner = drawn && hits !== null && LOTTERY_CONFIG[teimosinha.type].winningTiers.includes(hits);

                                return (
                                    <tr key={contestNum}>
                                        <td>{contestNum}</td>
                                        <td>{drawn ? drawn.join(', ') : <span className="status-pending">Aguardando...</span>}</td>
                                        <td style={{ fontWeight: isWinner ? 'bold' : 'normal', color: isWinner ? 'var(--success-color)' : 'inherit' }}>
                                            {typeof hits === 'number' ? `${hits} acertos` : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
             </main>
        );
    }
    
    return (
        <main>
            <h2>Detalhes do Jogo</h2>
            <p><strong>{LOTTERY_CONFIG[game.type].name}</strong> - Concurso: <strong>{game.targetContest}</strong></p>

            <div className="manual-check-container">
                <h4>Conferir Resultado</h4>
                {game.officialResult ? (
                    <div className="official-lock-message">Este jogo foi conferido com o resultado oficial e está travado.</div>
                ) : (
                    <>
                        <div className="action-buttons" style={{ justifyContent: 'flex-start', margin: 0 }}>
                            <button className="btn-secondary" onClick={() => setManualCheckActive(!manualCheckActive)}>
                                {manualCheckActive ? 'Cancelar Conferência Manual' : 'Conferir Manualmente'}
                            </button>
                            {game.manualCheck && (
                                <button className="btn-delete" onClick={handleRemoveManualCheck}>
                                    Remover Conferência
                                </button>
                            )}
                        </div>

                        {manualCheckActive && (
                            <div style={{ marginTop: '1rem' }}>
                                <p>Digite os números sorteados para conferir:</p>
                                <div className="manual-inputs">
                                    {manualNumbers.map((num, index) => (
                                        <input
                                            key={index}
                                            ref={el => { manualInputRefs.current[index] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={2}
                                            value={num}
                                            onChange={e => handleManualNumberChange(index, e.target.value)}
                                            placeholder="00"
                                        />
                                    ))}
                                </div>
                                {error && <p className="error-message">{error}</p>}
                                <div className="action-buttons" style={{ justifyContent: 'flex-start' }}>
                                    <button className="btn-primary" onClick={handleSaveManualCheck}>Salvar Conferência</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="hits-summary">
                <h4>Resultado do Concurso {game.targetContest}</h4>
                {isLoadingResult && !resultToUse.length && <div className="loading-container"><span className="loader loader-dark"></span> <p>Buscando resultado oficial...</p></div>}
                {!isLoadingResult && !resultToUse.length && <p>Aguardando resultado. Você pode inserir os números manualmente acima.</p>}
                {resultToUse.length > 0 && (
                    <>
                        <p><strong>Números Sorteados: {resultToUse.join(', ')}</strong></p>
                        {game.games.length > 1 && <HitsDistributionSummary game={game as SavedGame} resultToUse={resultToUse} />}
                    </>
                )}
            </div>

            <div className="results-container">
                <h3>Seus Jogos</h3>
                <div className="results-table-wrapper">
                    <table className="results-table">
                        <thead>
                            <tr>
                                <th>Jogo Nº</th>
                                <th>Números</th>
                                <th>Acertos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {game.games.map((g, index) => {
                                const hits = calculateHits(g.numbers, resultToUse);
                                const isWinner = hits !== null && LOTTERY_CONFIG[game.type].winningTiers.includes(hits);
                                return (
                                    <tr key={g.id} style={{ backgroundColor: isWinner ? 'color-mix(in srgb, var(--success-color) 15%, transparent)' : 'transparent' }}>
                                        <td>{index + 1}</td>
                                        <td>
                                            {g.numbers.map((n, i) => (
                                                <span key={i}>
                                                    <span className={resultToUse.includes(n) ? 'highlight-number' : ''}>{n}</span>
                                                    {i < g.numbers.length - 1 ? ', ' : ''}
                                                </span>
                                            ))}
                                        </td>
                                        <td style={{ fontWeight: isWinner ? 'bold' : 'normal', color: isWinner ? 'var(--success-color)' : 'inherit' }}>
                                            {hits === null ? '-' : `${hits} acertos`}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
};

const TeimosinhaModal = ({ onClose, onSave }: { onClose: () => void, onSave: (contests: number) => void }) => {
    const [contests, setContests] = useState(2);
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="modal-close-btn">&times;</button>
            <h2>Salvar como Teimosinha</h2>
            <p>Por quantos concursos consecutivos (além do atual) você deseja repetir este jogo?</p>
            <div className="input-group" style={{ justifyContent: 'center', margin: '1rem 0' }}>
                <label htmlFor="teimosinha-contests">Número de Concursos:</label>
                <input 
                    type="number" 
                    id="teimosinha-contests"
                    value={contests}
                    onChange={e => setContests(Math.max(1, Number(e.target.value)))}
                    min="1"
                    style={{width: '80px'}}
                />
            </div>
            <div className="action-buttons">
                <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn-primary" onClick={() => onSave(contests)}>Salvar Teimosinha</button>
            </div>
        </div>
      </div>
    );
};

const ApiModal = ({ currentApiKey, onClose, onSave }: { currentApiKey: string | null, onClose: () => void, onSave: (key: string) => void }) => {
    const [key, setKey] = useState(currentApiKey || '');

    const handleSave = () => {
        if (key.trim()) {
            onSave(key.trim());
        }
    };

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="modal-close-btn">&times;</button>
            <h2>Configurar Chave da API do Google</h2>
            <p>Para que a IA possa analisar e gerar os jogos, você precisa fornecer sua própria chave de API do Google Gemini. Você pode obter uma gratuitamente no <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.</p>
            <div className="input-group" style={{ flexDirection: 'column', alignItems: 'flex-start', margin: '1.5rem 0' }}>
                <label htmlFor="api-key-input" style={{ marginBottom: '0.5rem'}}>Sua Chave de API:</label>
                <input
                    type="password"
                    id="api-key-input"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    placeholder="Cole sua chave de API aqui"
                    style={{width: '100%'}}
                />
            </div>
            <div className="action-buttons">
                <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn-primary" onClick={handleSave}>Salvar Chave</button>
            </div>
        </div>
      </div>
    );
};


const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);