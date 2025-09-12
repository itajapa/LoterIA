import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- CONFIGURAÇÃO DOS JOGOS ---
const GAME_CONFIG = {
  lotofacil: {
    name: "Lotofácil",
    numbersPerGame: 15,
    totalNumbers: 25,
    color: "var(--secondary-color-lotofacil)",
    prizeTiers: [11, 12, 13, 14, 15],
  },
  megasena: {
    name: "Mega-Sena",
    numbersPerGame: 6,
    totalNumbers: 60,
    color: "var(--secondary-color-megasena)",
    prizeTiers: [4, 5, 6],
  },
};

type GameType = keyof typeof GAME_CONFIG;
type View = 'home' | 'confirmation' | 'results' | 'history' | 'historyDetail' | 'teimosinhaDetail';
type GameResult = number[][];
type FetchedResult = { contest: number; numbers: number[] };

// --- TIPOS PARA O HISTÓRICO ---
interface ConferenceResult {
  summary: Record<number, number>;
  winningNumbers: number[];
  checkedAt: string;
  type: 'manual' | 'official';
}
interface SavedGameSet {
  id: string;
  gameType: GameType;
  dateSaved: string;
  targetContest: number;
  generatedGames: GameResult;
  conference?: ConferenceResult;
}
interface TeimosinhaConferenceResult {
    contest: number;
    status: 'checked' | 'pending';
    winningNumbers?: number[];
    hits?: number;
}
interface SavedTeimosinhaSet {
    id: string;
    type: 'teimosinha';
    gameType: GameType;
    dateSaved: string;
    startContest: number;
    numberOfContests: number;
    theGame: number[];
    conferenceResults: TeimosinhaConferenceResult[];
}

type HistoryItem = SavedGameSet | SavedTeimosinhaSet;

const LOTTERY_API_BASE_URL = "https://loteriascaixa-api.herokuapp.com/api";

// --- FUNÇÕES AUXILIARES ---
const formatNumber = (n: number) => n.toString().padStart(2, '0');
const calculateHits = (game: number[], winningNumbers: number[]) => {
  return game.filter(num => winningNumbers.includes(num)).length;
};
const formatDate = (isoString: string) => new Date(isoString).toLocaleString('pt-BR');

// --- COMPONENTES DA UI ---
const Loader = ({ dark = false }) => <div className={`loader ${dark ? 'loader-dark' : ''}`}></div>;

const AppHeader: React.FC<{
    onNavigateHome: () => void;
    onNavigateToHistory: () => void;
}> = ({ onNavigateHome, onNavigateToHistory }) => (
    <header className="app-header persistent-header">
        <h1>Loter<b>IA</b></h1>
        <div className="header-actions">
            <button onClick={onNavigateHome} className="btn-tertiary">INÍCIO</button>
            <button onClick={onNavigateToHistory} className="btn-secondary">HISTÓRICO</button>
        </div>
    </header>
);

// FIX: Removed ApiModal component to adhere to API key handling guidelines.
const HelpModal: React.FC<{ onClose: () => void; }> = ({ onClose }) => (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">&times;</button>
            <h2>Como Usar o Aplicativo</h2>
            <ol>
                 {/* FIX: Removed API key step from instructions. */}
                 <li><strong>Análise:</strong> Escolha a quantidade de concursos, selecione o jogo e confirme os dados para a IA analisar.</li>
                <li><strong>Resultados:</strong> Gere sugestões de jogos. Se gostar, clique em <strong>"Salvar Jogos"</strong>.</li>
                <li><strong>Teimosinha:</strong> Salve um único jogo para ser conferido por vários concursos seguidos.</li>
                <li><strong>Histórico:</strong> Acesse o histórico para ver seus jogos salvos.</li>
                <li><strong>Conferência:</strong>
                    <ul>
                        <li>O app confere o resultado automaticamente assim que disponível na API. A conferência manual é para simulações ou resultados ainda não atualizados.</li>
                    </ul>
                </li>
            </ol>
        </div>
    </div>
);

