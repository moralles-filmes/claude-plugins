# Portabilidade e migração para Google Cloud

> Padrão SaaS v3.1 — documento normativo. Não edite o corpo por projeto; adaptações vão em "Particularidades deste projeto", no final.
> Leia em tarefas de infraestrutura, Docker, workers dedicados ou quando uma decisão possa prender o projeto ao Supabase/Vercel.

## 1. Princípio

Não migre antecipadamente. Preserve a **possibilidade** de migrar sem reescrever domínio e casos de uso, e verifique essa possibilidade com critérios objetivos (§6), não só como intenção.

```text
Vercel + Supabase  →  Cloud Run + Supabase  →  Cloud Run + Cloud SQL
```

## 2. Matriz de dependências [N1]

Mantenha em "Particularidades" uma tabela **só com as capacidades que o projeto usa**:

| Capacidade usada | O que precisa estar definido |
|---|---|
| Postgres e extensões | Extensões em uso; compatibilidade com o destino (Cloud SQL tem lista própria de extensões suportadas); procedimento de migração |
| Identidade e RLS | Policies que dependem de `auth.uid()` e do schema `auth`; como usuário e tenant serão resolvidos no destino (claims definidas pela aplicação na sessão do banco, ou autorização movida para a aplicação) |
| Supabase Auth | Mapeamento de ids de usuário; plano para Identity Platform ou manutenção do Supabase Auth |
| API de dados (PostgREST/RPC) | Quais contratos o cliente usa diretamente; qual adapter ou serviço os atenderá |
| Storage | Objetos, paths, referências no banco e policies de acesso; destino (Cloud Storage) |
| Filas e cron (pgmq, pg_cron) | Execução, retries, recuperação e limites no destino (Cloud Tasks, Cloud Scheduler, Pub/Sub) |
| Realtime | Contrato mantido para o cliente e a alternativa no destino |
| Edge Functions (Deno) | Código portável para Node/Cloud Run; uso de APIs específicas do runtime |

## 3. Backend pronto para container [N1, quando houver backend dedicado ou worker]

- Processo stateless.
- Escuta em `0.0.0.0` na porta definida por `PORT`.
- Dockerfile versionado, com imagem base fixada.
- Configuração validada no boot, com erro claro se faltar variável.
- Health checks de liveness e readiness separados.
- Graceful shutdown: termina requisições em andamento e devolve trabalho não concluído à fila.
- Sem filesystem persistente. Logs estruturados no stdout.
- Timeouts e concorrência configuráveis.
- Pool de conexões limitado.
- Migrations fora do startup.
- Artefato imutável promovido entre ambientes.

## 4. Orçamento agregado de conexões [N2]

O limite do banco é dividido entre **todos** os consumidores ao mesmo tempo:

```text
(instâncias máx. da API × pool por instância)
+ (instâncias de workers × pool)
+ jobs/cron concorrentes
+ revisões simultâneas durante deploy
+ conexões administrativas
≤ limite do banco − reserva
```

Use pooler (Supavisor ou equivalente) e dimensione o pool por instância a partir dessa conta, não por instância isolada.

## 5. Modelo de execução de workers [N2]

Antes de mover trabalho assíncrono, defina onde ele roda e por quanto tempo:

- **Cloud Run:** a configuração de alocação/cobrança de CPU determina se há CPU fora de uma requisição. Trabalho iniciado depois da resposta pode ser interrompido. Prefira Cloud Tasks entregando HTTP ao worker, com retries e rate control.
- **Lotes longos:** Cloud Run Jobs.
- **Fan-out de eventos:** Pub/Sub.

## 6. Critérios verificáveis de portabilidade [N1]

- Regra de lint `no-restricted-imports` proibindo `@supabase/*` e SDKs de provedor fora de `adapters/` e `integrations/providers/` (em Vite, também `src/lib/supabase/` e `src/features/*/api.ts`; tipos podem ser importados com `import type`). Violação quebra o CI.
- Domínio e casos de uso testáveis sem Supabase (portas falsas).
- Nenhuma regra de negócio existe **apenas** dentro de Edge Function ou policy sem equivalente no caso de uso.
- A matriz de §2 está atualizada.

## 7. Serviços-alvo (referência)

| Serviço | Uso |
|---|---|
| Cloud Run | API e workers |
| Cloud Tasks | Jobs HTTP, retries, rate control |
| Pub/Sub | Eventos fan-out |
| Cloud SQL | Postgres, quando houver gatilho |
| Secret Manager · Cloud KMS | Segredos · criptografia em envelope |
| Cloud Storage | Objetos |
| Cloud Logging · Cloud Monitoring | Logs · métricas e alertas |
| Artifact Registry | Imagens |

Redis/Memorystore só com necessidade medida e ADR.

## 8. Ordem de migração [N3]

1. Fronteiras (§6) em dia.
2. Containerizar API e worker.
3. Mover compute para Cloud Run, mantendo Supabase como banco e auth.
4. Medir.
5. Migrar jobs e filas.
6. Migrar Storage, se necessário.
7. Migrar o Postgres somente com gatilho objetivo (custo, limite, compliance).
8. Migrar auth separadamente, se necessário.

Nunca mova frontend, API, banco, auth, storage e integrações numa única mudança. Cada etapa tem rollback e critério de sucesso medido.

## Particularidades deste projeto

<!-- Matriz de dependências preenchida (§2); gatilhos que justificariam migrar; decisões registradas em ADR. -->
