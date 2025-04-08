const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.ASSISTANT_ID;

// Armazenamento temporário de threads (em produção, use um banco de dados)
const threadStore = new Map();

app.post('/api/chat', async (req, res) => {
    try {
        const { message, threadId } = req.body;
        let currentThreadId = threadId;

        // Se não existe thread, cria uma nova
        if (!currentThreadId) {
            const thread = await openai.beta.threads.create();
            currentThreadId = thread.id;
            threadStore.set(currentThreadId, thread);
        }

        // Adiciona a mensagem do usuário à thread
        await openai.beta.threads.messages.create(currentThreadId, {
            role: "user",
            content: message
        });

        // Executa o assistente
        const run = await openai.beta.threads.runs.create(currentThreadId, {
            assistant_id: ASSISTANT_ID
        });

        // Aguarda a resposta (com timeout)
        let runStatus = await openai.beta.threads.runs.retrieve(currentThreadId, run.id);
        let attempts = 0;
        const maxAttempts = 10;

        while (runStatus.status !== 'completed' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(currentThreadId, run.id);
            attempts++;
        }

        if (runStatus.status !== 'completed') {
            throw new Error('Tempo limite excedido');
        }

        // Obtém as mensagens da thread
        const messages = await openai.beta.threads.messages.list(currentThreadId);
        const lastMessage = messages.data[0];

        res.json({
            response: lastMessage.content[0].text.value,
            threadId: currentThreadId
        });

    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ error: 'Erro ao processar mensagem' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
