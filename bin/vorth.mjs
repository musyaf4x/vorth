#!/usr/bin/env node
import { runCli } from "../lib/vorth.mjs";

await runCli(process.argv.slice(2));
