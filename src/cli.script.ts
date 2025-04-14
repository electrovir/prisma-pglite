import {parseRawArgs, runPrisma} from './migrations/prisma-cli.js';

await runPrisma(parseRawArgs(import.meta, process.argv));
