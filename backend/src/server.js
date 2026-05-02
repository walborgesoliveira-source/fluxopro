require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const contasPagarRoutes = require('./routes/contasPagar');
const contasReceberRoutes = require('./routes/contasReceber');
const dashboardRoutes = require('./routes/dashboard');
const categoriasRoutes = require('./routes/categorias');
const cartoesRoutes = require('./routes/cartoes');
const recorrenciasRoutes = require('./routes/recorrencias');
const relatoriosRoutes = require('./routes/relatorios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend estático (build de produção)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/contas-pagar', authMiddleware, contasPagarRoutes);
app.use('/api/contas-receber', authMiddleware, contasReceberRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/categorias', authMiddleware, categoriasRoutes);
app.use('/api/cartoes', authMiddleware, cartoesRoutes);
app.use('/api/recorrencias', authMiddleware, recorrenciasRoutes);
app.use('/api/relatorios', authMiddleware, relatoriosRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'FluxoPro', version: '0.1.0', timestamp: new Date().toISOString() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 FluxoPro API rodando na porta ${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 http://localhost:${PORT}\n`);
});

module.exports = app;
