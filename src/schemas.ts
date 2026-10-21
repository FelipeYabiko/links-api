import { Type } from "@fastify/type-provider-typebox";

import { SLUG_PATTERN } from "./slug.js";

export const ErrorResponse = Type.Object({ error: Type.String() });

export const SlugParams = Type.Object({ slug: Type.String({ pattern: SLUG_PATTERN }) });

export const Link = Type.Object({
  slug: Type.String(),
  url: Type.String(),
  shortUrl: Type.String(),
  clicks: Type.Integer(),
  createdAt: Type.String(),
});
