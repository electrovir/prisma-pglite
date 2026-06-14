import {assert} from '@augment-vir/assert';
import {describe, extractTestNameAsDir, it, itCases} from '@augment-vir/test';
import {mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {notCommittedDirPath} from '../util/file-paths.mock.js';
import {writeMockPrismaConfig} from '../util/mock-prisma-config.mock.js';
import {
    createPgliteMigration,
    findLatestMigrationPath,
    migrationLockFileName,
    sanitizeMigrationName,
} from './migrate-dev.js';

const datasourceBlock = 'datasource db {\n    provider = "postgresql"\n}\n\n';

/**
 * Writes a Prisma config + schema file (whose contents can be rewritten between migrations) into
 * `dirPath` and returns their paths.
 */
async function writeEvolvingConfig({
    dirPath,
    models,
}: Readonly<{
    dirPath: string;
    models: string;
}>): Promise<{prismaConfigPath: string; schemaPath: string}> {
    await mkdir(dirPath, {
        recursive: true,
    });
    const schemaPath = join(dirPath, 'schema.prisma');
    await writeFile(schemaPath, datasourceBlock + models);

    const prismaConfigPath = join(dirPath, 'prisma.config.ts');
    await writeFile(
        prismaConfigPath,
        [
            "import {defineConfig} from 'prisma/config';",
            '',
            'export default defineConfig({',
            "    schema: 'schema.prisma',",
            "    migrations: {path: 'migrations'},",
            "    datasource: {url: 'postgresql://prisma-pglite@localhost:5432/prisma-pglite'},",
            '});',
            '',
        ].join('\n'),
    );

    return {
        prismaConfigPath,
        schemaPath,
    };
}

describe(createPgliteMigration.name, () => {
    it('creates a migration in the config-defined migrations directory', async (testContext) => {
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

        assert.isDefined(
            await createPgliteMigration({
                migrationName: 'test migration',
                prismaConfigPath,
            }),
        );

        const migrationDirChildren = await readdir(migrationsDirPath);

        assert.hasValue(migrationDirChildren, migrationLockFileName);
        const newMigrationDirNames = migrationDirChildren.filter(
            (childName) => childName !== migrationLockFileName,
        );
        assert.isLengthExactly(newMigrationDirNames, 1);

        const newMigrationDirPath = join(migrationsDirPath, newMigrationDirNames[0]);
        /** Standard Prisma migration directories contain only `migration.sql` (no snapshot files). */
        assert.deepEquals(await readdir(newMigrationDirPath), ['migration.sql']);
        assert.isNotEmpty(String(await readFile(join(newMigrationDirPath, 'migration.sql'))));

        assert.isUndefined(
            await createPgliteMigration({
                migrationName: 'test migration',
                prismaConfigPath,
            }),
            'should not create a new migration when no changes have been made',
        );
    });

    it('creates an incremental migration on top of existing history', async (testContext) => {
        const dirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        await rm(dirPath, {
            recursive: true,
            force: true,
        });
        const {prismaConfigPath, schemaPath} = await writeEvolvingConfig({
            dirPath,
            models: 'model User {\n    id String @id\n    name String\n}\n',
        });

        const first = await createPgliteMigration({
            migrationName: 'init',
            prismaConfigPath,
        });
        assert.isDefined(first);
        assert.isIn(
            'CREATE TABLE "User"',
            String(await readFile(join(first.migrationDirPath, 'migration.sql'))),
        );

        /** Evolve the schema, then generate the next migration. */
        await writeFile(
            schemaPath,
            `${datasourceBlock}model User {\n    id String @id\n    name String\n    email String?\n}\n`,
        );

        const second = await createPgliteMigration({
            migrationName: 'add email',
            prismaConfigPath,
        });
        assert.isDefined(second);
        const secondSql = String(await readFile(join(second.migrationDirPath, 'migration.sql')));
        assert.isIn('ADD COLUMN', secondSql);
        assert.isIn('"email"', secondSql);
        assert.isFalse(secondSql.includes('CREATE TABLE'));

        const migrationDirs = (
            await readdir(join(dirPath, 'migrations'), {
                withFileTypes: true,
            })
        ).filter((entry) => entry.isDirectory());
        assert.isLengthExactly(migrationDirs, 2);
    });

    it('sanitizes the migration name into the directory name', async (testContext) => {
        const dirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        await rm(dirPath, {
            recursive: true,
            force: true,
        });
        const {prismaConfigPath} = await writeEvolvingConfig({
            dirPath,
            models: 'model User {\n    id String @id\n}\n',
        });

        const migration = await createPgliteMigration({
            migrationName: 'Add User Table',
            prismaConfigPath,
        });
        assert.isDefined(migration);
        assert.isTrue(
            migration.migrationName.endsWith(`_${sanitizeMigrationName('Add User Table')}`),
            `migration directory name "${migration.migrationName}" should end with the sanitized name`,
        );
    });
});

describe(findLatestMigrationPath.name, () => {
    it('returns undefined when there are no migration folders', async (testContext) => {
        const emptyMigrationsFolder = join(
            notCommittedDirPath,
            'tests',
            extractTestNameAsDir(testContext),
            'migrations',
        );

        await rm(emptyMigrationsFolder, {
            recursive: true,
            force: true,
        });
        await mkdir(emptyMigrationsFolder, {
            recursive: true,
        });

        assert.isUndefined(await findLatestMigrationPath(emptyMigrationsFolder));
    });

    it('returns undefined for a nonexistent directory', async (testContext) => {
        const missingDirPath = join(
            notCommittedDirPath,
            'tests',
            extractTestNameAsDir(testContext),
            'does-not-exist',
        );
        await rm(missingDirPath, {
            recursive: true,
            force: true,
        });

        assert.isUndefined(await findLatestMigrationPath(missingDirPath));
    });

    it('returns the lexicographically last migration directory, ignoring files', async (testContext) => {
        const dirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        await rm(dirPath, {
            recursive: true,
            force: true,
        });
        await mkdir(join(dirPath, '20240101000000_a'), {
            recursive: true,
        });
        await mkdir(join(dirPath, '20240103000000_c'), {
            recursive: true,
        });
        await mkdir(join(dirPath, '20240102000000_b'), {
            recursive: true,
        });
        await writeFile(join(dirPath, migrationLockFileName), 'provider = "postgresql"');

        assert.strictEquals(
            await findLatestMigrationPath(dirPath),
            join(dirPath, '20240103000000_c'),
        );
    });
});

describe(sanitizeMigrationName.name, () => {
    itCases(sanitizeMigrationName, [
        {
            it: 'removes spaces',
            input: 'test name',
            expect: 'test_name',
        },
        {
            it: 'removes kebab case',
            input: 'test-name',
            expect: 'test_name',
        },
        {
            it: 'converts from camel case',
            input: 'TestName',
            expect: 'test_name',
        },
        {
            it: 'handles multiple consecutive spaces',
            input: 'test  name',
            expect: 'test_name',
        },
        {
            it: 'collapses multi-word names with capitals',
            input: 'Add User Table',
            expect: 'add_user_table',
        },
        {
            it: 'trims surrounding whitespace',
            input: '  spaced  ',
            expect: 'spaced',
        },
        {
            it: 'leaves snake_case unchanged',
            input: 'already_snake',
            expect: 'already_snake',
        },
        {
            it: 'collapses repeated separators',
            input: 'foo--bar  baz',
            expect: 'foo_bar_baz',
        },
        {
            it: 'lowercases constant case',
            input: 'CONSTANT_CASE',
            expect: 'constant_case',
        },
        {
            it: 'keeps numbers',
            input: 'add-2-things',
            expect: 'add_2_things',
        },
        {
            it: 'splits mixed-case words',
            input: 'mixCase Words',
            expect: 'mix_case_words',
        },
    ]);
});
