import { connect, runMigrations } from "./client.js";
import { migrationsFolder } from "./index.js";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const handle = connect(url, { max: 1 });
try {
  await runMigrations(handle.db, migrationsFolder);
  console.log("migrations applied");
} finally {
  await handle.close();
}
