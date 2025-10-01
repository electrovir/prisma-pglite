import {assert} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {existsSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {mockPrismaSchema, notCommittedDirPath} from '../util/file-paths.mock.js';
import {setupPrisma} from '../util/setup-prisma.mock.js';
import {createPgliteAdapter} from './pglite-adapter.js';
import {verifyPrismaClient} from './pglite-adapter.mock.js';

describe(createPgliteAdapter.name, () => {
    it('creates a functioning adapter', async (testContext) => {
        const PrismaClient = await setupPrisma();

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                test: testContext,
                schemaFilePath: mockPrismaSchema,
            }),
        });

        await verifyPrismaClient(prismaClient);
    });
    it('creates a functioning adapter with a test name', async (testContext) => {
        const PrismaClient = await setupPrisma();

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                test: 'my name',
                schemaFilePath: mockPrismaSchema,
            }),
        });

        await verifyPrismaClient(prismaClient);
    });
    it('will reset a custom pglite dir with default dev', async () => {
        const PrismaClient = await setupPrisma();
        const customDbParentDirPath = join(notCommittedDirPath, 'tests', 'custom-pglite');
        await rm(customDbParentDirPath, {recursive: true, force: true});

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                /** Leave this empty to use the default `dev` database. */
                // testContext,
                schemaFilePath: mockPrismaSchema,
                dbParentDirPath: customDbParentDirPath,
            }),
        });
        assert.isTrue(existsSync(join(customDbParentDirPath, 'dev')));

        await verifyPrismaClient(prismaClient);
        await prismaClient.$disconnect();
        const prismaClient2 = new PrismaClient({
            adapter: await createPgliteAdapter({
                /** Leave this empty to use the default `dev` database. */
                // testContext,
                schemaFilePath: mockPrismaSchema,
                dbParentDirPath: customDbParentDirPath,
                resetDatabase: true,
            }),
        });
        assert.isTrue(existsSync(join(customDbParentDirPath, 'dev')));
        assert.isEmpty(await prismaClient2.user.findMany());
    });
    it('reads the default schema path', async (testContext) => {
        const PrismaClient = await setupPrisma();

        /** This fails because we don't have a schema path in the default location. */
        await assert.throws(
            async () => {
                const prismaClient = new PrismaClient({
                    adapter: await createPgliteAdapter({
                        test: testContext,
                    }),
                });
            },
            {
                matchMessage: 'Failed to initialize PGlite Prisma adapter',
            },
        );
    });
});
