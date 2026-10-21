import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type App, buildApp } from "../src/app.js";

let app: App;

beforeEach(async () => {
  // Banco em memória: cada teste começa do zero e nada é gravado em disco.
  app = await buildApp({
    databasePath: ":memory:",
    jwtSecret: "segredo-de-teste-com-mais-de-32-caracteres",
    baseUrl: "https://sho.rt",
    rateLimitMax: 1000,
  });
});

afterEach(async () => {
  await app.close();
});

async function login(email = "ana@example.com", password = "senha-forte-123"): Promise<string> {
  await app.inject({ method: "POST", url: "/auth/register", payload: { email, password } });
  const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  return response.json().token;
}

async function createLink(token: string, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/links", headers: { authorization: `Bearer ${token}` }, payload });
}

describe("auth", () => {
  it("cadastra e faz login", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "Ana@Example.com", password: "senha-forte-123" },
    });
    expect(register.statusCode).toBe(201);
    expect(register.json()).toMatchObject({ email: "ana@example.com" });

    const token = await login();
    expect(token.split(".")).toHaveLength(3);
  });

  it("recusa e-mail duplicado", async () => {
    await login();
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "ana@example.com", password: "outra-senha-123" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("recusa senha errada com a mesma mensagem de e-mail inexistente", async () => {
    await login();
    const wrongPassword = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "ana@example.com", password: "senha-errada-123" },
    });
    const unknownEmail = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "ninguem@example.com", password: "senha-forte-123" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });

  it("valida o corpo da requisição", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "nao-e-email", password: "curta" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("links", () => {
  it("exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/links" });
    expect(response.statusCode).toBe(401);
  });

  it("cria link com slug gerado", async () => {
    const token = await login();
    const response = await createLink(token, { url: "https://github.com/FelipeYabiko" });

    expect(response.statusCode).toBe(201);
    const link = response.json();
    expect(link.slug).toMatch(/^[a-zA-Z0-9]{7}$/);
    expect(link.shortUrl).toBe(`https://sho.rt/${link.slug}`);
    expect(link.clicks).toBe(0);
  });

  it("aceita slug personalizado e recusa repetido ou reservado", async () => {
    const token = await login();
    expect((await createLink(token, { url: "https://a.com", slug: "meu-link" })).statusCode).toBe(201);
    expect((await createLink(token, { url: "https://b.com", slug: "meu-link" })).statusCode).toBe(409);
    expect((await createLink(token, { url: "https://b.com", slug: "docs" })).statusCode).toBe(400);
  });

  it("recusa URLs que não são http(s)", async () => {
    const token = await login();
    const response = await createLink(token, { url: "javascript:alert(1)" });
    expect(response.statusCode).toBe(400);
  });

  it("isola os links de cada usuário", async () => {
    const ana = await login("ana@example.com");
    const bruno = await login("bruno@example.com");
    await createLink(ana, { url: "https://a.com", slug: "da-ana" });

    const list = await app.inject({ method: "GET", url: "/links", headers: { authorization: `Bearer ${bruno}` } });
    expect(list.json().links).toEqual([]);

    const remove = await app.inject({
      method: "DELETE",
      url: "/links/da-ana",
      headers: { authorization: `Bearer ${bruno}` },
    });
    expect(remove.statusCode).toBe(404);
  });

  it("apaga um link", async () => {
    const token = await login();
    await createLink(token, { url: "https://a.com", slug: "temporario" });
    const headers = { authorization: `Bearer ${token}` };

    expect((await app.inject({ method: "DELETE", url: "/links/temporario", headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/temporario" })).statusCode).toBe(404);
  });
});

describe("redirect e estatísticas", () => {
  it("redireciona e conta cliques por dia e origem", async () => {
    const token = await login();
    await createLink(token, { url: "https://example.com/artigo", slug: "artigo" });

    const redirect = await app.inject({ method: "GET", url: "/artigo", headers: { referer: "https://linkedin.com" } });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe("https://example.com/artigo");
    await app.inject({ method: "GET", url: "/artigo" });

    const stats = await app.inject({
      method: "GET",
      url: "/links/artigo/stats",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = stats.json();
    expect(body.totalClicks).toBe(2);
    expect(body.clicksByDay).toHaveLength(1);
    expect(body.topReferrers).toEqual(
      expect.arrayContaining([
        { referrer: "https://linkedin.com", clicks: 1 },
        { referrer: "direto", clicks: 1 },
      ]),
    );
  });

  it("retorna 404 para slug inexistente", async () => {
    const response = await app.inject({ method: "GET", url: "/nao-existe" });
    expect(response.statusCode).toBe(404);
  });
});

describe("infra", () => {
  it("expõe health check e documentação OpenAPI", async () => {
    expect((await app.inject({ method: "GET", url: "/health" })).json()).toEqual({ status: "ok" });
    const spec = await app.inject({ method: "GET", url: "/docs/json" });
    expect(spec.json().paths).toHaveProperty("/links/");
  });
});
