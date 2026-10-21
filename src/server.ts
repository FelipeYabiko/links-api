import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  console.error("Defina JWT_SECRET com pelo menos 32 caracteres.");
  process.exit(1);
}

const app = await buildApp({
  databasePath: process.env.DATABASE_PATH ?? "links.db",
  jwtSecret,
  baseUrl: process.env.BASE_URL ?? `http://localhost:${port}`,
  logger: true,
});

// Encerra com elegância: termina as requisições em andamento e fecha o banco.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ port, host: "0.0.0.0" });
