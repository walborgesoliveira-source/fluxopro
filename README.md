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
- [x] Fase 3 — Cartão de Crédito + Faturas
- [x] Fase 4 — Recorrência Inteligente
- [x] Fase 5 — Dashboard com Gráficos
- [x] Fase 6 — Comparativo Mensal
- [x] Fase 7 — Docker + Nginx

---

*FluxoPro v0.1.0 — feat(init): estrutura inicial completa*

## Aviso diário de pagamentos

A rotina do backend consulta somente `contas_pagar` do usuário ativo cujo e-mail
corresponde a `DAILY_PAYMENT_NOTIFICATION_EMAIL`. Inclui PF e PJ, vencimento do dia
em `America/Sao_Paulo`, status `PENDENTE` e `data_pagamento IS NULL`. Contas
excluídas são removidas fisicamente no sistema atual; não existem campos de
cancelamento/inatividade nessa tabela. A rotina não gera lançamentos recorrentes.

O e-mail contém descrição, valor, forma de pagamento, vencimento e total, em HTML
com alternativa em texto. Sem contas elegíveis, apenas registra no log.

Configuração: copie `.env.example` para `.env` na raiz, preencha o SMTP e ajuste
`DAILY_PAYMENT_NOTIFICATION_ENABLED=true` somente quando estiver pronto para
ativar. O arquivo `.env` está ignorado pelo Git. No desenvolvimento local, passe
essas variáveis ao backend ou coloque-as em `backend/.env` junto da configuração
do banco. As credenciais do SMTP não são compartilhadas com outros projetos.

- Destinatário padrão do Docker: `waldirborges@iaguru.com.br`.
- Horário padrão: `08:00`, sempre em `America/Sao_Paulo`.
- `SMTP_SECURE=true` para TLS imediato (normalmente porta 465).
- `SMTP_SECURE=false` para STARTTLS obrigatório (normalmente porta 587).
- `SMTP_USER` e `SMTP_PASSWORD` devem ser preenchidos juntos; podem ficar vazios
  somente se o servidor escolhido permitir relay sem autenticação.
- `SMTP_FROM` é o remetente autorizado pelo provedor.

A tabela `notificacoes_envio` é criada de forma idempotente na inicialização e
quando o job habilitado inicia. Uma chave única por usuário, tipo, data e
destinatário, junto de um bloqueio PostgreSQL, protege contra envios concorrentes.
Não há outro banco, ORM ou n8n.

Estados: `ENVIANDO` é persistido antes de chamar o SMTP; `ENVIADO` indica aceitação
pelo servidor SMTP (não comprova entrega na caixa de entrada); `ERRO` permite nova
tentativa; `INCERTO` exige conferência no provedor. Se o processo parar entre o
SMTP e a confirmação no banco, o registro permanece `ENVIANDO`, sem reenvio
automático. SMTP e PostgreSQL não têm uma transação conjunta: essa escolha evita
reenvios cegos, mas exige conferência manual nesses casos. Nunca libere
`ENVIANDO`/`INCERTO` para nova tentativa sem confirmar que não houve aceitação.

O cron executa uma vez por dia, sem recuperar horários perdidos durante uma
parada. Para conferir o dia ou repetir uma falha definitiva, use dentro do
container da aplicação (após deploy aprovado):

```sh
docker exec fluxopro_app npm run notifications:preview
docker exec fluxopro_app npm run notifications:send
```

A prévia não grava nem envia; `notifications:send` envia de fato, preserva a
proteção contra duplicação e pode ser usado para tentativa manual no mesmo dia.
Para ativar a versão em produção, é necessário configurar o `.env` e reconstruir
somente a aplicação com `docker compose up -d --build --no-deps app`, após
autorização do responsável. Desative pelo mesmo processo com
`DAILY_PAYMENT_NOTIFICATION_ENABLED=false` para interromper o agendamento.

Validação local:

```sh
cd backend
npm ci
npm test
node scripts/check-payment-query.js
```

O último comando requer acesso ao container `fluxopro_db`: executa apenas SQL
em transação `READ ONLY`, usando dados simulados em CTE, sem gravar registros.
Os testes unitários simulam SMTP e persistência; nenhum e-mail real é enviado.
