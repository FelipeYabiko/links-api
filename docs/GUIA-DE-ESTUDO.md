# Guia de estudo

Conceitos usados neste projeto, na ordem sugerida de estudo. Para cada um: o que é, onde aparece no código, um exercício
e onde aprender mais. Depois de cada exercício, rode `npm test` para ver se nada quebrou.

## Parte 1: HTTP e APIs REST

### 1. HTTP: métodos, status e cabeçalhos

Uma API REST expõe **recursos** (aqui, `links`) por URLs e usa os **métodos** HTTP para dizer a ação: `GET` lê, `POST`
cria e `DELETE` apaga. O **status** diz o resultado:

| Status                | Significado                 | Onde aparece                         |
| --------------------- | --------------------------- | ------------------------------------ |
| `200` / `201` / `204` | OK, criado, sem conteúdo    | listagem, criação, exclusão          |
| `302`                 | Redirecionamento temporário | `GET /:slug`                         |
| `400`                 | Entrada inválida            | validação de schema                  |
| `401`                 | Não autenticado             | token ausente ou inválido            |
| `404`                 | Não encontrado              | link inexistente ou de outro usuário |
| `409`                 | Conflito                    | e-mail ou slug já usado              |
| `429`                 | Muitas requisições          | rate limit                           |

- **No código:** os `reply.code(...)` em [`src/routes`](../src/routes).
- **Para pensar:** por que um link de outro usuário devolve `404`, e não `403`?
- **Leia:** [MDN: HTTP status codes](https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status).

### 2. Fastify: rotas, plugins e hooks

Fastify é um framework web para Node.js. Tudo é **plugin**: cada arquivo de rotas é uma função registrada com um
prefixo (`/auth`, `/links`). **Hooks** rodam em etapas do ciclo da requisição; `onRequest` com `app.authenticate`
protege todas as rotas de links de uma vez. **Decorators** (`app.decorate`) penduram dependências na instância, como o
banco (`app.db`).

- **No código:** [`app.ts`](../src/app.ts) e o `addHook` em [`links.ts`](../src/routes/links.ts).
- **Exercício:** crie uma rota `GET /me` que devolve o e-mail do usuário logado.
- **Leia:** [Fastify: Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/).

### 3. Validação com JSON Schema e TypeBox

Cada rota declara o formato do `body`, dos `params` e da resposta. O Fastify rejeita entradas inválidas com `400` antes
do seu código rodar, e o schema de resposta filtra campos que não deveriam sair (como `password_hash`). Com TypeBox, o
mesmo schema gera o tipo TypeScript, então validação e tipos nunca ficam dessincronizados.

