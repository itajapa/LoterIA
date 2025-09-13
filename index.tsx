import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Utility Functions ---
const LOTTERY_CONFIG = {
  lotofacil: { name: 'Lotofácil', numbers: 15, total: 25 },
  megasena: { name: 'Mega-Sena', numbers: 6, total: 60 },
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
  analysisContests: number;
  createdAt: string;
  isTeimosinha: boolean;
  manualCheck?: number[] | null;
  officialResult?: number[] | null;
}

interface TeimosinhaSavedGame extends SavedGame {
  isTeimosinha: true;
  teimosinhaContests: number;
  results: Record<number, { hits: number | null }>;
}

// --- Main App Component ---
const App = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedGame, setSelectedGame] = useState<LotteryType | null>(null);
  const [analysisContests, setAnalysisContests] = useState(20);
  const [numberOfGames, setNumberOfGames] = useState(1);
  const [generatedGames, setGeneratedGames] = useState<Game[]>([]);
  const [targetContest, setTargetContest] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [savedGames, setSavedGames] = useState<SavedGame[]>(() => {
    try {
      const item = window.localStorage.getItem('loterIA_savedGames');
      return item ? JSON.parse(item) : [];
    } catch (error) {
      return [];
    }
  });
  const [viewingGameId, setViewingGameId] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem('loterIA_savedGames', JSON.stringify(savedGames));
    } catch (error) {
      console.error('Failed to save games to localStorage:', error);
    }
  }, [savedGames]);


  const handleGameSelect = async (gameType: LotteryType) => {
    setIsLoading(true);
    setLoadingMessage(`Buscando últimos concursos da ${LOTTERY_CONFIG[gameType].name}...`);
    setSelectedGame(gameType);
    try {
      // Placeholder for API call to get last contests
      await new Promise(resolve => setTimeout(resolve, 1000));
      const mockTargetContest = Math.floor(Math.random() * 1000) + 2000;
      setTargetContest(mockTargetContest);
      setCurrentPage('confirmAnalysis');
    } catch (err) {
      setError(`Falha ao buscar dados para ${LOTTERY_CONFIG[gameType].name}.`);
      setCurrentPage('home');
    } finally {
      setIsLoading(false);
    }
  };
  
  const resetToHome = () => {
    setCurrentPage('home');
    setSelectedGame(null);
    setGeneratedGames([]);
    setError('');
  };

  const handleConfirmAnalysis = () => {
    setCurrentPage('generate');
  };

  const handleGenerateGames = async () => {
    if (!selectedGame) return;
    setIsLoading(true);
    setError('');
    const loadingMessages = [
      "Analisando padrões de frequência...",
      "Verificando dezenas quentes e frias...",
      "Calculando equilíbrio de pares e ímpares...",
      "Analisando a soma das dezenas...",
      "Verificando repetições do último concurso...",
      "Analisando distribuição entre moldura e miolo...",
      "Verificando a presença de números primos...",
      "Gerando jogos otimizados...",
    ];
    let messageIndex = 0;
    const interval = setInterval(() => {
      setLoadingMessage(loadingMessages[messageIndex % loadingMessages.length]);
      messageIndex++;
    }, 2000);

    try {
        // Fix: Adhering to API key management guidelines by using environment variables.
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const config = LOTTERY_CONFIG[selectedGame];
        const prompt = `
          Analise os últimos ${analysisContests} resultados da ${config.name} e gere ${numberOfGames} jogo(s) otimizado(s) de ${config.numbers} números cada (de 1 a ${config.total}).
          Sua análise deve ser sofisticada, focando em:
          1.  Frequência de dezenas (quentes e frias).
          2.  Pares e trios que mais saem juntos.
          3.  Equilíbrio entre dezenas pares e ímpares.
          4.  Soma total das dezenas.
          5.  Repetição de dezenas do concurso anterior.
          6.  Distribuição entre a moldura e o miolo do volante.
          7.  Presença de números primos.
          Retorne APENAS uma lista de jogos em formato JSON, como no exemplo: {"games": [[1,2,3...], [4,5,6...]]}. Não inclua texto ou explicações adicionais na sua resposta.
        `;

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        const jsonResponse = JSON.parse(result.text);

        if (!jsonResponse.games || !Array.isArray(jsonResponse.games)) {
            throw new Error("Resposta da IA em formato inesperado.");
        }
        
        const games: Game[] = jsonResponse.games.map((numbers: number[], index: number) => ({
            id: `game-${Date.now()}-${index}`,
            numbers: numbers.sort((a, b) => a - b),
        }));
        
        setGeneratedGames(games);
        setCurrentPage('results');
    } catch (err) {
        console.error(err);
        setError(err instanceof Error ? `Erro ao gerar jogos: ${err.message}` : 'Ocorreu um erro desconhecido.');
        // Don't go back to home, stay on the generation page to allow retry
    } finally {
        setIsLoading(false);
        clearInterval(interval);
        setLoadingMessage('');
    }
  };

  const handleSaveGames = (isTeimosinha: boolean, teimosinhaContests?: number) => {
    if (!selectedGame || !targetContest || generatedGames.length === 0) return;

    const newSavedGame: SavedGame | TeimosinhaSavedGame = {
        id: `saved-${Date.now()}`,
        type: selectedGame,
        games: generatedGames,
        targetContest: targetContest,
        analysisContests: analysisContests,
        createdAt: new Date().toISOString(),
        isTeimosinha,
        ...(isTeimosinha && teimosinhaContests && { 
            teimosinhaContests,
            results: { [targetContest]: { hits: null } }
        })
    };

    setSavedGames(prev => [...prev, newSavedGame]);
  };

  const handleViewGame = (gameId: string) => {
    setViewingGameId(gameId);
    setCurrentPage('details');
  };
  
  const handleDeleteGame = (gameId: string) => {
    if (window.confirm("Tem certeza que deseja excluir este jogo salvo? Esta ação não pode ser desfeita.")) {
        setSavedGames(prev => prev.filter(game => game.id !== gameId));
    }
  };
  
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onGameSelect={handleGameSelect} isLoading={isLoading} />;
      case 'confirmAnalysis':
        return <ConfirmAnalysisPage
                  gameType={selectedGame!}
                  targetContest={targetContest!}
                  analysisContests={analysisContests}
                  setAnalysisContests={setAnalysisContests}
                  onConfirm={handleConfirmAnalysis}
                  onBack={resetToHome}
                />;
      case 'generate':
        return <GeneratePage
                  gameType={selectedGame!}
                  numberOfGames={numberOfGames}
                  setNumberOfGames={setNumberOfGames}
                  onGenerate={handleGenerateGames}
                  onBack={() => setCurrentPage('confirmAnalysis')}
                  isLoading={isLoading}
                  loadingMessage={loadingMessage}
                  error={error}
                />;
      case 'results':
        return <ResultsPage
                  games={generatedGames}
                  onSave={handleSaveGames}
                  onBack={() => setCurrentPage('generate')}
                  gameType={selectedGame!}
               />;
      case 'history':
        return <HistoryPage savedGames={savedGames} onView={handleViewGame} onDelete={handleDeleteGame} />;
      case 'details':
        const gameToView = savedGames.find(g => g.id === viewingGameId);
        return gameToView ? <DetailPage game={gameToView} setSavedGames={setSavedGames} /> : <p>Jogo não encontrado.</p>;
      default:
        return <HomePage onGameSelect={handleGameSelect} isLoading={isLoading} />;
    }
  };

  return (
    <div className="container">
        <AppHeader 
          currentPage={currentPage} 
          resetToHome={resetToHome} 
          onHistory={() => setCurrentPage('history')}
        />
        {renderPage()}
    </div>
  );
};


