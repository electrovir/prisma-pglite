import {assert} from '@augment-vir/assert';
import {wrapString} from '@augment-vir/common';
import {interpolationSafeWindowsPath, runShellCommand} from '@augment-vir/node';
import {describe, extractTestNameAsDir, it} from '@augment-vir/test';
import {existsSync} from 'node:fs';
import {mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {createPgliteAdapter} from './adapter/pglite-adapter.js';
import {verifyPrismaClient} from './adapter/pglite-adapter.mock.js';
import {
    defaultSnapshotFileName,
    migrationLockFileContents,
    migrationLockFileName,
} from './migrations/migrate-dev.js';
import {mockPrismaConfig, notCommittedDirPath} from './util/file-paths.mock.js';
import {writeMockPrismaConfig} from './util/mock-prisma-config.mock.js';
import {setupPrisma} from './util/setup-prisma.mock.js';

async function runCli(args: ReadonlyArray<string>, options?: {hookUpToConsole?: boolean}) {
    const fullCommand = [
        'tsx',
        join(import.meta.dirname, 'cli.script.ts'),
        ...args,
    ].join(' ');

    return await runShellCommand(fullCommand, {
        hookUpToConsole: options?.hookUpToConsole ?? true,
    });
}

describe('cli', () => {
    it('passes normal commands directly to prisma', async () => {
        const {stdout} = await runCli(['--version']);

        assert.hasValues(stdout, [
            'prisma',
            '@prisma/client',
            'Schema Engine',
        ]);
    });
    it('generates a migration', async (testContext) => {
        const testDirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        const migrationsDirPath = join(testDirPath, 'migrations');

        await rm(testDirPath, {
            recursive: true,
            force: true,
        });
        assert.isFalse(existsSync(migrationsDirPath));

        const prismaConfigPath = await writeMockPrismaConfig({
            dirPath: testDirPath,
            migrationsDirPath,
        });

        await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
            '--config',
            interpolationSafeWindowsPath(prismaConfigPath),
        ]);

        assert.isTrue(existsSync(migrationsDirPath));
        assert.strictEquals(
            String(await readFile(join(migrationsDirPath, migrationLockFileName))),
            migrationLockFileContents,
        );

        const migrationDirChildrenNames = await readdir(migrationsDirPath, {
            withFileTypes: true,
        });

        assert.isLengthExactly(migrationDirChildrenNames, 2);

        const newMigrationDirName = migrationDirChildrenNames.find((file) => {
            return file.isDirectory();
        })?.name;

        assert.isDefined(newMigrationDirName);
        assert.hasValue(newMigrationDirName, 'my_migration');
        assert.isNotEmpty(
            String(await readFile(join(migrationsDirPath, newMigrationDirName, 'migration.sql'))),
        );
        assert.isNotEmpty(
            String(
                await readFile(
                    join(migrationsDirPath, newMigrationDirName, defaultSnapshotFileName),
                ),
            ),
        );
    });
    it('generates a migration with default paths', async () => {
        await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
        ]);
    });
    it('generates a migration with only a config path', async () => {
        await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
            '--config',
            interpolationSafeWindowsPath(mockPrismaConfig),
        ]);
    });
    it('fails when there are no changes', async () => {
        const output = await runCli(
            [
                'migrate',
                'dev',
                '--name',
                'my-migration',
                '--config',
                interpolationSafeWindowsPath(mockPrismaConfig),
            ],
            {
                hookUpToConsole: false,
            },
        );

        assert.hasValue(output.stdout, 'No changes detected');
    });
    it('accepts a CLI input migration name', async (testContext) => {
        const testDirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        const migrationsDirPath = join(testDirPath, 'migrations');

        await rm(testDirPath, {
            recursive: true,
            force: true,
        });
        const prismaConfigPath = await writeMockPrismaConfig({
            dirPath: testDirPath,
            migrationsDirPath,
        });

        const fullCommand = [
            'echo',
            'cli-input-name',
            '|',
            'tsx',
            join(import.meta.dirname, 'cli.script.ts'),
            'migrate',
            'dev',
            '--config',
            interpolationSafeWindowsPath(prismaConfigPath),
        ].join(' ');

        await runShellCommand(fullCommand, {
            hookUpToConsole: true,
            rejectOnError: true,
        });

        const migrationDirChildrenNames = await readdir(migrationsDirPath, {
            withFileTypes: true,
        });

        assert.isLengthExactly(migrationDirChildrenNames, 2);

        const newMigrationDirName = migrationDirChildrenNames.find((file) => {
            return file.isDirectory();
        })?.name;

        assert.isDefined(newMigrationDirName);
        assert.hasValue(newMigrationDirName, 'cli_input_name');
    });
    it('uses a custom snapshot file name', async (testContext) => {
        const testDirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        const migrationsDirPath = join(testDirPath, 'migrations');

        await rm(testDirPath, {
            recursive: true,
            force: true,
        });
        assert.isFalse(existsSync(migrationsDirPath));

        const prismaConfigPath = await writeMockPrismaConfig({
            dirPath: testDirPath,
            migrationsDirPath,
        });

        await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
            '--config',
            interpolationSafeWindowsPath(prismaConfigPath),
            '--snapshot',
            'custom.snapshot',
        ]);

        assert.isTrue(existsSync(migrationsDirPath));

        const migrationDirChildrenNames = await readdir(migrationsDirPath, {
            withFileTypes: true,
        });
        assert.isLengthExactly(migrationDirChildrenNames, 2);
        const newMigrationDirName = migrationDirChildrenNames.find((file) => {
            return file.isDirectory();
        })?.name;
        assert.isDefined(newMigrationDirName);

        assert.isNotEmpty(
            String(await readFile(join(migrationsDirPath, newMigrationDirName, 'custom.snapshot'))),
        );
    });
    it('resets a database', async (testContext) => {
        const testDirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        const databaseDirPath = join(testDirPath, 'pglite');

        await rm(testDirPath, {
            recursive: true,
            force: true,
        });

        const PrismaClient = await setupPrisma();

        const adapter = await createPgliteAdapter({
            prismaConfigPath: mockPrismaConfig,
            directDatabaseDirPath: databaseDirPath,
            resetDatabase: true,
        });
        const prismaClient = new PrismaClient({
            adapter,
        });

        await verifyPrismaClient(prismaClient);
        assert.isAbove(await prismaClient.user.count(), 0);
        await prismaClient.$disconnect();
        await adapter.pgliteClient.close();
        process.exitCode = undefined;

        await runCli([
            'migrate',
            'reset',
            '--config',
            interpolationSafeWindowsPath(mockPrismaConfig),
            '--database',
            wrapString({
                value: interpolationSafeWindowsPath(databaseDirPath),
                wrapper: "'",
            }),
        ]);

        const prismaClient2 = new PrismaClient({
            adapter: await createPgliteAdapter({
                prismaConfigPath: mockPrismaConfig,
                directDatabaseDirPath: databaseDirPath,
            }),
        });

        assert.strictEquals(await prismaClient2.user.count(), 0);
        await prismaClient2.$disconnect();
    });
    it('resets a database with default paths', async () => {
        const prismaConfigPath = join('prisma.config.ts');
        const schemaPath = join('prisma', 'schema.prisma');
        try {
            await mkdir(dirname(schemaPath), {
                recursive: true,
            });
            await writeFile(
                schemaPath,
                `
                    datasource db {
                        provider = "postgresql"
                    }
                `,
            );
            await writeFile(
                prismaConfigPath,
                [
                    "import {defineConfig} from 'prisma/config';",
                    '',
                    'export default defineConfig({',
                    "    schema: 'prisma/schema.prisma',",
                    '    datasource: {',
                    "        url: 'postgresql://prisma-pglite@localhost:5432/prisma-pglite',",
                    '    },',
                    '});',
                    '',
                ].join('\n'),
            );
            const {stderr} = await runCli([
                'migrate',
                'reset',
            ]);

            assert.isEmpty(stderr);
        } finally {
            await rm(dirname(schemaPath), {
                recursive: true,
                force: true,
            });
            await rm(prismaConfigPath, {
                force: true,
            });
        }
    });
    it('runs prisma generate with no hints', async () => {
        const {stdout} = await runCli([
            'generate',
            '--config',
            interpolationSafeWindowsPath(mockPrismaConfig),
        ]);
    });
});
