import {describe, it} from '@augment-vir/test';
import {join} from 'node:path';
import {PrismaClient} from '../generated/client.js';
import {createPgliteAdapter} from '../index.js';

const myPrismaConfigPath = join('packages', 'backend', 'prisma.config.ts');

describe('my test', () => {
    it('connects to the database', async (testContext) => {
        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                prismaConfigPath: myPrismaConfigPath,
                dbParentDirPath: join('.dev', 'pglite'),
                dbDirName: testContext,
                /** It is recommended to always reset the database for tests. */
                resetDatabase: true,
            }),
        });
    });
});
