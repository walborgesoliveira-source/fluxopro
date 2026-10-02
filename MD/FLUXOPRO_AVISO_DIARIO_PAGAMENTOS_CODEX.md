# FluxoPro — Aviso Diário de Pagamentos por Vencimento

## Objetivo

Implementar no projeto **FluxoPro** um aviso automático diário por e-mail contendo todos os pagamentos com vencimento no dia.

O aviso deverá ser enviado para:

**waldirborges@iaguru.com.br**

A implementação deve utilizar exclusivamente a arquitetura atual do projeto:

- **Backend:** Node.js + Express
- **Banco de dados:** PostgreSQL 16
- **Acesso ao banco:** biblioteca `pg`
- **Consultas:** SQL direto
- **Infraestrutura:** Docker
- **Container PostgreSQL:** `fluxopro_db`
- **Automação:** executada pelo próprio backend
- **n8n:** não utilizar

---

# Arquitetura atual do FluxoPro

O projeto utiliza PostgreSQL 16 como banco relacional.

Principais tabelas:

| Tabela | Finalidade |
|---|---|
| `usuarios` | Cadastros e acesso |
| `categorias` | Categorias de receitas e despesas |
| `contas_pagar` | Despesas e pagamentos |
| `contas_receber` | Receitas e recebimentos |
| `movimentacoes` | Entradas e saídas do caixa |
| `contas_bancarias` | Contas e saldos iniciais |
| `recorrencias` | Regras de lançamentos recorrentes |
| `cartoes` | Cartões de crédito |
| `faturas` | Faturas dos cartões |

Os registros financeiros são relacionados ao usuário através de:

```text
usuario_id
```

O sistema também possui campos para distinguir registros de **Pessoa Física (PF)** e **Pessoa Jurídica (PJ)**.

Arquivos importantes já existentes:

```text
fluxopro/docker-compose.yml
fluxopro/backend/src/database/init.js
fluxopro/backend/src/database/connection.js
```

Antes de modificar qualquer coisa, o CODEX deve ler esses arquivos e respeitar a estrutura atual.

---

# Fonte dos dados do aviso

A origem principal do aviso diário deverá ser:

```text
contas_pagar
```

Não utilizar `contas_receber`, `movimentacoes`, `faturas` ou outras tabelas para montar o aviso, salvo se a estrutura atual de `contas_pagar` depender explicitamente dessas tabelas para recuperar algum dado necessário.

O CODEX deverá primeiro inspecionar a definição real da tabela `contas_pagar` em:

```text
fluxopro/backend/src/database/init.js
```

e identificar os nomes reais dos campos equivalentes a:

- nome ou descrição do pagamento;
- valor;
- data de vencimento;
- forma de pagamento;
- status;
- `usuario_id`;
- identificação PF/PJ, caso aplicável.

**Não criar nomes de colunas por suposição.**

Adaptar todo o SQL aos campos existentes no banco.

---

# Requisitos funcionais

## 1. Buscar pagamentos com vencimento hoje

Todos os dias, o backend deverá consultar a tabela:

```sql
contas_pagar
```

e localizar os registros cujo vencimento corresponda à data atual.

A data deve considerar o fuso:

```text
America/Sao_Paulo
```

A lógica deve considerar apenas a data do vencimento, sem permitir que diferenças de horário ou UTC eliminem registros válidos.

O CODEX deverá usar uma consulta SQL compatível com o tipo real da coluna de vencimento.

Exemplo conceitual:

```sql
SELECT ...
FROM contas_pagar
WHERE vencimento = $1
```

ou, caso o campo seja timestamp:

```sql
WHERE vencimento::date = $1
```

O SQL definitivo deverá ser baseado na estrutura existente.

---

## 2. Pagamentos incluídos no aviso

O aviso deverá listar somente contas que:

- vencem hoje;
- ainda estão pendentes;
- não foram pagas;
- não foram canceladas;
- não estão inativas ou excluídas logicamente, caso o sistema possua esse conceito.

O CODEX deverá verificar como o FluxoPro representa esses estados atualmente.

