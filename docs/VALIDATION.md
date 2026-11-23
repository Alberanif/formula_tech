# Validação e limites

## Verificado

- `npm test`: 18 testes das regras, catálogo, desgaste, economia, prontidão, rodadas, incidentes, prêmios, duelos de reação e balanceamento.
- Enumeração de 1.312 configurações financeiramente viáveis em M0, reproduzindo os líderes e tempos da seção 36 do PRD.
- `npm run build`: frontend gerado sem erro.
- `npm run db:migrate`: esquema e funções aplicados no Neon configurado.
- `npm run test:integration`: login docente, sessão de aluno, criação de sala com rodadas e voltas configuráveis, entrada na sala, leitura privada e de projeção, autorização, idempotência e auditoria passaram em banco real. Os registros criados pelo teste foram removidos.

## Pendente antes de uso em turma

| Critério | Situação |
| --- | --- |
| URL HTTPS estável | Publicada em `https://formulatech.vercel.app/`; confirmar novo deploy após mudanças |
| Conta docente definitiva | Criada no Neon e login validado pela API local |
| Dez alunos + professor + projeção | Pendente teste de carga com navegadores e rede escolar |
| QTE em rede escolar e latência | Pendente playtest |
| Reconexão, pausa e resultados sob falha de rede | Pendente teste integrado completo |
| Retenção automática | Código e cron configurados; execução em produção pendente |
| Distribuição manual de bateria | Implementada; teste integrado pendente |
| Acessibilidade com estudantes | Pendente teste em aula |

A matriz QA-001 a QA-075 do PRD permanece como roteiro de homologação. Os pontos pendentes não foram marcados como aprovados.

## Riscos conhecidos

- O QTE usa chegada ao servidor. Redes muito diferentes podem afetar respostas próximas, mesmo com empate de 50 ms. QTE pode ser desativado por sala.
- O estado da sala em JSONB simplifica commits para turmas pequenas, mas requer monitorar tamanho e custo de consultas.
- O link de projeção contém um token de leitura. A página usa política `no-referrer`; compartilhe o link somente na turma.
- A sincronização usa polling HTTP. Não há canal de mensagens em tempo real.
- O cron de retenção depende de publicação na Vercel com `CRON_SECRET` definido; a API local não o agenda sozinha.
