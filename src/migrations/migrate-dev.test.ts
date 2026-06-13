import {assert} from '@augment-vir/assert';
import {collapseWhiteSpace} from '@augment-vir/common';
import {describe, extractTestNameAsDir, it, itCases} from '@augment-vir/test';
import {mkdir, readdir, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {mockPrismaSchema, notCommittedDirPath} from '../util/file-paths.mock.js';
import {writeMockPrismaConfig} from '../util/mock-prisma-config.mock.js';
import {
    createPgliteMigration,
    defaultSnapshotFileName,
    findLatestMigrationPath,
    migrationLockFileName,
    sanitizeMigrationName,
} from './migrate-dev.js';

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
        const newMigrationDirChildren = await readdir(newMigrationDirPath);
        assert.deepEquals(
            newMigrationDirChildren.toSorted(),
            [
                'migration.sql',
                defaultSnapshotFileName,
            ].sort(),
        );

        /**
         * We cannot do complete equality here because the snapshot file has a comment added to the
         * top of the file.
         */
        assert.isIn(
            collapseWhiteSpace(String(await readFile(mockPrismaSchema))),
            collapseWhiteSpace(
                String(await readFile(join(newMigrationDirPath, defaultSnapshotFileName))),
            ),
        );

        assert.isUndefined(
            await createPgliteMigration({
                migrationName: 'test migration',
                prismaConfigPath,
            }),
            'should not create a new migration when no changes have been made',
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
    ]);
});