- **No código:** `Credentials` em `auth.ts`; `CreateLinkBody` e `Stats` em `links.ts`.
- **Exercício:** adicione um campo opcional `expiresAt` (data) em `POST /links`.
- **Leia:** [TypeBox](https://github.com/sinclairzx81/typebox) e
  [Fastify: Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/).

### 4. Documentação OpenAPI

OpenAPI é um padrão para descrever APIs. O `@fastify/swagger` gera a especificação a partir dos schemas das rotas, e o
Swagger UI vira uma página interativa em `/docs`, onde dá para testar cada endpoint.

- **Exercício:** abra `/docs`, clique em "Authorize", cole o token e crie um link pela página.
- **Leia:** [OpenAPI: introdução](https://learn.openapis.org/).

## Parte 2: Segurança

### 5. Hash de senha com scrypt

Senhas nunca são guardadas como texto. Um **hash** é uma transformação de mão única; o **salt** aleatório faz duas
senhas iguais virarem hashes diferentes. `scrypt` é lento de propósito, o que torna caro testar milhões de senhas.
`timingSafeEqual` compara em tempo constante para não vazar informação pelo tempo de resposta.

- **No código:** [`password.ts`](../src/password.ts).
- **Exercício:** hoje o login responde mais rápido quando o e-mail não existe, porque não calcula o hash. Corrija isso
  verificando contra um hash fixo nesse caso.
- **Leia:** [OWASP: Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

### 6. Autenticação com JWT

Um **JWT** é um token assinado com três partes (`cabeçalho.dados.assinatura`) em Base64. O servidor assina com
`JWT_SECRET`; quem não tem o segredo não consegue forjar um token. Ele é **stateless**: o servidor não guarda sessões.
O cliente manda o token no cabeçalho `Authorization: Bearer <token>`.

- **No código:** `fastifyJwt` e `authenticate` em `app.ts`; `app.jwt.sign` em `auth.ts`.
- **Exercício:** cole um token em [jwt.io](https://jwt.io) e veja o `sub` e o `exp`. Por que não se deve colocar
  dados sensíveis no token?
- **Para pensar:** como "deslogar" alguém se o servidor não guarda sessões? Pesquise sobre refresh tokens.

### 7. Rate limiting, autorização e validação de URL

**Rate limiting** limita requisições por IP para conter abuso e força bruta. **Autorização** é diferente de
autenticação: saber quem você é não basta, toda consulta filtra por `user_id`. Aceitar só `http(s)://` impede que o
encurtador redirecione para `javascript:`.

- **No código:** `rateLimit` em `app.ts`; `strictRateLimit` em `auth.ts`; `WHERE ... user_id = ?` em `links.ts`.
- **Leia:** [OWASP API Security Top 10](https://owasp.org/API-Security/).

## Parte 3: Banco de dados

### 8. SQL, relacionamentos e índices

São três tabelas ligadas por **chaves estrangeiras** (`links.user_id → users.id`, `clicks.link_id → links.id`).
`ON DELETE CASCADE` apaga os cliques junto com o link. **Índices** aceleram as buscas mais comuns. As estatísticas usam
`JOIN`, `GROUP BY` e `COUNT`.

- **No código:** `MIGRATIONS` em [`db.ts`](../src/db.ts); consultas em `links.ts`.
- **Exercício:** adicione às estatísticas um ranking de navegadores a partir de `user_agent`.
- **Leia:** [SQLite: tutorial](https://www.sqlitetutorial.net/).

### 9. Migrações e prepared statements

**Migrações** versionam o esquema do banco: cada mudança é um passo novo, aplicado uma única vez (a versão fica em
`PRAGMA user_version`) e dentro de uma **transação**. **Prepared statements** com `?` separam o SQL dos dados, o que
impede **SQL injection**.

- **Exercício:** crie a migração 2 adicionando `expires_at` à tabela `links` (sem editar a migração 1).
- **Para pensar:** o que aconteceria se a busca fosse montada com `` `... WHERE slug = '${slug}'` ``?

## Parte 4: TypeScript e qualidade

### 10. TypeScript estrito e ES Modules

`strict` e `noUncheckedIndexedAccess` obrigam a tratar `undefined`. **Module augmentation** (`declare module "fastify"`)
ensina ao TypeScript que `app.db` e `request.user` existem. O projeto usa **ES Modules** (`"type": "module"`), por isso
os imports terminam em `.js` mesmo nos arquivos `.ts`.

- **No código:** [`tsconfig.json`](../tsconfig.json) e os `declare module` em `app.ts`.
- **Leia:** [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html).

### 11. Testes de integração

Os testes sobem a aplicação inteira com banco `:memory:` e fazem requisições com `app.inject`, sem abrir porta de rede.
Cada teste começa do zero (`beforeEach`), então a ordem não importa.

- **No código:** [`test/app.test.ts`](../test/app.test.ts).
- **Exercício:** escreva um teste que confirma que o login devolve `429` depois de 10 tentativas.
- **Leia:** [Vitest](https://vitest.dev/guide/) e [Fastify: Testing](https://fastify.dev/docs/latest/Guides/Testing/).

### 12. ESLint, Prettier e CI

ESLint aponta problemas no código; Prettier padroniza a formatação. O GitHub Actions roda lint, formatação, tipos e
testes em Node 22 e 24, e confere se a imagem Docker compila.

- **No código:** [`eslint.config.js`](../eslint.config.js) e [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Parte 5: Deploy

### 13. Docker e Docker Compose

O `Dockerfile` tem **duas etapas**: a primeira instala tudo e compila; a segunda copia só o necessário, o que deixa a
imagem menor e sem ferramentas de desenvolvimento. O processo roda como usuário `node` (não root), e o banco fica num
**volume** para sobreviver a recriações do container. O Compose descreve o serviço, as portas e as variáveis.

- **No código:** [`Dockerfile`](../Dockerfile) e [`docker-compose.yml`](../docker-compose.yml).
- **Exercício:** rode `docker compose up --build`, crie um link, rode `docker compose down` e suba de novo. O link
  continua lá? Por quê?
- **Leia:** [Docker: Get started](https://docs.docker.com/get-started/).

### 14. Configuração por ambiente e graceful shutdown

Segredos e configurações vêm de **variáveis de ambiente**, nunca do código ([The Twelve-Factor App](https://12factor.net/pt_br/config)).
Ao receber `SIGTERM` (como o Docker faz ao parar), o servidor termina as requisições em andamento e fecha o banco antes
de sair.

- **No código:** [`server.ts`](../src/server.ts).

## Próximos passos

- **PostgreSQL:** trocar o SQLite por Postgres para rodar várias instâncias da API.
- **Cache com Redis:** guardar os redirecionamentos mais acessados em memória.
- **Expiração de links** e **QR codes** para cada link.
- **Deploy** em Fly.io, Railway ou Render usando a imagem Docker.
