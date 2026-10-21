import { type FastifyPluginAsyncTypebox, Type } from "@fastify/type-provider-typebox";

import { hashPassword, verifyPassword } from "../password.js";
import { ErrorResponse } from "../schemas.js";

const Credentials = Type.Object({
  email: Type.String({ format: "email", maxLength: 254 }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
});

// Limite mais apertado nas rotas de login para dificultar ataques de força bruta.
const strictRateLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/register",
    {
      config: strictRateLimit,
      schema: {
        tags: ["auth"],
        summary: "Cria uma conta",
        body: Credentials,
        response: { 201: Type.Object({ id: Type.Integer(), email: Type.String() }), 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      const email = request.body.email.toLowerCase();
      const existing = app.db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
      if (existing) return reply.code(409).send({ error: "E-mail já cadastrado." });

      const passwordHash = await hashPassword(request.body.password);
      const result = app.db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, passwordHash);
      return reply.code(201).send({ id: Number(result.lastInsertRowid), email });
    },
  );

  app.post(
    "/login",
    {
      config: strictRateLimit,
      schema: {
        tags: ["auth"],
        summary: "Troca e-mail e senha por um token JWT",
        body: Credentials,
        response: { 200: Type.Object({ token: Type.String() }), 401: ErrorResponse },
      },
    },
    async (request, reply) => {
      const email = request.body.email.toLowerCase();
      const user = app.db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as
        { id: number; password_hash: string } | undefined;
      // Mesma mensagem para e-mail inexistente e senha errada, para não revelar quem tem conta.
      if (!user || !(await verifyPassword(request.body.password, user.password_hash))) {
        return reply.code(401).send({ error: "E-mail ou senha inválidos." });
      }
      return { token: app.jwt.sign({ sub: user.id, email }) };
    },
  );
};