const TeimosinhaModal: React.FC<{
    game: number[];
    gameType: GameType;
    onSave: (numContests: number) => void;
    onClose: () => void;
}> = ({ game, gameType, onSave, onClose }) => {
    const [numContestsStr, setNumContestsStr] = useState('3');

    const handleContestsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^[1-9]\d*$/.test(value)) {
            setNumContestsStr(value);
        }
    };

    const handleSave = () => {
        const num = Number(numContestsStr);
        if (num >= 2) {
            onSave(num);
        }
    };

    const isSaveDisabled = Number(numContestsStr) < 2;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">&times;</button>
                <h2>Salvar como Teimosinha</h2>
                <p>Este jogo será salvo para conferência nos próximos concursos.</p>
                <div className="teimosinha-game">
                    <strong>Jogo:</strong>
                    <span>{game.map(formatNumber).join(', ')}</span>
                </div>
                <div className="input-group" style={{marginTop: '1.5rem'}}>
                    <label htmlFor="teimosinha-contests">Conferir por</label>
                    <input
                        type="number"
                        id="teimosinha-contests"
                        value={numContestsStr}
                        onChange={handleContestsChange}
                        min="2"
                    />
                    <label htmlFor="teimosinha-contests">concursos</label>
                </div>
                <div className="action-buttons">
                    <button onClick={onClose} className="btn-secondary">Cancelar</button>
                    <button onClick={handleSave} className="btn-primary" disabled={isSaveDisabled}>
                        Salvar Teimosinha
                    </button>
                </div>
            </div>
        </div>
    );
};

const HomePage: React.FC<{
    onStartAnalysis: (g: GameType) => void;
    onNavigateToHistory: () => void;
    onShowHelp: () => void;
    isLoading: boolean;
    loadingGame: GameType | null;
    loadingMessage: string;
    contestsToFetch: number;
    setContestsToFetch: (c: number) => void;
}> = ({ onStartAnalysis, onNavigateToHistory, onShowHelp, isLoading, loadingGame, loadingMessage, contestsToFetch, setContestsToFetch }) => (
    <div className="container">
        <header className="app-header">
            <div>
                <h1>Loter<b>IA</b></h1>
                <p>Analisador de Loterias com IA</p>
                <i>AppWeb criado por Paulo Assis</i>
            </div>
            <div className="header-actions">
                 <button onClick={onShowHelp} className="btn-tertiary">COMO USAR O APP</button>
                 <button onClick={onNavigateToHistory} className="btn-secondary">Histórico de Jogos</button>
                 {/* FIX: Removed API button. */}
            </div>
        </header>

        <div className="main-content">
            <div className="input-group">
                <label htmlFor="contests-select">Analisar os últimos</label>
                <select id="contests-select" value={contestsToFetch} onChange={e => setContestsToFetch(Number(e.target.value))} disabled={isLoading}>
                    <option value="3">3 concursos</option>
                    <option value="5">5 concursos</option>
                    <option value="10">10 concursos</option>
                    <option value="15">15 concursos</option>
                    <option value="20">20 concursos</option>
                    <option value="50">50 concursos</option>
                    <option value="100">100 concursos</option>
                    <option value="200">200 concursos</option>
                </select>
            </div>
            <div className="game-selection">
                {Object.keys(GAME_CONFIG).map((gameKey) => {
                    const game = GAME_CONFIG[gameKey as GameType];
                    return (
                        <button
                            key={gameKey}
                            className={`game-btn ${loadingGame === gameKey ? 'loading' : ''}`}
                            style={{ '--game-color': game.color } as React.CSSProperties}
                            onClick={() => onStartAnalysis(gameKey as GameType)}
                            disabled={isLoading}
                        >
                            {isLoading && loadingGame === gameKey ? <><Loader /><span>{loadingMessage}</span></> : game.name}
                        </button>
                    );
                })}
            </div>
        </div>
    </div>
);

