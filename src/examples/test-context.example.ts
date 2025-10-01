import {describe, it} from '@augment-vir/test';
import {join} from 'node:path';
import {PrismaClient} from '../generated/client.js';
import {createPgliteAdapter} from '../index.js';

const mySchemaPath = join('packages', 'backend', 'prisma', 'schema.prisma');

describe('my test', () => {
    it('connects to the database', async (testContext) => {
        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                schemaFilePath: mySchemaPath,
                dbParentDirPath: join('.dev', 'pglite'),
                test: testContext,
            }),
        });
    });
});
