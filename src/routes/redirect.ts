import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { ErrorResponse, SlugParams } from "../schemas.js";

export const redirectRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const findLink = app.db.prepare("SELECT id, url FROM links WHERE slug = ?");
  const recordClick = app.db.prepare("INSERT INTO clicks (link_id, referrer, user_agent) VALUES (?, ?, ?)");

  app.get(
    "/:slug",
    {
      schema: {
        tags: ["redirect"],
        summary: "Redireciona para a URL original e registra o clique",
        params: SlugParams,
        response: { 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const link = findLink.get(request.params.slug) as { id: number; url: string } | undefined;
      if (!link) return reply.code(404).send({ error: "Link não encontrado." });

      recordClick.run(link.id, request.headers.referer ?? null, request.headers["user-agent"] ?? null);
      // 302 (temporário) para o navegador não cachear e todo clique passar por aqui.
      return reply.redirect(link.url, 302);
    },
  );
};