// --- Sub-components (Pages) ---

const AppHeader = ({ currentPage, resetToHome, onHistory }: { currentPage: string, resetToHome: () => void, onHistory: () => void }) => {
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
            </div>
        </header>
    );
};

const HomePage = ({ onGameSelect, isLoading }: { onGameSelect: (game: LotteryType) => void, isLoading: boolean }) => (
  <main>
    <h2>Selecione o Jogo</h2>
    <div className="game-selection">
      <div className="game-option">
        <button
          style={{ '--game-color': 'var(--secondary-color-lotofacil)' } as React.CSSProperties}
          className="game-btn"
          onClick={() => onGameSelect('lotofacil')}
          disabled={isLoading}
        >
          Lotofácil
        </button>
        <p className="draw-days">Sorteios todas às Seg, Ter, Qua, Qui, Sex e Sáb.</p>
      </div>
      <div className="game-option">
        <button
          style={{ '--game-color': 'var(--secondary-color-megasena)' } as React.CSSProperties}
          className="game-btn"
          onClick={() => onGameSelect('megasena')}
          disabled={isLoading}
        >
          Mega-Sena
        </button>
        <p className="draw-days">Sorteios todas às Ter, Qui e Sáb.</p>
      </div>
    </div>
  </main>
);

const ConfirmAnalysisPage = ({ gameType, targetContest, analysisContests, setAnalysisContests, onConfirm, onBack }: any) => {
  const contestOptions = [3, 5, 10, 15, 20, 30, 50, 100, 200];
  const lastContests = Array.from({ length: analysisContests }, (_, i) => targetContest - 1 - i);

  return (
    <main>
      <h2>Confirmar Análise</h2>
      <p>A IA irá analisar os últimos <b>{analysisContests}</b> concursos da <b>{LOTTERY_CONFIG[gameType].name}</b> para gerar jogos para o concurso <b>nº {targetContest}</b>.</p>
      
      <div className="input-group">
        <label htmlFor="analysisContests">Analisar os últimos</label>
        <select
          id="analysisContests"
          value={analysisContests}
          onChange={(e) => setAnalysisContests(Number(e.target.value))}
        >
          {contestOptions.map(opt => <option key={opt} value={opt}>{opt} concursos</option>)}
        </select>
      </div>
      
      <div className="action-buttons confirmation-actions">
          <button className="btn-secondary" onClick={onBack}>Voltar</button>
          <button className="btn-primary" onClick={onConfirm}>Confirmar e Analisar com IA</button>
      </div>

      <h3>Concursos que serão analisados:</h3>
      <ul>
        {lastContests.map(c => <li key={c}>Concurso nº {c}</li>)}
      </ul>
    </main>
  );
};

