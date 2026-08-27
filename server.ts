import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const PORT = process.env.PORT || 3000;

// Confia no proxy (Render usa proxy reverso)
app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://agente-civico-eleitoral.onrender.com'
}));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  validate: { trustProxy: false }
});
app.use('/api/chat', limiter);

const cache = new Map();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// MODELO CORRETO: gemini-1.5-pro
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    console.log('🔹 Mensagem recebida:', message);

    if (!message) {
      console.warn('⚠️ Mensagem vazia');
      return res.status(400).json({ error: 'Mensagem vazia' });
    }

    const cacheKey = message.toLowerCase().trim();
    if (cache.has(cacheKey)) {
      console.log('✅ Resposta do cache');
      return res.json({ reply: cache.get(cacheKey) });
    }

    console.log('📡 Chamando Gemini com a chave:', process.env.GEMINI_API_KEY ? 'Chave presente' : 'Chave AUSENTE!');
    const prompt = `
      Você é o Agente de IA Cívico-Eleitoral da campanha de Joe Valle (Deputado Distrital - 12345) e Professora Fátima Sousa (Deputada Federal - 1230).
      Responda de forma clara, objetiva e com base nos dados oficiais.
      Sempre destaque os números de urna: Joe Valle é 12345 e Professora Fátima é 1230.
      Se perguntarem sobre propostas, mencione: Saúde Primária e UPAs, Defesa do FCDF, Segurança Hídrica e Agroecologia, Mobilidade Urbana e Expansão do Metrô.
      Para questões sobre Ficha Limpa, consulte as certidões negativas.
      Use linguagem acessível, com gírias do DF quando apropriado.
      Responda em português.
      Pergunta do usuário: ${message}
    `;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();
    console.log('✅ Resposta gerada com sucesso');

    cache.set(cacheKey, reply);
    setTimeout(() => cache.delete(cacheKey), 3600000);

    res.json({ reply });
  } catch (error) {
    console.error('❌ ERRO DETALHADO:', error);
    if (error.response) {
      console.error('📄 Resposta da API:', error.response.data);
    }
    res.status(500).json({ error: error.message || 'Erro interno no servidor' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