Não criar novos status se já existir uma regra equivalente.

---

## 3. Dados exibidos no e-mail

Para cada pagamento, mostrar:

- **Nome do pagamento**
- **Valor**
- **Forma de pagamento**
- **Data de vencimento**

Exemplo:

| Pagamento | Valor | Forma de pagamento | Vencimento |
|---|---:|---|---|
| Internet | R$ 149,90 | Boleto | 02/10/2026 |
| Hospedagem VPS | R$ 89,00 | PIX | 02/10/2026 |
| Energia elétrica | R$ 320,45 | Boleto | 02/10/2026 |

Ao final:

```text
Total a pagar no dia: R$ 559,35
```

---

# Usuário e escopo dos dados

Como os registros financeiros do FluxoPro são vinculados por:

```text
usuario_id
```

o CODEX deverá verificar como identificar o usuário correto relacionado ao e-mail:

```text
waldirborges@iaguru.com.br
```

A consulta diária não deve enviar pagamentos pertencentes a outros usuários.

A solução preferencial é localizar o usuário na tabela `usuarios` pelo e-mail e utilizar seu `id` no filtro de `contas_pagar`.

Exemplo conceitual:

```sql
SELECT id
FROM usuarios
WHERE email = $1
LIMIT 1;
```

Depois:

```sql
SELECT ...
FROM contas_pagar
WHERE usuario_id = $1
  AND ...
```

Novamente, adaptar os nomes das colunas à estrutura real existente.

---

# PF e PJ

O FluxoPro possui distinção entre registros de **Pessoa Física** e **Pessoa Jurídica**.

O aviso diário deve funcionar independentemente de o pagamento estar relacionado a PF ou PJ.

Se os dados já possuírem um campo de tipo, origem, perfil ou natureza:

- não excluir registros PF;
- não excluir registros PJ;
- manter a informação disponível para futura evolução.

Nesta primeira versão, não é obrigatório exibir PF/PJ no e-mail.

---

# Envio do e-mail

## Destinatário

```text
waldirborges@iaguru.com.br
```

Não deixar esse endereço fixado diretamente dentro da regra de negócio.

Criar variável de ambiente:

```env
DAILY_PAYMENT_NOTIFICATION_EMAIL=waldirborges@iaguru.com.br
```

---

## Assunto

Formato:

```text
FluxoPro — Pagamentos com vencimento hoje - DD/MM/AAAA
```

Exemplo:

```text
FluxoPro — Pagamentos com vencimento hoje - 02/10/2026
```

---

# Modelo do e-mail

Criar HTML simples, responsivo e legível.

Exemplo visual:

```text
FluxoPro
Pagamentos com vencimento hoje — 02/10/2026

Internet
R$ 149,90
Boleto

Hospedagem VPS
R$ 89,00
PIX

Energia elétrica
R$ 320,45
Boleto

----------------------------

Total do dia: R$ 559,35
```

Preferencialmente utilizar tabela HTML com:

```text
Pagamento
Valor
Forma de pagamento
Vencimento
```

---

# Formatação de valores

Utilizar padrão brasileiro:

```text
R$ 1.250,00
R$ 89,90
R$ 10.430,55
```

No Node.js, utilizar preferencialmente:

```js
new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
```

Evitar formatação manual.

---

# Formatação de datas

Utilizar:

```text
pt-BR
```

e timezone:

```text
America/Sao_Paulo
```

Sempre que possível, centralizar a obtenção da data de referência em uma função única.

Exemplo conceitual:

```js
const hoje = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());
```

O CODEX poderá usar abordagem equivalente desde que preserve corretamente a data local.

---

# Horário do aviso

O processo deverá executar diariamente.

Horário inicial:

```text
08:00
```

Fuso:

```text
America/Sao_Paulo
```

Adicionar configuração:

```env
DAILY_PAYMENT_NOTIFICATION_TIME=08:00
DAILY_PAYMENT_NOTIFICATION_EMAIL=waldirborges@iaguru.com.br
TZ=America/Sao_Paulo
```

