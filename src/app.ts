import fastifyJwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { type DB, openDatabase } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { linkRoutes } from "./routes/links.js";
import { redirectRoutes } from "./routes/redirect.js";

export interface AppConfig {
  databasePath: string;
  jwtSecret: string;
  baseUrl: string;
  rateLimitMax?: number;
  logger?: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    db: DB;
    config: AppConfig;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: number; email: string };
    user: { sub: number; email: string };
  }
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.logger ?? false }).withTypeProvider<TypeBoxTypeProvider>();

  const db = openDatabase(config.databasePath);
  app.decorate("db", db);
  app.decorate("config", config);
  app.addHook("onClose", async () => db.close());

  await app.register(rateLimit, { max: config.rateLimitMax ?? 100, timeWindow: "1 minute" });
  await app.register(fastifyJwt, { secret: config.jwtSecret, sign: { expiresIn: "1h" } });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ error: "Token ausente ou inválido." });
    }
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "Links API", description: "Encurtador de URLs com estatísticas de cliques.", version: "1.0.0" },
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", { schema: { hide: true } }, async () => ({ status: "ok" }));
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(linkRoutes, { prefix: "/links" });
  // Por último, porque GET /:slug captura qualquer caminho de um nível.
  await app.register(redirectRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
