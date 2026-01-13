import {describe, it} from '@augment-vir/test';
import {join} from 'node:path';
import {PrismaClient} from '../generated/client.js';
import {createPgliteAdapter} from '../index.js';

const mySchemaPath = join('packages', 'backend', 'prisma', 'schema.prisma');
const myMigrationsDirPath = join('packages', 'backend', 'prisma', 'migrations');

describe('my test', () => {
    it('connects to the database', async (testContext) => {
        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                schemaFilePath: mySchemaPath,
                migrationsDirPath: myMigrationsDirPath,
                dbParentDirPath: join('.dev', 'pglite'),
                dbDirName: testContext,
                /** It is recommended to always reset the database for tests. */
                resetDatabase: true,
            }),
        });
    });
});