---

# Agendamento

## Não utilizar n8n

O projeto FluxoPro atualmente não possui:

- serviço n8n;
- dependência n8n;
- integração n8n;
- workflow n8n.

Portanto:

**não adicionar n8n para esta funcionalidade.**

A rotina deverá ser executada pelo próprio backend Node.js.

---

## Estratégia de execução

Primeiro, verificar se o projeto já possui:

- scheduler;
- cron interno;
- fila;
- worker;
- serviço de tarefas periódicas.

Se já existir, reutilizar.

Se não existir, implementar uma solução simples dentro do backend Node.js.

Preferência:

```text
node-cron
```

ou recurso equivalente já adotado no projeto.

Adicionar nova dependência somente se realmente não existir solução equivalente.

A rotina deve ser iniciada junto com o backend, sem bloquear o servidor Express.

---

# Estrutura sugerida no backend

Respeitar o padrão de diretórios já existente.

Caso não exista estrutura equivalente, utilizar uma organização semelhante a:

```text
backend/src/
├── database/
│   ├── connection.js
│   └── init.js
├── services/
│   ├── emailService.js
│   └── dailyPaymentNotificationService.js
├── jobs/
│   └── dailyPaymentNotificationJob.js
└── ...
```

Esses nomes são apenas referência.

**Se o projeto já possuir convenção diferente, seguir a convenção existente.**

---

# Consulta SQL

Utilizar obrigatoriamente a conexão PostgreSQL já existente em:

```text
backend/src/database/connection.js
```

Não criar segunda conexão independente.

Não utilizar ORM.

Não adicionar Prisma, Sequelize, TypeORM ou outro ORM.

Usar a biblioteca atual:

```text
pg
```

com consultas parametrizadas.

Exemplo conceitual:

```js
const result = await pool.query(
  `
  SELECT ...
  FROM contas_pagar
  WHERE usuario_id = $1
    AND ...
  `,
  [usuarioId]
);
```

Nunca concatenar valores externos diretamente em SQL.

---

# Serviço de e-mail

Antes de criar qualquer serviço novo, o CODEX deverá procurar no backend por:

```text
nodemailer
smtp
mail
email
sendMail
transporter
```

Se já existir serviço de e-mail, reutilizar.

Se não existir, implementar usando uma solução adequada ao Node.js, preferencialmente:

```text
nodemailer
```

