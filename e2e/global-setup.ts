import { execFileSync } from "node:child_process";

export default async function globalSetup() {
  execFileSync("npm", ["run", "demo:reset"], { stdio: "inherit" });
}
