#!/usr/bin/env node
import { startServer } from './server.js';

startServer().catch((err: unknown) => {
  process.stderr.write(`dkg-claude-code-memory: fatal error: ${String(err)}\n`);
  process.exit(1);
});
