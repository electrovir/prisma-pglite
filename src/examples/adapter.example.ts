import {join} from 'node:path';
import {PrismaClient} from '../generated/client.js';
import {createPgliteAdapter} from '../index.js';

const myPrismaConfigPath = join('packages', 'backend', 'prisma.config.ts');

const prismaClient = new PrismaClient({
    adapter: await createPgliteAdapter({
        prismaConfigPath: myPrismaConfigPath,
    }),
});
