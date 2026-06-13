import {assert} from '@augment-vir/assert';
import {wrapString} from '@augment-vir/common';
import {interpolationSafeWindowsPath, runShellCommand} from '@augment-vir/node';
import {describe, extractTestNameAsDir, it} from '@augment-vir/test';
import {PGlite} from '@electric-sql/pglite';
import {existsSync} from 'node:fs';
import {mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
    mockPrismaConfig,
    mockPrismaSchema,
    notCommittedDirPath,
    repoDirPath,
} from '../util/file-paths.mock.js';
import {setupPrisma} from '../util/setup-prisma.mock.js';
import {createPgliteAdapter} from './pglite-adapter.js';
import {verifyPrismaClient} from './pglite-adapter.mock.js';
import {PrismaPGliteAdapterFactory} from './prisma-pglite-adapter/pglite.js';

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

describe('creating migrations through the driver adapter', () => {
    /**
     * Drives Prisma's native `migrate dev` directly through this package's PGlite driver adapter,
     * bypassing the snapshot-based migration flow entirely. Prisma v7's CLI does not yet run
     * `migrate dev` through a driver adapter (it still requires a `datasource.url` and never
     * invokes the adapter for migrations), so this currently fails. The test documents the target
     * behavior so we can verify it once that is supported.
     */
    it('creates and applies a migration without snapshots', async (testContext) => {
        const PrismaClient = await setupPrisma();

        const testDirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        const databaseDirPath = join(testDirPath, 'pglite');
        const migrationsDirPath = join(testDirPath, 'migrations');
        const prismaConfigPath = join(testDirPath, 'prisma.config.ts');
        const adapterModulePath = join(
            repoDirPath,
            'src',
            'adapter',
            'prisma-pglite-adapter',
            'pglite.js',
        );

        await rm(testDirPath, {
            recursive: true,
            force: true,
        });
        await mkdir(testDirPath, {
            recursive: true,
        });

        /**
         * A Prisma config that points `migrate dev` at the PGlite database through this package's
         * driver adapter. Note the absence of a `datasource.url`: the adapter is meant to be the
         * connection.
         */
        await writeFile(
            prismaConfigPath,
            [
                "import {PGlite} from '@electric-sql/pglite';",
                "import {defineConfig} from 'prisma/config';",
                `import {PrismaPGliteAdapterFactory} from ${JSON.stringify(adapterModulePath)};`,
                '',
                'export default defineConfig({',
                `    schema: ${JSON.stringify(mockPrismaSchema)},`,
                `    migrations: {path: ${JSON.stringify(migrationsDirPath)}},`,
                `    adapter: async () => new PrismaPGliteAdapterFactory(new PGlite(${JSON.stringify(databaseDirPath)})),`,
                '});',
                '',
            ].join('\n'),
        );

        const migrateResult = await runShellCommand(
            [
                'prisma',
                'migrate',
                'dev',
                '--name',
                'init',
                '--config',
                wrapString({
                    value: interpolationSafeWindowsPath(prismaConfigPath),
                    wrapper: "'",
                }),
            ].join(' '),
            {
                hookUpToConsole: false,
                rejectOnError: false,
            },
        );

        const newMigrationDir = (
            existsSync(migrationsDirPath)
                ? await readdir(migrationsDirPath, {
                      withFileTypes: true,
                  })
                : []
        ).find((entry) => entry.isDirectory());

        assert.isDefined(
            newMigrationDir,
            `migrate dev did not create a migration:\n${migrateResult.stderr}`,
        );
        assert.isNotEmpty(
            String(await readFile(join(migrationsDirPath, newMigrationDir.name, 'migration.sql'))),
        );

        process.exitCode = undefined;

        /** The schema should have been applied to the PGlite database through the adapter. */
        const prismaClient = new PrismaClient({
            adapter: new PrismaPGliteAdapterFactory(new PGlite(databaseDirPath)),
        });
        assert.strictEquals(await prismaClient.user.count(), 0);
        await prismaClient.$disconnect();
        process.exitCode = undefined;
    });
});
