import {runPrisma} from '../index.js';

await runPrisma(['migrate dev']);
await runPrisma(['generate']);
