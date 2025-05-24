import {assert} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {existsSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {mockPrismaSchema, notCommittedDirPath} from '../util/file-paths.mock.js';
import {setupPrisma} from '../util/setup-prisma.mock.js';
import {createPgliteAdapter, getDbDirNameFromTestContext} from './pglite-adapter.js';
import {verifyPrismaClient} from './pglite-adapter.mock.js';

describe(createPgliteAdapter.name, () => {
    it('creates a functioning adapter', async (testContext) => {
        const PrismaClient = await setupPrisma();

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                testContext,
                schemaFilePath: mockPrismaSchema,
            }),
        });

        await verifyPrismaClient(prismaClient);
    });
    it('will reset a custom pglite dir with default dev', async () => {
        const PrismaClient = await setupPrisma();
        const customPgliteDirPath = join(notCommittedDirPath, 'tests', 'custom-pglite');
        await rm(customPgliteDirPath, {recursive: true, force: true});

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                /** Leave this empty to use the default `dev` database. */
                // testContext,
                schemaFilePath: mockPrismaSchema,
                pgliteDirPath: customPgliteDirPath,
            }),
        });
        assert.isTrue(existsSync(join(customPgliteDirPath, 'dev')));

        await verifyPrismaClient(prismaClient);
        await prismaClient.$disconnect();
        const prismaClient2 = new PrismaClient({
            adapter: await createPgliteAdapter({
                /** Leave this empty to use the default `dev` database. */
                // testContext,
                schemaFilePath: mockPrismaSchema,
                pgliteDirPath: customPgliteDirPath,
                resetDatabase: true,
            }),
        });
        assert.isTrue(existsSync(join(customPgliteDirPath, 'dev')));
        assert.isEmpty(await prismaClient2.user.findMany());
    });
    it('reads the default schema path', async (testContext) => {
        const PrismaClient = await setupPrisma();

        /** This fails because we don't have a schema path in the default location. */
        await assert.throws(
            async () => {
                const prismaClient = new PrismaClient({
                    adapter: await createPgliteAdapter({
                        testContext,
                    }),
                });
            },
            {
                matchMessage: 'Failed to initialize PGlite Prisma adapter',
            },
        );
    });
});

describe(getDbDirNameFromTestContext.name, () => {
    it('fixes a test name', (testContext) => {
        assert.strictEquals(
            getDbDirNameFromTestContext(testContext),
            'getDbDirNameFromTestContext_fixes_a_test_name',
        );
    });
    it('passes undefined', () => {
        assert.isUndefined(getDbDirNameFromTestContext(undefined));
    });
});
