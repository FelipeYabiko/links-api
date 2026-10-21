import { type FastifyPluginAsyncTypebox, Type } from "@fastify/type-provider-typebox";

import { ErrorResponse, Link, SlugParams } from "../schemas.js";
import { SLUG_PATTERN, generateSlug, isReservedSlug } from "../slug.js";

interface LinkRow {
  id: number;
  slug: string;
  url: string;
  created_at: string;
  clicks: number;
}

const CreateLinkBody = Type.Object({
  url: Type.String({ format: "uri", pattern: "^https?://", maxLength: 2048 }),
  slug: Type.Optional(Type.String({ pattern: SLUG_PATTERN })),
});

const Stats = Type.Object({
  slug: Type.String(),
  url: Type.String(),
  totalClicks: Type.Integer(),
  clicksByDay: Type.Array(Type.Object({ day: Type.String(), clicks: Type.Integer() })),
  topReferrers: Type.Array(Type.Object({ referrer: Type.String(), clicks: Type.Integer() })),
});

const SELECT_LINKS = `
  SELECT l.id, l.slug, l.url, l.created_at, COUNT(c.id) AS clicks
  FROM links l LEFT JOIN clicks c ON c.link_id = l.id
`;

export const linkRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // Todas as rotas deste plugin exigem um JWT válido.
  app.addHook("onRequest", app.authenticate);

  const toLink = (row: LinkRow) => ({
    slug: row.slug,
    url: row.url,
    shortUrl: `${app.config.baseUrl}/${row.slug}`,
    clicks: row.clicks,
    createdAt: row.created_at,
  });

  const findOwnLink = (slug: string, userId: number) =>
    app.db.prepare(`${SELECT_LINKS} WHERE l.slug = ? AND l.user_id = ? GROUP BY l.id`).get(slug, userId) as
      LinkRow | undefined;

  const security = [{ bearerAuth: [] }];

  app.post(
    "/",
    {
      schema: {
        tags: ["links"],
        summary: "Encurta uma URL",
        security,
        body: CreateLinkBody,
        response: { 201: Link, 400: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      const { url } = request.body;
      let slug = request.body.slug;
      if (slug && isReservedSlug(slug)) return reply.code(400).send({ error: `O slug "${slug}" é reservado.` });

      const insert = app.db.prepare("INSERT INTO links (slug, url, user_id) VALUES (?, ?, ?)");
      if (slug) {
        if (app.db.prepare("SELECT 1 FROM links WHERE slug = ?").get(slug)) {
          return reply.code(409).send({ error: `O slug "${slug}" já está em uso.` });
        }
        insert.run(slug, url, request.user.sub);
      } else {
        // Colisões são raras (56^7 combinações), mas tentamos de novo se acontecerem.
        for (let attempt = 0; ; attempt++) {
          slug = generateSlug();
          try {
            insert.run(slug, url, request.user.sub);
            break;
          } catch (error) {
            const isUniqueViolation = (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE";
            if (!isUniqueViolation || attempt >= 4) throw error;
          }
        }
      }
      return reply.code(201).send(toLink(findOwnLink(slug, request.user.sub)!));
    },
  );

  app.get(
    "/",
    {
      schema: {
        tags: ["links"],
        summary: "Lista os links do usuário",
        security,
        response: { 200: Type.Object({ links: Type.Array(Link) }) },
      },
    },
    async (request) => {
      const rows = app.db
        .prepare(`${SELECT_LINKS} WHERE l.user_id = ? GROUP BY l.id ORDER BY l.created_at DESC, l.id DESC`)
        .all(request.user.sub) as LinkRow[];
      return { links: rows.map(toLink) };
    },
  );

  app.get(
    "/:slug/stats",
    {
      schema: {
        tags: ["links"],
        summary: "Estatísticas de cliques de um link",
        security,
        params: SlugParams,
        response: { 200: Stats, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const link = findOwnLink(request.params.slug, request.user.sub);
      if (!link) return reply.code(404).send({ error: "Link não encontrado." });

      const clicksByDay = app.db
        .prepare(
          `SELECT substr(clicked_at, 1, 10) AS day, COUNT(*) AS clicks
           FROM clicks WHERE link_id = ? GROUP BY day ORDER BY day`,
        )
        .all(link.id) as { day: string; clicks: number }[];
      const topReferrers = app.db
        .prepare(
          `SELECT COALESCE(referrer, 'direto') AS referrer, COUNT(*) AS clicks
           FROM clicks WHERE link_id = ? GROUP BY 1 ORDER BY clicks DESC LIMIT 5`,
        )
        .all(link.id) as { referrer: string; clicks: number }[];

      return { slug: link.slug, url: link.url, totalClicks: link.clicks, clicksByDay, topReferrers };
    },
  );

  app.delete(
    "/:slug",
    {
      schema: {
        tags: ["links"],
        summary: "Apaga um link e seus cliques",
        security,
        params: SlugParams,
        response: { 204: Type.Null(), 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const result = app.db
        .prepare("DELETE FROM links WHERE slug = ? AND user_id = ?")
        .run(request.params.slug, request.user.sub);
      if (result.changes === 0) return reply.code(404).send({ error: "Link não encontrado." });
      return reply.code(204).send(null);
    },
  );
};
