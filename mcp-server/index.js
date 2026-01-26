import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.MCP_PORT || 8002;

// Middleware
app.use(cors({
  origin: [
    'https://ai.windexs.ru', 
    'https://www.ai.windexs.ru', 
    'http://ai.windexs.ru', 
    'http://www.ai.windexs.ru',
    'http://localhost:8081',  // Для локальной разработки (Vite)
    'http://localhost:5173',  // Для Vite dev server
    'http://127.0.0.1:8081',  // Для локальной разработки
    'http://127.0.0.1:5173',  // Для Vite dev server
    'http://localhost:1062'   // Для основного backend сервера
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Tavily search endpoint
app.post('/search', async (req, res) => {
  try {
    const { query, max_results = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    if (!TAVILY_API_KEY) {
      return res.status(500).json({ error: 'TAVILY_API_KEY not configured' });
    }

    // Make request to Tavily API
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: "advanced",
        include_images: false,
        include_answer: true,
        include_raw_content: false,
        max_results: max_results,
        include_domains: [],
        exclude_domains: []
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();

    // Format response for MCP
    const results = data.results.map(result => ({
      title: result.title,
      url: result.url,
      content: result.content,
      score: result.score
    }));

    res.json({
      query,
      results,
      answer: data.answer || null
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tavily-mcp-server' });
});

app.listen(PORT, () => {
  console.log(`🚀 Tavily MCP Server running on https://ai.windexs.ru/api/mcp`);
  console.log(`📊 Health check: https://ai.windexs.ru/api/mcp/health`);
  console.log(`🔍 Search endpoint: https://ai.windexs.ru/api/mcp/search`);
});
