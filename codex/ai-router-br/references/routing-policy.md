# Política de roteamento

1. Capacidade já paga vem primeiro para qualidade: agente principal e Codex por login/assinatura.
2. DeepSeek é usado para volume, repetição, exploração e overflow de baixo risco.
3. Tarefa pequena pode ser feita diretamente pelo principal; não há delegação compulsiva. `router.auto_delegate: false` no config do projeto mantém tudo no principal (exceto executor forçado explicitamente).
4. DeepSeek tem no máximo 2 tentativas por padrão, e só repete em indisponibilidade transitória (rede, timeout, 429, 5xx). Sem loop barato infinito.
5. Fallback ocorre somente por indisponibilidade: spawn/CLI ausente, timeout, rate/usage limit, falha de autenticação (inclusive login não-ChatGPT no Codex e saldo insuficiente no DeepSeek), erro de rede/API ou `sandbox_unavailable`. Nunca para mascarar teste quebrado, violação de escopo, commit do worker, repositório inseguro, comando de teste proibido, budget ou saída inválida.
6. Todo resultado externo exige revisão do principal; `auto_integrate=false`.
7. O processo Codex tem secrets removidos do ambiente e exige confirmação de login ChatGPT. O router não define `OPENAI_API_KEY` nem redireciona o Codex para DeepSeek.
8. `max_budget_usd` é um hard gate para DeepSeek porque é o worker pago por API. Para Codex por assinatura, os hard gates são timeout, escopo, max files, sandbox/worktree e revisão; `max_turns` é um limite de política/soft bound porque o CLI não expõe neste design um contador portátil de tool turns.
9. Se o repo estiver sujo ou rastrear secret real, workers externos são bloqueados (`status: blocked`); o principal decide como prosseguir sem contornar o gate.
10. O primeiro uso em qualquer projeto auto-inicializa `.ai-router/` e o bloco curto de regras; isso é infraestrutura local e reversível, não exige autorização.