const ConfirmationPage: React.FC<{
    fetchedResults: FetchedResult[];
    onConfirm: () => void;
    onBack: () => void;
    gameType: GameType;
}> = ({ fetchedResults, onConfirm, onBack, gameType }) => (
    <div className="container">
        <h2>Confirme os Dados Coletados</h2>
        <p>Estes são os {fetchedResults.length} últimos resultados da {GAME_CONFIG[gameType].name} encontrados. A IA usará estes dados para a análise.</p>
        <div className="results-table-wrapper">
            <table className="results-table">
                <thead>
                    <tr>
                        <th>Concurso</th>
                        <th>Números Sorteados</th>
                    </tr>
                </thead>
                <tbody>
                    {fetchedResults.map(result => (
                        <tr key={result.contest}>
                            <td>{result.contest}</td>
                            <td>{result.numbers.map(formatNumber).join(', ')}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <div className="action-buttons">
            <button onClick={onBack} className="btn-secondary">Voltar</button>
            <button onClick={onConfirm} className="btn-primary">Confirmar e Analisar com IA</button>
        </div>
    </div>
);

const ResultsPage: React.FC<{
    generatedGames: GameResult;
    onGenerate: (numGames: number) => void;
    onSave: () => void;
    onSaveTeimosinha: (game: number[]) => void;
    gameType: GameType;
    isLoading: boolean;
    loadingMessage: string;
    saveMessage: 'game' | 'teimosinha' | null;
}> = ({ generatedGames, onGenerate, onSave, onSaveTeimosinha, gameType, isLoading, loadingMessage, saveMessage }) => (
    <div className="container">
        <h2>Análise Concluída</h2>
        <p>A IA analisou os dados. Agora, gere seus jogos.</p>
        <div className="generation-controls">
            <div className="generation-group">
                <h3>Gerar Jogos</h3>
                {[1, 5, 10, 50].map(num => (
                    <button key={num} onClick={() => onGenerate(num)} disabled={isLoading} className="btn-secondary">{`Gerar ${num} Jogo${num > 1 ? 's' : ''}`}</button>
                ))}
            </div>
             <div className="generation-group">
                <h3>Gerar Mais Jogos</h3>
                {[100, 150, 200].map(num => (
                    <button key={num} onClick={() => onGenerate(num)} disabled={isLoading} className="btn-secondary">{`Gerar ${num} Jogo${num > 1 ? 's' : ''}`}</button>
                ))}
            </div>
        </div>
        
        <div className="loading-feedback" aria-live="polite">{isLoading ? loadingMessage : <>&nbsp;</>}</div>
        
        {generatedGames.length > 0 && (
            <>
                <h3>Jogos Gerados</h3>

                {saveMessage === 'game' && <p className="success-message">Jogo salvo no histórico com sucesso!</p>}
                {saveMessage === 'teimosinha' && <p className="success-message">Teimosinha salva no histórico com sucesso!</p>}
                
                <div className="results-header-with-actions">
                    <div className="results-header-titles">
                        <span>Jogo Nº</span>
                        <span>Números</span>
                    </div>
                    <div className="generation-actions">
                         <button onClick={onSave} className="btn-primary" disabled={isLoading}>
                            {`Salvar ${generatedGames.length} Jogo${generatedGames.length > 1 ? 's' : ''}`}
                        </button>
                        <button 
                            onClick={() => onSaveTeimosinha(generatedGames[0])} 
                            className="btn-primary"
                            disabled={isLoading || generatedGames.length !== 1}
                            title={generatedGames.length !== 1 ? "A Teimosinha só pode ser salva para um único jogo." : ""}
                        >
                            Salvar como Teimosinha
                        </button>
                    </div>
                </div>

                <div className="results-table-wrapper">
                    <table className="results-table">
                        <tbody>
                            {generatedGames.map((game, index) => (
                                <tr key={index}>
                                    <td>{index + 1}</td>
                                    <td>{game.map(formatNumber).join(', ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </>
        )}
    </div>
);

const HistoryPage: React.FC<{
    history: HistoryItem[];
    onViewDetails: (id: string) => void;
    onBack: () => void;
}> = ({ history, onViewDetails, onBack }) => (
    <div className="container">
        <h2>Histórico de Jogos</h2>
        {history.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Nenhum jogo salvo ainda.</p>
        ) : (
            <ul className="history-list">
                {history.slice().sort((a, b) => new Date(b.dateSaved).getTime() - new Date(a.dateSaved).getTime()).map(item => {
                    let details;
                    if ('generatedGames' in item) { // This item is a SavedGameSet
                        details = (
                            <>
                                <strong>{GAME_CONFIG[item.gameType].name} - {item.generatedGames.length} Jogo(s) para o concurso {item.targetContest}</strong>
                                <small>Salvo em: {formatDate(item.dateSaved)}</small>
                                {item.conference && (
                                    <span className={`conference-summary ${item.conference.type}`}>Conferido ({item.conference.type}): {Object.values(item.conference.summary).reduce((a, b) => a + b, 0)} prêmio(s)</span>
                                )}
                            </>
                        );
                    } else { // This item must be a SavedTeimosinhaSet
                        details = (
                            <>
                                <strong>{GAME_CONFIG[item.gameType].name} - Teimosinha</strong>
                                <small>Salvo em: {formatDate(item.dateSaved)}</small>
                                <span className="conference-summary">Conferindo {item.numberOfContests} concursos</span>
                            </>
                        );
                    }
                    return (
                        <li key={item.id} className="history-item">
                            <div className="history-item-info">
                                {details}
                            </div>
                            <button onClick={() => onViewDetails(item.id)} className="btn-primary">Ver Detalhes</button>
                        </li>
                    )
                })}
            </ul>
        )}
        <div className="action-buttons">
            <button onClick={onBack} className="btn-secondary">Voltar</button>
        </div>
    </div>
);

const HistoryDetailPage: React.FC<{
    gameSet: SavedGameSet;
    onManualCheck: (id: string, numbers: number[]) => void;
    onUndoCheck: (id: string) => void;
    onBack: () => void;
    isLoading: boolean;
}> = ({ gameSet, onManualCheck, onUndoCheck, onBack, isLoading }) => {
    const config = GAME_CONFIG[gameSet.gameType];
    const [manualNumbers, setManualNumbers] = useState<string[]>(Array(config.numbersPerGame).fill(''));
    const [showManualInputs, setShowManualInputs] = useState(false);
    const [manualError, setManualError] = useState('');

    const isOfficial = gameSet.conference?.type === 'official';

    const handleManualInputChange = (index: number, value: string) => {
        const newNumbers = [...manualNumbers];
        if (/^\d{0,2}$/.test(value)) {
            newNumbers[index] = value;
            setManualNumbers(newNumbers);
            if (value.length === 2 && index < config.numbersPerGame - 1) {
                document.getElementById(`manual-input-${index + 1}`)?.focus();
            }
        }
    };

    const handleManualSubmit = () => {
        setManualError('');
        const numbers = manualNumbers.map(Number).filter(n => n > 0 && n <= config.totalNumbers);
        if (numbers.length !== config.numbersPerGame) {
            alert(`Por favor, insira ${config.numbersPerGame} números válidos.`);
            return;
        }
        const numSet = new Set(numbers);
        if (numSet.size !== numbers.length) {
            const counts = numbers.reduce((acc, value) => ({ ...acc, [value]: (acc[value] || 0) + 1 }), {} as Record<number, number>);
            const duplicates = Object.keys(counts).filter(key => counts[Number(key)] > 1);
            setManualError(`Não insira números duplicados. Repetidos: ${duplicates.join(', ')}`);
            return;
        }
        onManualCheck(gameSet.id, numbers);
        setShowManualInputs(false);
    };

    const winningNumbers = gameSet.conference?.winningNumbers || [];

    return (
        <div className="container">
            <h2>Detalhes do Jogo - {config.name}</h2>
            <p>Salvo em: {formatDate(gameSet.dateSaved)} | Concurso Alvo: {gameSet.targetContest}</p>
            
            {gameSet.conference && (
                <div className="hits-summary">
                    <h3>Resultado da Conferência {isOfficial ? '(Oficial)' : '(Manual)'}</h3>
                    <p><strong>Números Sorteados: {winningNumbers.map(formatNumber).join(', ')}</strong></p>
                    {config.prizeTiers.map(tier => {
                        const count = gameSet.conference!.summary[tier] || 0;
                        if(count > 0) return <p key={tier}>{count} jogo(s) com {tier} acertos</p>
                        return null;
                    })}
                    {Object.values(gameSet.conference.summary).reduce((a,b)=> a+b, 0) === 0 && <p>Nenhum prêmio desta vez.</p>}
                </div>
            )}

            <div className="manual-check-container">
                {isOfficial ? (
                    <p className="official-lock-message">Este resultado é oficial e não pode ser alterado.</p>
                ) : (
                    <>
                        {gameSet.conference?.type === 'manual' && (
                            <button onClick={() => onUndoCheck(gameSet.id)} className="btn-secondary">Desfazer Conferência Manual</button>
                        )}
                        {!showManualInputs && !gameSet.conference && (
                             <button onClick={() => setShowManualInputs(true)} className="btn-primary">Conferir Manualmente</button>
                        )}
                        {showManualInputs && (
                            <>
                                <h4>Conferência Manual</h4>
                                <p>Insira os números sorteados para simular o resultado.</p>
                                <div className="manual-inputs">
                                    {manualNumbers.map((val, i) => (
                                        <input
                                            key={i} id={`manual-input-${i}`} type="number" value={val}
                                            onChange={e => handleManualInputChange(i, e.target.value)}
                                            maxLength={2} placeholder="00"
                                        />
                                    ))}
                                </div>
                                {manualError && <p className="error-message">{manualError}</p>}
                                <div className="action-buttons" style={{justifyContent: 'flex-start'}}>
                                    <button onClick={handleManualSubmit} className="btn-primary">Conferir Simulação</button>
                                    <button onClick={() => setShowManualInputs(false)} className="btn-secondary">Cancelar</button>
                                </div>
                            </>
                        )}
                   </>
                )}
            </div>

            <h3>Jogos Salvos ({gameSet.generatedGames.length})</h3>
            <div className="results-table-wrapper">
                <table className="results-table">
                     <thead>
                        <tr>
                            <th>Jogo Nº</th>
                            <th>Números</th>
                            {gameSet.conference && <th>Acertos</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {gameSet.generatedGames.map((game, index) => (
                             <tr key={index}>
                                <td>{index + 1}</td>
                                <td>
                                    {game.map((num, i) => (
                                        <React.Fragment key={num}>
                                            <span className={winningNumbers.includes(num) ? 'highlight-number' : ''}>
                                                {formatNumber(num)}
                                            </span>
                                            {i < game.length - 1 && ', '}
                                        </React.Fragment>
                                    ))}
                                </td>
                                {gameSet.conference && <td>{calculateHits(game, winningNumbers)}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="action-buttons">
                <button onClick={onBack} className="btn-secondary">Voltar ao Histórico</button>
            </div>
        </div>
    );
};

const TeimosinhaDetailPage: React.FC<{
    gameSet: SavedTeimosinhaSet;
    onCheck: (id: string) => void;
    onBack: () => void;
    isLoading: boolean;
}> = ({ gameSet, onCheck, onBack, isLoading }) => {
    const config = GAME_CONFIG[gameSet.gameType];
    const totalPrizes = gameSet.conferenceResults.filter(r => r.hits && config.prizeTiers.includes(r.hits)).length;
    return (
        <div className="container">
            <h2>Detalhes da Teimosinha - {config.name}</h2>
            <p>Salvo em: {formatDate(gameSet.dateSaved)}</p>

            <div className="teimosinha-game">
                <strong>Seu Jogo:</strong>
                <span>{gameSet.theGame.map(formatNumber).join(', ')}</span>
            </div>
             
            <div className="hits-summary">
                <h3>Resumo da Teimosinha</h3>
                <p>Total de prêmios até agora: <strong>{totalPrizes}</strong></p>
                <div className="action-buttons" style={{marginTop: '1rem'}}>
                    <button onClick={() => onCheck(gameSet.id)} disabled={isLoading} className="btn-primary">
                        {isLoading ? <Loader dark /> : 'Atualizar Conferência'}
                    </button>
                </div>
            </div>

            <h3>Resultados dos Concursos</h3>
            <div className="results-table-wrapper">
                <table className="results-table teimosinha-detail-table">
                    <thead>
                        <tr>
                            <th>Concurso</th>
                            <th>Status</th>
                            <th>Números Sorteados</th>
                            <th>Acertos</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gameSet.conferenceResults.map(result => (
                            <tr key={result.contest}>
                                <td>{result.contest}</td>
                                <td className={`status-${result.status}`}>{result.status === 'checked' ? 'Conferido' : 'Pendente'}</td>
                                <td>
                                    {result.winningNumbers ? (
                                        result.winningNumbers.map((n, index) => (
                                            <React.Fragment key={n}>
                                                <span className={gameSet.theGame.includes(n) ? 'highlight-number' : ''}>
                                                    {formatNumber(n)}
                                                </span>
                                                {index < result.winningNumbers.length - 1 && ', '}
                                            </React.Fragment>
                                        ))
                                    ) : '---'}
                                </td>
                                <td>{result.hits !== undefined ? `${result.hits}` : '---'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="action-buttons">
                <button onClick={onBack} className="btn-secondary">Voltar ao Histórico</button>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [view, setView] = useState<View>('home');
    const [gameType, setGameType] = useState<GameType>('lotofacil');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [loadingGame, setLoadingGame] = useState<GameType | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [contestsToFetch, setContestsToFetch] = useState(50);
    const [fetchedResults, setFetchedResults] = useState<FetchedResult[]>([]);
    const [generatedGames, setGeneratedGames] = useState<GameResult>([]);
    const [saveMessage, setSaveMessage] = useState<'game' | 'teimosinha' | null>(null);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [currentDetailId, setCurrentDetailId] = useState<string | null>(null);
    const loadingMessageInterval = useRef<number | null>(null);
    const [teimosinhaModalGame, setTeimosinhaModalGame] = useState<number[] | null>(null);
    
    // FIX: Removed state for API key management from the UI.
    // The API key is now handled exclusively via environment variables.

    // FIX: Removed API key loading from localStorage.
    // Load history from localStorage on initial load
    useEffect(() => {
        try {
            const savedHistory = localStorage.getItem('lotteryAppHistory');
            if (savedHistory) setHistory(JSON.parse(savedHistory));
        } catch (error) { console.error("Failed to load data from localStorage", error); }
    }, []);

    const updateHistory = (newHistory: HistoryItem[]) => {
        try {
            setHistory(newHistory);
            localStorage.setItem('lotteryAppHistory', JSON.stringify(newHistory));
        } catch (error) { console.error("Failed to save history to localStorage", error); }
    };

    // FIX: Removed API Key Handlers (handleSaveApiKey, handleDeleteApiKey).

    // Auto-check official results on app load
    useEffect(() => {
        const autoUpdateOfficialResults = async () => {
            const historyToUpdate = history.filter(
                (item): item is SavedGameSet =>
                    'generatedGames' in item &&
                    (!item.conference || item.conference.type !== 'official')
            );

            if (historyToUpdate.length === 0) return;

            console.log(`Found ${historyToUpdate.length} items to check for official results.`);
            let wasUpdated = false;
            const newHistory = JSON.parse(JSON.stringify(history)); // Deep copy to avoid mutation issues

            const gameTypes = [...new Set(historyToUpdate.map(item => item.gameType))];
            const latestContests: Partial<Record<GameType, number>> = {};
            for (const type of gameTypes) {
                try {
                    const res = await fetch(`${LOTTERY_API_BASE_URL}/${type}/latest`);
                    if (res.ok) latestContests[type] = (await res.json()).concurso;
                } catch (e) { console.warn(`Could not fetch latest contest for ${type}`); }
            }

            for (let i = 0; i < newHistory.length; i++) {
                const item = newHistory[i];
                if ('generatedGames' in item && (!item.conference || item.conference.type !== 'official')) {
                    const latestContest = latestContests[item.gameType];
                    if (latestContest && item.targetContest <= latestContest) {
                        try {
                            const res = await fetch(`${LOTTERY_API_BASE_URL}/${item.gameType}/${item.targetContest}`);
                            if (res.ok) {
                                const data = await res.json();
                                const winningNumbers = data.dezenas.map(Number);
                                newHistory[i] = performConference(item, winningNumbers, 'official');
                                wasUpdated = true;
                            }
                        } catch (e) { /* ignore single fetch error */ }
                    }
                }
            }

            if (wasUpdated) {
                console.log("Official results updated in history.");
                updateHistory(newHistory);
            }
        };

        if (history.length > 0) autoUpdateOfficialResults();
    }, [history]);


    const startLoadingMessages = () => {
        const messages = ["Analisando frequência...", "Calculando probabilidades...", "Verificando padrões...", "Cruzando dados...", "Otimizando combinações..."];
        let index = 0;
        setLoadingMessage(messages[index]);
        if (loadingMessageInterval.current) clearInterval(loadingMessageInterval.current);
        loadingMessageInterval.current = window.setInterval(() => {
            index = (index + 1) % messages.length;
            setLoadingMessage(messages[index]);
        }, 1500);
    };

    const stopLoadingMessages = () => {
        if (loadingMessageInterval.current) {
            clearInterval(loadingMessageInterval.current);
            loadingMessageInterval.current = null;
        }
        setLoadingMessage(''); setIsLoading(false); setLoadingGame(null);
    };
    
    const handleStartAnalysis = async (selectedGameType: GameType) => {
        setGameType(selectedGameType);
        setIsLoading(true); setLoadingGame(selectedGameType);
        setLoadingMessage('Buscando resultados...');
        setGeneratedGames([]); setSaveMessage(null);

        try {
            const response = await fetch(`${LOTTERY_API_BASE_URL}/${selectedGameType}/latest`);
            if (!response.ok) throw new Error('Falha ao buscar o último concurso.');
            const data = await response.json();
            const latestContest = data.concurso;
            
            const results: FetchedResult[] = [];
            for (let i = 0; i < contestsToFetch; i++) {
                const contestNum = latestContest - i;
                if(contestNum <= 0) continue;
                try {
                    const contestResponse = await fetch(`${LOTTERY_API_BASE_URL}/${selectedGameType}/${contestNum}`);
                    if (contestResponse.ok) {
                        const contestData = await contestResponse.json();
                        results.push({ contest: contestData.concurso, numbers: contestData.dezenas.map(Number) });
                    }
                } catch (e) { console.warn(`Could not fetch contest ${contestNum}, skipping.`); }
            }
            setFetchedResults(results.sort((a, b) => b.contest - a.contest));
            setView('confirmation');
        } catch (error) {
            console.error("Error fetching lottery data:", error);
            alert("Não foi possível buscar os dados da loteria. Tente novamente mais tarde.");
        } finally { setIsLoading(false); setLoadingGame(null); setLoadingMessage(''); }
    };

    const handleConfirmAndAnalyze = () => {
        setGeneratedGames([]); setSaveMessage(null); setView('results');
    };

    const handleGenerateGames = async (numGames: number) => {
        // FIX: API key is now sourced from environment variables.
        if (!process.env.API_KEY) {
            alert("A chave de API do Google não está configurada no ambiente. A funcionalidade de IA está desativada.");
            return;
        }

        setIsLoading(true);
        startLoadingMessages();
        setSaveMessage(null);
        
        let ai;
        try {
            // FIX: Initialize GoogleGenAI with the API key from environment variables.
            ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        } catch (error) {
            console.error("Erro ao inicializar a API do Google:", error);
            alert("Ocorreu um erro ao inicializar a IA. A chave de API pode ser inválida ou estar faltando.");
            stopLoadingMessages();
            return;
        }

        const config = GAME_CONFIG[gameType];
        const resultsText = fetchedResults.map(r => `${r.contest}: ${r.numbers.join(', ')}`).join('\n');
        
        let prompt = `Analise os resultados anteriores da ${config.name} que forneci. Regras: sortear ${config.numbersPerGame} números de um total de ${config.totalNumbers}. Foco em: frequência de dezenas (quentes/frias), pares/trios comuns, distribuição par/ímpar, e soma das dezenas. Resultados Anteriores:\n${resultsText}\nCom base nisso, gere ${numGames} novas sugestões de jogos.`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                predictions: {
                    type: Type.ARRAY, description: `Uma lista de ${numGames} jogos.`,
                    items: {
                        type: Type.ARRAY, description: `Um único jogo com ${config.numbersPerGame} números.`,
                        items: { type: Type.INTEGER }
                    }
                }
            }
        };

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash", contents: prompt,
                config: {
                    systemInstruction: "Você é um especialista em análise estatística de loterias. Sua resposta deve ser exclusivamente o JSON solicitado.",
                    responseMimeType: "application/json", responseSchema: schema
                }
            });
            const responseJson = JSON.parse(response.text);
            if (responseJson.predictions && Array.isArray(responseJson.predictions)) {
                const sortedGames = responseJson.predictions
                    .map((game: any) => Array.isArray(game) ? game.sort((a: number, b: number) => a - b) : [])
                    .slice(0, numGames);
                setGeneratedGames(sortedGames);
            } else { throw new Error("Resposta da IA em formato inesperado."); }
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            // FIX: Updated error message to remove reference to user-managed API key.
            alert("Ocorreu um erro ao se comunicar com a IA. Verifique sua conexão com a internet e tente novamente.");
        } finally { stopLoadingMessages(); }
    };
    
    const handleSaveGames = () => {
        if (generatedGames.length === 0) return;
        const latestContest = Math.max(...fetchedResults.map(r => r.contest), 0);
        const newGameSet: SavedGameSet = {
            id: crypto.randomUUID(), gameType, dateSaved: new Date().toISOString(),
            targetContest: latestContest + 1, generatedGames,
        };
        updateHistory([...history, newGameSet]); 
        setSaveMessage('game');
        setTimeout(() => setSaveMessage(null), 3000);
    };

    const handleOpenTeimosinhaModal = (game: number[]) => setTeimosinhaModalGame(game);
    const handleCloseTeimosinhaModal = () => setTeimosinhaModalGame(null);
    
    const handleSaveTeimosinha = (numContests: number) => {
        if (!teimosinhaModalGame) return;
        const latestContest = Math.max(...fetchedResults.map(r => r.contest), 0);
        const startContest = latestContest + 1;
        const newTeimosinha: SavedTeimosinhaSet = {
            id: crypto.randomUUID(), type: 'teimosinha', gameType,
            // FIX: Corrected typo from newtoISOString() to new Date().toISOString()
            dateSaved: new Date().toISOString(), startContest,
            numberOfContests: numContests, theGame: teimosinhaModalGame,
            conferenceResults: Array.from({ length: numContests }, (_, i) => ({
                contest: startContest + i, status: 'pending'
            })),
        };
        updateHistory([...history, newTeimosinha]);
        setSaveMessage('teimosinha');
        handleCloseTeimosinhaModal();
        setTimeout(() => setSaveMessage(null), 3000);
    };

    const handleViewDetails = (id: string) => {
        const item = history.find(h => h.id === id);
        if(!item) return;
        setCurrentDetailId(id);
        if ('type' in item && item.type === 'teimosinha') {
            setView('teimosinhaDetail');
        } else {
            setView('historyDetail');
        }
    };

    const performConference = (gameSet: SavedGameSet, winningNumbers: number[], type: 'manual' | 'official'): SavedGameSet => {
        const summary: Record<number, number> = {};
        gameSet.generatedGames.forEach(game => {
            const hits = calculateHits(game, winningNumbers);
            if(GAME_CONFIG[gameSet.gameType].prizeTiers.includes(hits)) {
                summary[hits] = (summary[hits] || 0) + 1;
            }
        });
        return { ...gameSet, conference: { winningNumbers, summary, checkedAt: new Date().toISOString(), type } };
    };
    
    const handleCheckTeimosinha = async (id: string) => {
        setIsLoading(true);
        const gameSet = history.find(g => g.id === id && 'type' in g && g.type === 'teimosinha') as SavedTeimosinhaSet | undefined;
        if (!gameSet) { setIsLoading(false); return; }

        let updated = false;
        const newConferenceResults = [...gameSet.conferenceResults];

        for (const result of newConferenceResults) {
            if (result.status === 'pending') {
                 try {
                    const res = await fetch(`${LOTTERY_API_BASE_URL}/${gameSet.gameType}/${result.contest}`);
                    if (res.ok) {
                        const data = await res.json();
                        result.winningNumbers = data.dezenas.map(Number);
                        result.hits = calculateHits(gameSet.theGame, result.winningNumbers);
                        result.status = 'checked';
                        updated = true;
                    } else { break; } // Stop if a result is not yet available
                 } catch (e) {
                    console.warn(`Could not fetch teimosinha contest ${result.contest}, stopping check.`);
                    break;
                 }
            }
        }

        if (updated) {
            const updatedGameSet = { ...gameSet, conferenceResults: newConferenceResults };
            const newHistory = history.map(h => h.id === id ? updatedGameSet : h);
            updateHistory(newHistory);
        }
        setIsLoading(false);
    }

    const handleManualCheck = (id: string, numbers: number[]) => {
        const gameSet = history.find(g => g.id === id) as SavedGameSet | undefined;
        if (!gameSet || 'type' in gameSet) return;
        
        const updatedGameSet = performConference(gameSet, numbers, 'manual');
        const newHistory = history.map(g => g.id === id ? updatedGameSet : g);
        updateHistory(newHistory);
    };

    const handleUndoManualCheck = (id: string) => {
        const newHistory = history.map(item => {
            if (item.id === id && 'conference' in item && item.conference?.type === 'manual') {
                const { conference, ...rest } = item;
                return rest;
            }
            return item;
        }) as HistoryItem[];
        updateHistory(newHistory);
    };
    
    const renderView = () => {
        let currentViewComponent;

        switch (view) {
            case 'home':
                currentViewComponent = <HomePage onStartAnalysis={handleStartAnalysis} onNavigateToHistory={() => setView('history')} onShowHelp={() => setShowHelp(true)} isLoading={isLoading} loadingGame={loadingGame} loadingMessage={loadingMessage} contestsToFetch={contestsToFetch} setContestsToFetch={setContestsToFetch} />;
                break;
            case 'confirmation':
                currentViewComponent = <ConfirmationPage fetchedResults={fetchedResults} onConfirm={handleConfirmAndAnalyze} onBack={() => setView('home')} gameType={gameType} />;
                break;
            case 'results':
                currentViewComponent = <ResultsPage generatedGames={generatedGames} onGenerate={handleGenerateGames} onSave={handleSaveGames} onSaveTeimosinha={() => handleOpenTeimosinhaModal(generatedGames[0])} gameType={gameType} isLoading={isLoading} loadingMessage={loadingMessage} saveMessage={saveMessage} />;
                break;
            case 'history':
                currentViewComponent = <HistoryPage history={history} onViewDetails={handleViewDetails} onBack={() => setView('home')} />;
                break;
            case 'historyDetail': {
                const gameSet = history.find(g => g.id === currentDetailId && !('type' in g)) as SavedGameSet | undefined;
                currentViewComponent = gameSet ? <HistoryDetailPage gameSet={gameSet} onManualCheck={handleManualCheck} onUndoCheck={handleUndoManualCheck} onBack={() => setView('history')} isLoading={isLoading} /> : <div className="container"><p>Jogo não encontrado ou é uma Teimosinha.</p><button onClick={() => setView('history')} className="btn-secondary">Voltar</button></div>;
                break;
            }
            case 'teimosinhaDetail': {
                const gameSet = history.find(g => g.id === currentDetailId && 'type' in g && g.type === 'teimosinha') as SavedTeimosinhaSet | undefined;
                currentViewComponent = gameSet ? <TeimosinhaDetailPage gameSet={gameSet} onCheck={handleCheckTeimosinha} onBack={() => setView('history')} isLoading={isLoading} /> : <div className="container"><p>Jogo Teimosinha não encontrado.</p><button onClick={() => setView('history')} className="btn-secondary">Voltar</button></div>;
                break;
            }
            default:
                currentViewComponent = <div>Página não encontrada</div>;
        }

        return (
             <>
                {view !== 'home' && <div className="container" style={{paddingBottom: 0, boxShadow: 'none', background: 'transparent'}}><AppHeader onNavigateHome={() => setView('home')} onNavigateToHistory={() => setView('history')} /></div>}
                {currentViewComponent}
                {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
                {teimosinhaModalGame && <TeimosinhaModal game={teimosinhaModalGame} gameType={gameType} onSave={handleSaveTeimosinha} onClose={handleCloseTeimosinhaModal} />}
                {/* FIX: Removed ApiModal rendering. */}
            </>
        )
    };

    return renderView();
};

const container = document.getElementById('root');
if(container) {
    const root = createRoot(container);
    root.render(<App />);
}
