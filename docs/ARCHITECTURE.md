# Arquitetura e API

## Fluxo de confiança

```mermaid
flowchart LR
  Browser[Aluno / Professor / Projeção] -->|Cookie ou token restrito| API[API Node /api/game]
  API -->|Valida e calcula| Rules[server/core.ts + shared/game.js]
  API -->|SQL parametrizado| Neon[(Neon PostgreSQL)]
  Neon --> Audit[Auditoria e finanças]
```

O navegador envia intenções, nunca o saldo ou os tempos finais. A API identifica o usuário pela sessão guardada em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção. A sessão contém um token aleatório; somente seu hash fica no banco. Senhas docentes usam `scrypt` com sal aleatório. Alunos recebem identidades anônimas próprias. A projeção usa apenas um token de leitura, comparado com hash no servidor, e não recebe dados privados da equipe.

As tabelas do Neon são acessadas somente pela API. A conexão de banco fica nas variáveis do servidor. Não há acesso SQL direto pelo navegador. Cada ação valida papel e vínculo com a sala. O backend recusa requisições de outra origem, limita tentativas de código e login e registra presença.

O estado operacional da sala é um JSONB versionado. `commit_game_room` bloqueia a linha, verifica versão, grava resposta idempotente, auditoria e eventos financeiros numa transação. Em conflito, o cliente repete a ação com o mesmo `requestId`. A classificação usa tempos calculados no servidor, nunca animação local. O polling HTTP consulta a sala a cada segundo; o relógio e os checkpoints são resolvidos no servidor.

## Ações `POST /api/game`

| Ação | Quem usa | Resultado |
| --- | --- | --- |
| `session`, `student-auth`, `teacher-login` | visitante | identidade/sessão |
| `create-room` | docente | sala, código, token de projeção |
| `join-room` | aluno | equipe na sala |
| `state` | membro ou projeção | visão filtrada |
| `team-action`, `equip-part`, `unequip-part` | equipe | profissionais e peças |
| `purchase-supply`, `refund-supply`, `assign-repair` | equipe | estoque e finanças |
| `run-test`, `submit-analysis`, `set-ready` | equipe | teste e análise |
| `market-action`, `room-transition`, `build-heats`, `build-final` | docente | andamento da aula |
| `race-action` | docente | controle da bateria |
| `sync-race` | membro | avanço oficial da corrida |
| `submit-qte` | aluno elegível | tentativa de QTE |
| `award`, `export-session`, `rotate-access` | docente | prêmios, CSV, acessos |

As mutações usam `requestId` UUID. A resposta inclui `ok`, `code`, `message`, `data` e, após commit, `current_version`.

## Fórmulas e pistas

Os atributos começam em `[35,35,30,30,40,40]`. Vetores de peça, piloto e auxiliar são limitados a 10–100. Scores e desgaste seguem o PRD e são implementados em `shared/game.js`; `npm test` verifica também a enumeração de 1.312 configurações viáveis e os líderes das três pistas.

QTEs podem surgir em 30%, 50%, 70% e 88% da bateria quando dois carros adjacentes estão a até 0,60 s, presentes e fora de cooldown. O relógio lógico congela durante o QTE. O servidor verifica abertura, expiração, sequência, zona de precisão e tentativa única. A diferença de até 50 ms é empate. O efeito máximo segue o PRD: perseguidor vencedor `−0,70/+0,15 s`; líder vencedor `−0,35/+0,20 s`.

Para incluir uma pista, adicione-a a `CIRCUITS` em `shared/game.js`, eleve `VERSION` e adicione um teste de balanceamento. Salas antigas guardam `configVersion`, mas versões antigas da engine não são executadas em paralelo; evite mudar regras durante uma turma ativa.
