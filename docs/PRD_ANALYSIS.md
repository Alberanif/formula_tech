# Análise do PRD Fórmula Tech v1.0

## Intenção e estrutura

O PRD descreve uma aula com jogo competitivo, mas o núcleo pedagógico é o ciclo **prever → montar → medir → alterar → comparar → justificar**. A economia e a corrida criam consequências para decisões técnicas. A regra de prontidão precisa depender dos dois testes e de uma mudança real, não apenas de ter um carro completo.

O documento traz regras numéricas suficientemente específicas para implementação direta: 18 peças, 3 pilotos, 3 mecânicos, 6 atributos, três pistas, 1.200 Cr, três fases de mercado, três voltas e fórmulas de setor e desgaste. Essas regras foram centralizadas em `shared/game.js` e versionadas em `ft-1.0.0`.

## Decisões de implementação

- **Autoridade:** o browser nunca grava saldo ou tempo. A API Node valida a ação e grava o estado da sala com `commit_game_room`, que bloqueia a linha, verifica a versão e registra request, auditoria e efeito financeiro em uma transação.
- **Persistência:** o estado operacional da sala fica em JSONB versionado. Há tabelas separadas para tentativas, presença, auditoria e eventos financeiros. Isso reduz o número de tabelas de jogo da proposta do PRD; uma futura migração poderá materializar relatórios e snapshots em tabelas próprias.
- **Sincronização:** clientes consultam estado a cada segundo e qualquer participante pode chamar `sync-race`. O backend avança checkpoints usando seu relógio e sua versão da sala. O PRD propõe Broadcast/Presence privado; esta versão usa polling HTTP e uma tabela de presença.
- **Interface:** tema de oficina/pista em fundo escuro, com tipografia hospedada no próprio app; telas de gestão e corrida separadas para reduzir carga visual.
- **Privacidade:** escuderias usam nomes fictícios. O aluno só recebe dados privados da própria equipe. O professor recebe a sala completa; projeção recebe dados públicos com token próprio.

## Requisitos cobertos no código

Montagem de equipe e seis peças; mecânico como pré-requisito; reembolso do valor pago nas trocas; estoque por lote; M0/M1/M2; dois testes grátis e próximos pagos; engine determinística e logs por setor; hipótese, alteração, conclusão e checklist; salas privadas; baterias e final; consumo da classificatória e suprimentos básicos da final; largada futura; resultado oficial; QTE de reação, precisão e sequência com horários do servidor; pausa, projeção e exportação CSV.

## Pontos que exigem validação antes de uso

O PRD considera o produto pronto somente depois de publicação HTTPS, teste com 10 clientes, revisão de autorização, fluxo de reconexão e playtest em sala. A integração básica com Neon foi comprovada; os demais itens ainda dependem de ambiente real. Veja a matriz objetiva em `VALIDATION.md`.

## Desvios conhecidos do PRD

- O modelo físico e o balanceamento seguem o PRD; a camada de dados usa JSONB transacional em vez de todas as tabelas normalizadas propostas.
- O multiplayer usa polling HTTP. O Broadcast privado proposto no PRD não foi integrado.
- Não há anulação individual de QTE. A limpeza automática de salas foi configurada para cron em produção, mas ainda precisa ser homologada após publicação.
- O script de carga cobre inscrições e leituras simultâneas; ainda não executa QTE/corridas completos com dez navegadores.
- Há teste integrado de autenticação e sala no Neon; ainda não há e2e da corrida completa com navegadores reais.

Esses pontos não devem ser apresentados como verificados em aula.

## Cobertura por seção do PRD

| Seção | Tema | Situação nesta entrega |
| --- | --- | --- |
| 0–1 | Finalidade, visão e objetivo pedagógico | Implementado como eixo do fluxo; efeito em aula depende de playtest. |
| 2 | Papéis e permissões | Aluno, professor e projeção separados no endpoint; falta homologação com contas reais. |
| 3 | Ciclo da sessão | Construção, testes, trava, classificatórias, final, resultados e pausa de corrida; sem estado `PAUSED` global da sala. |
| 4 | Economia | Orçamento, preços, trocas, lotes, suprimentos e mercado implementados; histórico financeiro é agregado por ação no banco. |
| 5–6 | Catálogo e atributos | Implementados conforme vetores e níveis do PRD. |
| 7–8 | Circuitos e engine | Três pistas e fórmulas implementadas; balanceamento reproduz seção 36. |
| 9–10 | Testes e finanças avançadas | Testes, logs, comparação e indicador marginal implementados; visualização de oportunidade ainda simplificada. |
| 11–12 | Corrida e QTE | Corrida determinística, checkpoints, três tipos, validação de servidor e pausa; requer prova integrada de latência. |
| 13 | Torneio e prêmios | Até cinco por bateria, distribuição automática ou manual, final e prêmios; teste integrado pendente. |
| 14 | Telas do aluno | Fluxo principal coberto; tutorial guiado e relatório imprimível não incluídos. |
| 15 | Professor | Fases, mercado, baterias, pausa, projeção, remoção, renovação de código, demonstração e CSV. |
| 16–17 | Mensagens, UX e acessibilidade | Mensagens de erro, navegação, teclado, foco e movimento reduzido; teste com alunos ainda pendente. |
| 18 | Arquitetura | Stack Vite + API Node + Neon + Vercel preparada; polling substitui Broadcast. A escolha de Neon pelo usuário substitui Supabase do PRD. |
| 19 | Dados | Persistência transacional; esquema JSONB difere da normalização sugerida. Acesso ao banco é exclusivo do servidor. |
| 20–21 | API e segurança | Sessões próprias, ações autenticadas, idempotência, código hash, presença e controle de versão; teste integrado básico passou. |
| 22–23 | Histórias e pseudocódigo | Fluxos centrais traduzidos em regras executáveis; aceite completo depende da matriz QA. |
| 24–25 | Gráficos e observabilidade | Gráfico de setores, logs, auditoria e ledger; telemetria pedagógica agregada ainda limitada. |
| 26–27 | Operação da aula e sucesso | Guia docente incluído; métricas de sucesso dependem de aula real. |
| 28–29 | QA e cenários reais | Testes unitários e integração básica no Neon passaram; carga e usuários reais pendentes. |
| 30–31 | Fases e riscos | P0 principal codificado; riscos não mitigados listados em `VALIDATION.md`. |
| 32–33 | Pronto e entregáveis | Código, SQL, docs e testes de engine presentes; URL estável e homologação final pendentes. |
| 34–35 | Evolução e critério de produto | Ideias futuras não incluídas; o desafio pedagógico bloqueia prontidão. |
| 36 | Balanceamento preliminar | Reproduzido por teste combinatório automatizado. |
| 37 | Referências técnicas | Documentação oficial consultada; integração básica validada no Neon. |