const GeneratePage = ({ gameType, numberOfGames, setNumberOfGames, onGenerate, onBack, isLoading, loadingMessage, error }: any) => {
  const gameOptions = [1, 2, 3, 5, 10, 20, 50, 100];

  return (
    <main>
      <h2>Gerar Jogos</h2>
      <p>Selecione quantos jogos da <b>{LOTTERY_CONFIG[gameType].name}</b> você deseja que a IA gere.</p>
      <div className="input-group">
        <label htmlFor="numberOfGames">Número de jogos:</label>
        <select
          id="numberOfGames"
          value={numberOfGames}
          onChange={(e) => setNumberOfGames(Number(e.target.value))}
        >
          {gameOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
      {error && <p className="error-message">{error}</p>}
      <div className="action-buttons">
        <button className="btn-secondary" onClick={onBack} disabled={isLoading}>Voltar</button>
        <button className="btn-primary" onClick={onGenerate} disabled={isLoading}>
          {isLoading ? <span className="loader"></span> : 'Gerar Jogos'}
        </button>
      </div>
      <div className="loading-feedback" aria-live="polite">
          {isLoading && loadingMessage}
      </div>
    </main>
  );
};

const ResultsPage = ({ games, onSave, onBack, gameType }: any) => {
    const [showTeimosinhaModal, setShowTeimosinhaModal] = useState(false);
    const [savedAsGame, setSavedAsGame] = useState(false);
    const [savedAsTeimosinha, setSavedAsTeimosinha] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleSaveGame = () => {
        onSave(false);
        setSavedAsGame(true);
        setSuccessMessage('Jogo salvo no histórico com sucesso!');
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const handleOpenTeimosinha = () => {
        setShowTeimosinhaModal(true);
    };

    const handleSaveTeimosinha = (contests: number) => {
        onSave(true, contests);
        setSavedAsTeimosinha(true);
        setShowTeimosinhaModal(false);
        setSuccessMessage('Teimosinha salva no histórico com sucesso!');
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const isSingleGame = games.length === 1;

    return (
        <main>
            <h2>Jogos Gerados</h2>
            <p>A IA gerou os seguintes jogos da <b>{LOTTERY_CONFIG[gameType].name}</b> para você:</p>
            
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
                    <button className="btn-primary" onClick={handleOpenTeimosinha} disabled={!isSingleGame || savedAsTeimosinha}>
                        Salvar como Teimosinha
                    </button>
                </div>
            </div>

            <div className="results-table-wrapper">
                <table className="results-table">
                    <tbody>
                        {games.map((game: Game, index: number) => (
                            <tr key={game.id}>
                                <td>{index + 1}</td>
                                <td>{game.numbers.join(', ')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="action-buttons">
                <button className="btn-secondary" onClick={onBack}>Voltar e Gerar Novos</button>
            </div>
            
            {showTeimosinhaModal && isSingleGame && (
                <TeimosinhaModal 
                    onClose={() => setShowTeimosinhaModal(false)} 
                    onSave={handleSaveTeimosinha} 
                />
            )}
        </main>
    );
};

const HistoryPage = ({ savedGames, onView, onDelete }: { savedGames: SavedGame[], onView: (id: string) => void, onDelete: (id: string) => void }) => {
    const sortedGames = [...savedGames].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return (
      <main>
        <h2>Histórico de Jogos Salvos</h2>
        {sortedGames.length > 0 ? (
          <ul className="history-list">
            {sortedGames.map(game => (
              <li key={game.id} className="history-item">
                <div className="history-item-info">
                  <strong>{LOTTERY_CONFIG[game.type].name} - Concurso {game.targetContest}</strong>
                  <small>
                    Salvo em: {new Date(game.createdAt).toLocaleString()} | {game.games.length} jogo(s)
                    {game.isTeimosinha ? ` | Teimosinha p/ ${(game as TeimosinhaSavedGame).teimosinhaContests} concursos` : ''}
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
            ))}
          </ul>
        ) : (
          <p>Nenhum jogo salvo ainda.</p>
        )}
      </main>
    );
};

const DetailPage = ({ game, setSavedGames }: { game: SavedGame, setSavedGames: React.Dispatch<React.SetStateAction<SavedGame[]>> }) => {
    const [manualCheckActive, setManualCheckActive] = useState(false);
    const { numbers: numCount, total: totalCount } = LOTTERY_CONFIG[game.type];
    const [manualNumbers, setManualNumbers] = useState<number[]>(() => Array(numCount).fill(0));
    const [manualCheckError, setManualCheckError] = useState('');
    const manualInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const updateGameInState = (updatedGame: SavedGame) => {
        setSavedGames(prev => prev.map(g => g.id === updatedGame.id ? updatedGame : g));
    };

    const handleManualCheck = () => {
        setManualCheckError('');
        const uniqueNumbers = new Set(manualNumbers.filter(n => n > 0 && n <= totalCount));
        
        if (manualNumbers.some(n => n === 0)) {
            setManualCheckError('Por favor, preencha todos os campos.');
            return;
        }
        if (uniqueNumbers.size < manualNumbers.length) {
            const duplicates = manualNumbers.filter((item, index) => manualNumbers.indexOf(item) !== index);
            setManualCheckError(`Números repetidos não são permitidos. Repetidos: ${duplicates.join(', ')}`);
            return;
        }
        if (manualNumbers.some(n => n > totalCount)) {
            setManualCheckError(`Números não podem ser maiores que ${totalCount}.`);
            return;
        }

        const updatedGame = { ...game, manualCheck: manualNumbers.sort((a,b)=>a-b) };
        updateGameInState(updatedGame);
        setManualCheckActive(false);
    };

    const handleUndoManualCheck = () => {
        const updatedGame = { ...game, manualCheck: null };
        updateGameInState(updatedGame);
        setManualNumbers(Array(numCount).fill(0));
        setManualCheckActive(false);
    };
    
    const handleInputChange = (index: number, value: string) => {
        const num = parseInt(value, 10);
        const newNumbers = [...manualNumbers];
        newNumbers[index] = isNaN(num) ? 0 : num;
        setManualNumbers(newNumbers);
        
        // Auto-focus next input
        if (value.length >= String(totalCount).length && index < numCount - 1) {
            manualInputRefs.current[index + 1]?.focus();
        }
    };

    const resultToUse = game.officialResult || game.manualCheck;
    
    return (
        <main>
            <h2>Detalhes do Jogo - Concurso {game.targetContest}</h2>
            <h3>{LOTTERY_CONFIG[game.type].name}</h3>
            
            <div className="results-table-wrapper">
                 <table className="results-table">
                    <thead>
                        <tr>
                            <th>Jogo Nº</th>
                            <th>Números</th>
                            {resultToUse && <th>Acertos</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {game.games.map((g, index) => {
                            const hits = resultToUse ? g.numbers.filter(n => resultToUse.includes(n)).length : null;
                            return (
                                <tr key={g.id}>
                                    <td>{index + 1}</td>
                                    <td>
                                        {g.numbers.map((n, i) => (
                                            <span key={i} className={resultToUse?.includes(n) ? 'highlight-number' : ''}>
                                                {n}{i < g.numbers.length - 1 ? ', ' : ''}
                                            </span>
                                        ))}
                                    </td>
                                    {resultToUse && <td>{hits}</td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {resultToUse && (
                <div className="hits-summary">
                    <h4>{game.officialResult ? 'Resultado Oficial' : 'Resultado da Simulação'}:</h4>
                    <p>{resultToUse.join(', ')}</p>
                </div>
            )}
            
            <div className="manual-check-container">
                {game.officialResult ? (
                    <p className="official-lock-message">Este jogo foi conferido com o resultado oficial e não pode mais ser alterado.</p>
                ) : (
                    <>
                        {!manualCheckActive && !game.manualCheck && (
                            <button className="btn-primary" onClick={() => setManualCheckActive(true)}>Conferir Manualmente</button>
                        )}
                        {manualCheckActive && (
                             <>
                                <h4>Insira os números sorteados para simular:</h4>
                                <div className="manual-inputs">
                                    {Array.from({ length: numCount }).map((_, i) => (
                                        <input
                                            key={i}
                                            // Fix: Corrected ref callback to prevent returning a value, fixing a TypeScript error.
                                            ref={el => { manualInputRefs.current[i] = el; }}
                                            type="number"
                                            min="1"
                                            max={totalCount}
                                            value={manualNumbers[i] > 0 ? manualNumbers[i] : ''}
                                            onChange={(e) => handleInputChange(i, e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                        />
                                    ))}
                                </div>
                                {manualCheckError && <p className="error-message">{manualCheckError}</p>}
                                <div className="action-buttons">
                                    <button className="btn-secondary" onClick={() => setManualCheckActive(false)}>Cancelar</button>
                                    <button className="btn-primary" onClick={handleManualCheck}>Salvar Conferência</button>
                                </div>
                             </>
                        )}
                        {game.manualCheck && !manualCheckActive && (
                             <div className="action-buttons">
                                 <button className="btn-primary" onClick={handleUndoManualCheck}>Desfazer Conferência Manual</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
};

const TeimosinhaModal = ({ onClose, onSave }: any) => {
    const [contests, setContests] = useState(3);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSave = () => {
        if (contests >= 2) {
            onSave(contests);
        }
    };
    
    const handleContestChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setContests(value === '' ? 0 : parseInt(value, 10));
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose}>&times;</button>
                <h3>Salvar como Teimosinha</h3>
                <p>A Teimosinha repete seu jogo por múltiplos concursos. Por quantos concursos você deseja que este jogo concorra (mínimo 2)?</p>
                <div className="input-group">
                    <input
                        ref={inputRef}
                        type="number"
                        value={contests > 0 ? contests : ''}
                        onChange={handleContestChange}
                        min="2"
                    />
                    <label>concursos</label>
                </div>
                <div className="action-buttons">
                    <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn-primary" onClick={handleSave} disabled={contests < 2}>Salvar</button>
                </div>
            </div>
        </div>
    );
};

// --- React App Entry Point ---
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
