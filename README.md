# 💰 FluxoPro — SaaS de Gestão Financeira

Sistema SaaS completo de gestão financeira com controle de contas a pagar, receber e fluxo de caixa.

## 🚀 Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **Backend** | Node.js + Express |
| **Banco** | PostgreSQL 16 |
| **Frontend** | Vite + Vanilla JS |
| **Infra** | Docker + Nginx |

## 📁 Estrutura

```
fluxopro/
├── backend/          # API REST (Node.js/Express)
│   └── src/
│       ├── controllers/   # Lógica de negócio
│       ├── database/      # Conexão e inicialização
│       ├── middleware/     # Auth JWT
│       └── routes/        # Rotas da API
├── frontend/         # Interface Web (Vite)
│   └── src/
│       ├── components/    # Toast, etc
│       ├── pages/         # Dashboard, Pagar, Receber
│       ├── services/      # API client, utils
│       └── styles/        # CSS design system
├── docker-compose.yml
├── Dockerfile
├── nginx.conf
└── README.md
```

## 🛠️ Desenvolvimento Local

### Pré-requisitos
- Node.js 20+
- PostgreSQL 16 (ou Docker)

### Backend
```bash
cd backend
npm install
# Criar banco 'fluxopro' no PostgreSQL
npm run db:init   # Cria as tabelas
npm run dev       # Inicia com nodemon na porta 3000
```

### Frontend
```bash
cd frontend
npm install
npm run dev       # Inicia Vite na porta 5173 (proxy para API)
```

### Acessar
- **Frontend:** http://localhost:5173
- **API:** http://localhost:3000/api

## 🐳 Docker (Produção)

```bash
docker compose up -d --build
```

O sistema fica disponível em `http://localhost:3080`.

### Deploy na VPS

1. Clonar o repo na VPS
2. `docker compose up -d --build`
3. Configurar no Nginx Proxy Manager apontando para `fluxopro_nginx:80`
4. Ativar SSL com Let's Encrypt

## 📊 API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Criar conta |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Perfil |
| GET/POST/PUT/DELETE | `/api/contas-pagar` | CRUD despesas |
| GET/POST/PUT/DELETE | `/api/contas-receber` | CRUD receitas |
| GET | `/api/dashboard/resumo` | Resumo mensal |
| GET | `/api/dashboard/caixa-origem` | Caixa PF/PJ |
| GET/POST | `/api/categorias` | Categorias |

## 🔐 Autenticação

- JWT com expiração de 7 dias
- Token enviado no header: `Authorization: Bearer <token>`

## 📋 Roadmap

- [x] Fase 1 — Autenticação + CRUD Pagar/Receber
- [x] Fase 2 — Módulo de Caixa PF/PJ
- [ ] Fase 3 — Cartão de Crédito + Faturas
- [ ] Fase 4 — Recorrência Inteligente
- [ ] Fase 5 — Dashboard com Gráficos
- [ ] Fase 6 — Comparativo Mensal
- [x] Fase 7 — Docker + Nginx

---

*FluxoPro v0.1.0 — feat(init): estrutura inicial completa*
