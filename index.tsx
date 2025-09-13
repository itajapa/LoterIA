import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Importing GoogleGenAI according to guidelines.
import { GoogleGenAI } from "@google/genai";

// As per guidelines, API key is available in process.env.API_KEY.
// In a typical client-side React app, this should be handled securely via a backend proxy
// to avoid exposing the key. For this exercise, we assume it's available as instructed.
// Fix: Initializing GoogleGenAI with the correct named parameter as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const App = () => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateContent = async () => {
    if (!prompt) {
      setError('Please enter a prompt.');
      return;
    }
    setLoading(true);
    setError('');
    setResponse('');

    try {
      // Fix: Using the recommended 'gemini-2.5-flash' model and correct API call structure.
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      // Fix: Extracting the generated text directly from the `text` property of the response object.
      setResponse(result.text);
    } catch (e) {
      console.error(e);
      if (e instanceof Error) {
        setError(`Failed to generate content: ${e.message}`);
      } else {
        setError('An unknown error occurred while generating content.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '768px', margin: 'auto' }}>
      <h1>Gemini API Frontend Demo</h1>
      <p>Enter a prompt and see the response from the Gemini model.</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
        placeholder="e.g., why is the sky blue?"
      />
      <button
        onClick={generateContent}
        disabled={loading}
        style={{ marginTop: '10px', padding: '10px 20px', cursor: 'pointer', borderRadius: '4px', border: 'none', backgroundColor: '#4285F4', color: 'white' }}
      >
        {loading ? 'Generating...' : 'Generate Content'}
      </button>

      {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}

      {response && (
        <div style={{ marginTop: '20px', whiteSpace: 'pre-wrap', border: '1px solid #eee', padding: '15px', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
          <h2>Response:</h2>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
};

// Standard React entry point. Assumes an HTML file with <div id="root"></div>.
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
