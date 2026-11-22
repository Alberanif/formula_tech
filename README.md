# Fórmula Tech

Jogo web de decisões de engenharia para alunos de 15 a 17 anos. Equipes recebem 1.200 créditos, montam um carro, comparam testes, justificam melhorias e competem em uma sala conduzida pelo professor.

## Estado

O código e as regras estão implementados. A migração e um teste integrado de login, sala, inscrição, autorização e projeção passaram no Neon fornecido para este projeto. Ainda faltam publicação HTTPS, teste com dez navegadores e playtest em aula. Veja [Validação](docs/VALIDATION.md).

## Rodar localmente

Requer Node.js 20 ou mais recente e uma instância Neon PostgreSQL.

1. Execute `npm install`.
2. Copie `.env.example` para `.env.local` e configure `DATABASE_URL` e `ROOM_CODE_PEPPER`. O arquivo local é ignorado pelo Git. Neste workspace, a conexão fornecida já foi configurada em `.env.local`.
3. Execute `npm run db:migrate`.
4. Execute `npm run teacher:create` e informe o e-mail e a senha docente (mínimo de 10 caracteres).
5. Execute `npm run dev` e abra `http://localhost:5173`.

Alunos entram com código de oito caracteres e uma sessão anônima própria por navegador. O professor entra com a conta criada no passo 4. Para simular alunos, use uma sala descartável: `$env:ROOM_CODE='CODIGO'; npm run load`.

## Comandos

| Comando | Função |
| --- | --- |
| `npm run dev` | API local e frontend Vite |
| `npm run db:migrate` | Cria ou atualiza as tabelas e funções no Neon |
| `npm run teacher:create` | Cria ou atualiza a conta docente |
| `npm test` | Testes das regras e do balanceamento |
| `npm run test:integration` | Teste real descartável no banco configurado |
| `npm run build` | Gera o frontend em `dist/` |
| `npm run db:cleanup` | Executa manualmente a limpeza de dados antigos |

## Publicação na Vercel

O repositório está preparado para ser importado na Vercel, mas a publicação precisa ser iniciada na conta Vercel do projeto:

1. Em **Add New > Project**, importe `Alberanif/formula_tech` do GitHub. Use a raiz do repositório como **Root Directory**. O `vercel.json` fixa Vite, `npm ci`, `npm run build`, saída `dist` e região `iad1` para as funções Node, próxima do Neon em `us-east-1`.
2. Antes de publicar, configure as variáveis **Production** no painel Vercel: `DATABASE_URL` (URI de conexão pooled do Neon), `ROOM_CODE_PEPPER` (o mesmo valor do `.env.local` deste workspace) e `CRON_SECRET` (novo segredo aleatório). Configure as mesmas variáveis em **Preview** caso queira testar os previews. São variáveis do servidor: não use prefixo `VITE_` nem as coloque no Git.
3. O esquema já foi migrado no Neon deste projeto e a conta docente já foi criada. Se usar outro banco, execute `npm run db:migrate` e `npm run teacher:create` com `DATABASE_URL` e `ROOM_CODE_PEPPER` configurados localmente antes de entrar no app.
4. Clique em **Deploy**. Abra a URL HTTPS gerada, teste login docente, criação de sala, entrada de aluno em outro navegador e página de projeção. Depois faça a homologação de turma descrita em [Validação](docs/VALIDATION.md).

O `vercel.json` agenda a limpeza diária via `/api/cleanup` às 03:00 UTC. A rota aceita somente a autenticação por `CRON_SECRET`. Ao conectar o GitHub à Vercel, novos pushes na branch principal poderão gerar deploys automáticos. [Importação Git](https://vercel.com/docs/git) · [Configuração Vercel](https://vercel.com/docs/project-configuration/vercel-json) · [Cron Jobs](https://vercel.com/docs/cron-jobs).

## Código e documentação

- `shared/game.js`: catálogo, economia e simulação determinística compartilhados.
- `server/core.ts`: ações de sala, testes, corrida e QTE.
- `api/game.ts`: autenticação, autorização e API HTTP; `api/cleanup.ts`: retenção.
- `db/001_foundation.sql`: esquema PostgreSQL e commits transacionais.
- `src/`: telas de aluno, professor e projeção.
- [Análise do PRD](docs/PRD_ANALYSIS.md), [Arquitetura](docs/ARCHITECTURE.md), [Guia do professor](docs/TEACHER_GUIDE.md).
