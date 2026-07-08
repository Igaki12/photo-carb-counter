import { mkdir, writeFile } from "node:fs/promises";

await mkdir("docs", { recursive: true });
await writeFile("docs/.nojekyll", "");