Configuração através de variáveis de ambiente:

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_SECURE=
```

Nunca inserir senha, token ou credencial diretamente no código.

---

# Quando não houver pagamentos

Se não houver contas vencendo no dia:

```text
não enviar e-mail
```

Registrar apenas no log:

```text
Nenhum pagamento com vencimento em DD/MM/AAAA.
```

---

# Controle contra envio duplicado

O backend não pode enviar duas vezes o mesmo aviso no mesmo dia.

Como o FluxoPro já utiliza PostgreSQL, implementar o controle no próprio banco.

## Nova tabela sugerida

Caso não exista estrutura equivalente, criar uma tabela específica, por exemplo:

```sql
CREATE TABLE IF NOT EXISTS notificacoes_envio (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    tipo VARCHAR(100) NOT NULL,
    data_referencia DATE NOT NULL,
    destinatario VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL,
    enviado_em TIMESTAMP,
    erro TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Adicionar uma restrição equivalente a:

```sql
UNIQUE (usuario_id, tipo, data_referencia, destinatario)
```

A nomenclatura definitiva deve seguir o padrão já utilizado no banco.

Se o projeto já possuir tabela de logs, notificações ou auditoria adequada, reutilizar em vez de criar esta tabela.

---

# Fluxo da rotina

```text
Backend inicia
     ↓
Scheduler é carregado
     ↓
Todos os dias às 08:00
     ↓
Obter data atual em America/Sao_Paulo
     ↓
Localizar usuário pelo e-mail configurado
     ↓
Verificar se o aviso do dia já foi enviado
     ↓
Consultar contas_pagar
     ↓
Filtrar usuario_id
     ↓
Filtrar vencimento = hoje
     ↓
Remover pagas/canceladas/inativas
     ↓
Existem pagamentos?
   ↓             ↓
  SIM           NÃO
   ↓             ↓
Somar valores   Registrar log
   ↓             ↓
Gerar HTML      Encerrar
   ↓
Enviar e-mail
   ↓
Registrar envio no PostgreSQL
```

---

# Logs

Registrar pelo menos:

```text
[INFO] Iniciando verificação diária de pagamentos.
[INFO] Data de referência: 02/10/2026.
[INFO] Usuário localizado.
[INFO] 3 pagamentos encontrados.
[INFO] E-mail enviado para waldirborges@iaguru.com.br.
```

Quando não houver contas:

```text
[INFO] Nenhum pagamento com vencimento hoje.
```

Em caso de falha:

```text
[ERROR] Falha ao processar aviso diário de pagamentos.
```

Nunca registrar:

- senha SMTP;
- token;
- segredo;
- credenciais completas.

---

# Tratamento de falhas

Caso o envio falhe:

- registrar erro;
- não marcar o aviso como enviado;
- permitir nova tentativa;
- não duplicar envios já concluídos.

Se existir infraestrutura de retry no projeto, reutilizar.

Caso não exista, manter a implementação simples e segura.

---

# Integração com Docker

O PostgreSQL já roda no container:

```text
fluxopro_db
```

O CODEX deverá verificar:

```text
fluxopro/docker-compose.yml
```

e garantir que:

- nenhuma nova instância de PostgreSQL seja criada;
- a aplicação continue utilizando o banco existente;
- as novas variáveis de ambiente sejam adicionadas de forma compatível com o projeto;
- nenhuma credencial seja gravada no repositório.

Caso seja necessário adicionar variável ao serviço do backend no `docker-compose.yml`, fazer apenas as alterações necessárias.

---

# Alteração do banco de dados

Como a criação inicial das tabelas está atualmente em:

```text
backend/src/database/init.js
```

se for necessária uma nova tabela para controlar notificações, seguir o mesmo padrão existente nesse arquivo.

Não implantar sistema de migrations novo apenas para esta funcionalidade, salvo se o projeto já tiver migrations configuradas.

---

# Instruções obrigatórias para o CODEX

Antes de escrever código:

1. Ler:

```text
fluxopro/docker-compose.yml
fluxopro/backend/src/database/init.js
fluxopro/backend/src/database/connection.js
```

2. Localizar também:

```text
package.json
arquivo principal do Express
rotas
services
utils
configuração de .env
```

3. Pesquisar no projeto por:

```text
contas_pagar
usuario_id
email
nodemailer
sendMail
cron
scheduler
setInterval
status
vencimento
forma_pagamento
```

4. Identificar os nomes reais dos campos.

5. Não presumir estrutura de tabela.

6. Reaproveitar o pool PostgreSQL atual.

7. Não utilizar ORM.

8. Não utilizar n8n.

9. Não criar outro banco.

10. Não alterar funcionalidades financeiras existentes.

---

# Função principal esperada

Criar uma rotina equivalente a:

```text
sendDailyDuePaymentsNotification()
```

Responsabilidades:

1. Obter a data atual em `America/Sao_Paulo`;
2. Localizar o usuário pelo e-mail configurado;
3. Obter seu `usuario_id`;
4. Verificar se o aviso do dia já foi enviado;
5. Buscar em `contas_pagar` os pagamentos que vencem hoje;
6. Aplicar os filtros de status existentes;
7. Calcular o total;
8. Gerar o HTML;
9. Enviar o e-mail;
10. Registrar o resultado no PostgreSQL.

---

# Segurança

Todas as consultas SQL devem utilizar parâmetros:

```text
$1
$2
$3
```

Não utilizar SQL concatenado.

Não expor:

```text
SMTP_PASSWORD
POSTGRES_PASSWORD
tokens
credenciais
```

Não alterar políticas de autenticação dos usuários.

---

# Testes

Criar testes compatíveis com a estrutura já existente no projeto.

## Teste 1 — conta vencendo hoje

Criar ou simular:

```text
Pagamento: Internet
Valor: 149.90
Vencimento: hoje
Forma: Boleto
Status: pendente
```

Resultado:

```text
deve aparecer no e-mail
```

---

## Teste 2 — conta futura

Conta vencendo amanhã:

```text
não deve aparecer
```

---

## Teste 3 — conta já paga

Conta vencendo hoje, mas já paga:

```text
não deve aparecer
```

---

## Teste 4 — outro usuário

Conta vencendo hoje ligada a outro:

```text
usuario_id
```

Resultado:

```text
não deve aparecer
```

---

## Teste 5 — PF e PJ

Validar que contas PF e PJ pertencentes ao usuário sejam tratadas corretamente.

---

## Teste 6 — total

Valores:

```text
R$ 100,00
R$ 200,00
R$ 50,50
```

Resultado:

```text
R$ 350,50
```

---

## Teste 7 — nenhum pagamento

Resultado esperado:

```text
nenhum e-mail enviado
```

---

## Teste 8 — duplicidade

Executar a rotina duas vezes para a mesma data.

Resultado:

```text
apenas um e-mail enviado
```

---

## Teste 9 — timezone

Executar em servidor configurado em UTC.

Resultado:

```text
a rotina deve continuar considerando a data de America/Sao_Paulo
```

---

# Critérios de aceite

A implementação estará concluída quando:

- [ ] Utilizar `contas_pagar` como fonte principal;
- [ ] Utilizar PostgreSQL 16 já existente;
- [ ] Utilizar a biblioteca `pg`;
- [ ] Utilizar SQL direto e parametrizado;
- [ ] Utilizar o pool/conexão existente;
- [ ] Filtrar pelo `usuario_id` correto;
- [ ] Considerar PF e PJ;
- [ ] Buscar somente pagamentos com vencimento hoje;
- [ ] Exibir nome do pagamento;
- [ ] Exibir valor;
- [ ] Exibir forma de pagamento;
- [ ] Exibir vencimento;
- [ ] Exibir total do dia;
- [ ] Enviar para `waldirborges@iaguru.com.br`;
- [ ] Executar diariamente às 08:00;
- [ ] Utilizar `America/Sao_Paulo`;
- [ ] Não enviar contas pagas ou canceladas;
- [ ] Não enviar e-mail quando não houver pagamentos;
- [ ] Impedir envio duplicado;
- [ ] Registrar sucesso e erro;
- [ ] Não utilizar n8n;
- [ ] Não adicionar ORM;
- [ ] Não criar outro banco PostgreSQL;
- [ ] Continuar funcionando em Docker;
- [ ] Manter credenciais fora do código;
- [ ] Preservar todas as funcionalidades atuais do FluxoPro.

---

# Resultado esperado

Todos os dias às:

```text
08:00
```

o backend Node.js do FluxoPro deverá verificar diretamente no PostgreSQL:

```text
fluxopro_db
```

os registros da tabela:

```text
contas_pagar
```

pertencentes ao usuário configurado.

Havendo pagamentos com vencimento no dia, enviar:

```text
FluxoPro
Pagamentos com vencimento hoje — 02/10/2026

Internet
R$ 149,90
Boleto

Hospedagem VPS
R$ 89,00
PIX

Energia elétrica
R$ 320,45
Boleto

----------------------------

Total do dia: R$ 559,35
```

Para:

```text
waldirborges@iaguru.com.br
```

---

# Regra final para o CODEX

Primeiro inspecione o código atual.

Depois implemente a solução usando:

```text
Node.js
Express
PostgreSQL 16
pg
SQL direto
Docker
```

Não utilizar:

```text
n8n
Prisma
Sequelize
TypeORM
novo banco de dados
serviço externo desnecessário
```

A implementação deve ser pequena, integrada à arquitetura existente e fácil de manter.

Não reestruture o FluxoPro inteiro.

Implemente somente o necessário para adicionar o **aviso diário de pagamentos por vencimento**.
