import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./config.js";

const app = createApp();

app.listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
});
