import {assert} from '@augment-vir/assert';
import {describe, extractTestNameAsDir, it} from '@augment-vir/test';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mockPrismaSchema, notCommittedDirPath} from './file-paths.mock.js';
import {writeMockPrismaConfig} from './mock-prisma-config.mock.js';
import {resolvePrismaConfigPaths} from './prisma-config.js';

async function writeConfig(dirPath: string, lines: ReadonlyArray<string>): Promise<string> {
    await mkdir(dirPath, {
        recursive: true,
    });
    const prismaConfigPath = join(dirPath, 'prisma.config.ts');
    await writeFile(prismaConfigPath, lines.join('\n'));
    return prismaConfigPath;
}

describe(resolvePrismaConfigPaths.name, () => {
    it('resolves the schema path and leaves migrations undefined when unset', async (testContext) => {
        const dirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        await rm(dirPath, {
            recursive: true,
            force: true,
        });
        const prismaConfigPath = await writeMockPrismaConfig({
            dirPath,
        });

        const resolved = await resolvePrismaConfigPaths(prismaConfigPath);
        assert.strictEquals(resolved.schemaPath, mockPrismaSchema);
        assert.isUndefined(resolved.migrationsDirPath);
    });

    it('resolves a relative migrations.path against the config directory', async (testContext) => {
        const dirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        await rm(dirPath, {
            recursive: true,
            force: true,
        });
        const prismaConfigPath = await writeConfig(dirPath, [
            "import {defineConfig} from 'prisma/config';",
            '',
            'export default defineConfig({',
            "    schema: 'schema.prisma',",
            "    migrations: {path: 'custom-migrations'},",
            "    datasource: {url: 'postgresql://prisma-pglite@localhost:5432/prisma-pglite'},",
            '});',
            '',
        ]);

        const resolved = await resolvePrismaConfigPaths(prismaConfigPath);
        assert.strictEquals(resolved.schemaPath, join(dirPath, 'schema.prisma'));
        assert.strictEquals(resolved.migrationsDirPath, join(dirPath, 'custom-migrations'));
    });

    it('resolves an absolute migrations.path as-is', async (testContext) => {
        const dirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        await rm(dirPath, {
            recursive: true,
            force: true,
        });
        const absoluteMigrationsPath = join(tmpdir(), 'prisma-pglite-absolute-migrations');
        const prismaConfigPath = await writeConfig(dirPath, [
            "import {defineConfig} from 'prisma/config';",
            '',
            'export default defineConfig({',
            "    schema: 'schema.prisma',",
            `    migrations: {path: ${JSON.stringify(absoluteMigrationsPath)}},`,
            "    datasource: {url: 'postgresql://prisma-pglite@localhost:5432/prisma-pglite'},",
            '});',
            '',
        ]);

        const resolved = await resolvePrismaConfigPaths(prismaConfigPath);
        assert.strictEquals(resolved.migrationsDirPath, absoluteMigrationsPath);
    });

    it('throws when the config file is missing', async (testContext) => {
        const missingConfigPath = join(
            notCommittedDirPath,
            'tests',
            extractTestNameAsDir(testContext),
            'missing.config.ts',
        );
        await rm(missingConfigPath, {
            recursive: true,
            force: true,
        });

        await assert.throws(async () => resolvePrismaConfigPaths(missingConfigPath), {
            matchMessage: 'Failed to load Prisma config',
        });
    });

    it('throws when the config does not define a schema', async (testContext) => {
        const dirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        await rm(dirPath, {
            recursive: true,
            force: true,
        });
        const prismaConfigPath = await writeConfig(dirPath, [
            "import {defineConfig} from 'prisma/config';",
            '',
            'export default defineConfig({',
            "    datasource: {url: 'postgresql://prisma-pglite@localhost:5432/prisma-pglite'},",
            '});',
            '',
        ]);

        await assert.throws(async () => resolvePrismaConfigPaths(prismaConfigPath), {
            matchMessage: 'does not define a schema path',
        });
    });
});
