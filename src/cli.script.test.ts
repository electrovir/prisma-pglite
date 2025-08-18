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
import {mockPrismaSchema, notCommittedDirPath} from './util/file-paths.mock.js';
import {setupPrisma} from './util/setup-prisma.mock.js';

async function runCli(args: ReadonlyArray<string>) {
    const fullCommand = [
        'tsx',
        join(import.meta.dirname, 'cli.script.ts'),
        ...args,
    ].join(' ');

    return await runShellCommand(fullCommand, {
        hookUpToConsole: true,
    });
}

describe('cli', () => {
    it('passes normal commands directly to prisma', async () => {
        const {stdout} = await runCli(['--version']);

        assert.hasValues(stdout, [
            'prisma',
            '@prisma/client',
            'Computed binaryTarget',
        ]);
    });
    it('generates a migration', async (testContext) => {
        const migrationsDirPath = join(
            notCommittedDirPath,
            'tests',
            extractTestNameAsDir(testContext),
            'migrations',
        );

        await rm(migrationsDirPath, {recursive: true, force: true});
        assert.isFalse(existsSync(migrationsDirPath));

        await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
            '--schema',
            interpolationSafeWindowsPath(mockPrismaSchema),
            '--migrations',
            wrapString({
                value: interpolationSafeWindowsPath(migrationsDirPath),
                wrapper: "'",
            }),
        ]);

        assert.isTrue(existsSync(migrationsDirPath));
        assert.strictEquals(
            String(await readFile(join(migrationsDirPath, migrationLockFileName))),
            migrationLockFileContents,
        );

        const migrationDirChildrenNames = await readdir(migrationsDirPath, {withFileTypes: true});

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
    it('generates a migration with only a migrations path', async (testContext) => {
        const migrationsDirPath = join(
            notCommittedDirPath,
            'tests',
            extractTestNameAsDir(testContext),
            'migrations',
        );

        await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
            '--migrations',
            wrapString({
                value: interpolationSafeWindowsPath(migrationsDirPath),
                wrapper: "'",
            }),
        ]);
    });
    it('generates a migration with only a schema path', async () => {
        await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
            '--schema',
            interpolationSafeWindowsPath(mockPrismaSchema),
        ]);
    });
    it('fails on an invalid schema path', async () => {
        const {stderr} = await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
            '--schema',
            interpolationSafeWindowsPath(mockPrismaSchema),
        ]);

        assert.hasValue(stderr, 'No changes detected');
    });
    it('accepts a CLI input migration name', async (testContext) => {
        const migrationsDirPath = join(
            notCommittedDirPath,
            'tests',
            extractTestNameAsDir(testContext),
            'migrations',
        );

        const fullCommand = [
            'echo',
            'cli-input-name',
            '|',
            'tsx',
            join(import.meta.dirname, 'cli.script.ts'),
            'migrate',
            'dev',
            '--schema',
            interpolationSafeWindowsPath(mockPrismaSchema),
            '--migrations',
            wrapString({
                value: interpolationSafeWindowsPath(migrationsDirPath),
                wrapper: "'",
            }),
        ].join(' ');

        await runShellCommand(fullCommand, {
            hookUpToConsole: true,
            rejectOnError: true,
        });

        const migrationDirChildrenNames = await readdir(migrationsDirPath, {withFileTypes: true});

        assert.isLengthExactly(migrationDirChildrenNames, 2);

        const newMigrationDirName = migrationDirChildrenNames.find((file) => {
            return file.isDirectory();
        })?.name;

        assert.isDefined(newMigrationDirName);
        assert.hasValue(newMigrationDirName, 'cli_input_name');
    });
    it('uses a custom snapshot file name', async (testContext) => {
        const migrationsDirPath = join(
            notCommittedDirPath,
            'tests',
            extractTestNameAsDir(testContext),
            'migrations',
        );

        await rm(migrationsDirPath, {recursive: true, force: true});
        assert.isFalse(existsSync(migrationsDirPath));

        await runCli([
            'migrate',
            'dev',
            '--name',
            'my-migration',
            '--schema',
            interpolationSafeWindowsPath(mockPrismaSchema),
            '--snapshot',
            'custom.snapshot',
            '--migrations',
            wrapString({
                value: interpolationSafeWindowsPath(migrationsDirPath),
                wrapper: "'",
            }),
        ]);

        assert.isTrue(existsSync(migrationsDirPath));

        const migrationDirChildrenNames = await readdir(migrationsDirPath, {withFileTypes: true});
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
        const migrationsDirPath = join(
            notCommittedDirPath,
            'tests',
            extractTestNameAsDir(testContext),
            'migrations',
        );
        const databaseDirPath = join(dirname(migrationsDirPath), 'pglite');

        await rm(migrationsDirPath, {recursive: true, force: true});
        assert.isFalse(existsSync(migrationsDirPath));

        const prismaClient = new (await setupPrisma())({
            adapter: await createPgliteAdapter({
                schemaFilePath: mockPrismaSchema,
                directDatabaseDirPath: databaseDirPath,
            }),
        });

        await verifyPrismaClient(prismaClient);

        assert.isAbove(await prismaClient.user.count(), 0);

        await runCli([
            'migrate',
            'reset',
            '--schema',
            interpolationSafeWindowsPath(mockPrismaSchema),
            '--database',
            wrapString({
                value: interpolationSafeWindowsPath(databaseDirPath),
                wrapper: "'",
            }),
        ]);

        assert.isAbove(await prismaClient.user.count(), 0);

        await prismaClient.$disconnect();
    });
    it('resets a database with default paths', async () => {
        const schemaPath = join('prisma', 'schema.prisma');
        try {
            await mkdir(dirname(schemaPath), {recursive: true});
            await writeFile(
                schemaPath,
                `
                    datasource db {
                        provider = "postgresql"
                        url      = env("DATABASE_URL")
                    }
                `,
            );
            const {stderr} = await runCli([
                'migrate',
                'reset',
            ]);

            assert.isEmpty(stderr);
        } finally {
            await rm(dirname(schemaPath), {recursive: true, force: true});
        }
    });
    it('runs prisma generate with no hints', async () => {
        const {stdout} = await runCli([
            'generate',
            '--schema',
            interpolationSafeWindowsPath(mockPrismaSchema),
        ]);

        assert.hasValues(stdout, ['--no-hints']);
    });
});
