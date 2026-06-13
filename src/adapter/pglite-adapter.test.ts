import {assert} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {existsSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {mockPrismaConfig, notCommittedDirPath} from '../util/file-paths.mock.js';
import {setupPrisma} from '../util/setup-prisma.mock.js';
import {createPgliteAdapter} from './pglite-adapter.js';
import {verifyPrismaClient} from './pglite-adapter.mock.js';

describe(createPgliteAdapter.name, () => {
    it('creates a functioning adapter', async (testContext) => {
        const PrismaClient = await setupPrisma();

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                dbDirName: testContext,
                resetDatabase: true,
                prismaConfigPath: mockPrismaConfig,
            }),
        });

        await verifyPrismaClient(prismaClient);
    });
    it('creates a functioning adapter with a string dbDirName', async () => {
        const PrismaClient = await setupPrisma();

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                dbDirName: 'my name',
                resetDatabase: true,
                prismaConfigPath: mockPrismaConfig,
            }),
        });

        await verifyPrismaClient(prismaClient);
    });
    it('supports databaseName', async (testContext) => {
        const PrismaClient = await setupPrisma();

        const adapter = await createPgliteAdapter({
            dbDirName: testContext,
            resetDatabase: true,
            prismaConfigPath: mockPrismaConfig,
            databaseName: 'db1',
        });

        const prismaClient = new PrismaClient({
            adapter,
        });

        assert.strictEquals(
            adapter.databaseDirPath,
            join(
                notCommittedDirPath,
                'pglite',
                'create_pglite_adapter_supports_database_name',
                'db1',
            ),
        );

        assert.isTrue(existsSync(adapter.databaseDirPath));

        await verifyPrismaClient(prismaClient);
    });
    it('will reset a custom pglite dir with default dev', async () => {
        const PrismaClient = await setupPrisma();
        const customDbParentDirPath = join(notCommittedDirPath, 'tests', 'custom-pglite');
        await rm(customDbParentDirPath, {
            recursive: true,
            force: true,
        });

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                /** Leave this empty to use the default `dev` database. */
                // testContext,
                prismaConfigPath: mockPrismaConfig,
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
                prismaConfigPath: mockPrismaConfig,
                dbParentDirPath: customDbParentDirPath,
                resetDatabase: true,
            }),
        });
        assert.isTrue(existsSync(join(customDbParentDirPath, 'dev')));
        assert.isEmpty(await prismaClient2.user.findMany());
    });
    it('reads the default config path', async (testContext) => {
        const PrismaClient = await setupPrisma();

        /** This fails because we don't have a Prisma config in the default location. */
        await assert.throws(
            async () => {
                const prismaClient = new PrismaClient({
                    adapter: await createPgliteAdapter({
                        dbDirName: testContext,
                        resetDatabase: true,
                    }),
                });
            },
            {
                matchMessage: 'Failed to initialize PGlite Prisma adapter',
            },
        );
    });
});
