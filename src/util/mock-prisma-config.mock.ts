import {type PartialWithUndefined} from '@augment-vir/common';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mockPrismaSchema} from './file-paths.mock.js';

/**
 * Writes a throwaway `prisma.config.ts` (pointing at the mock schema) into the given directory and
 * returns its path. Since the migrations directory is now read solely from the Prisma config, tests
 * that need an isolated migrations location set `migrations.path` here.
 *
 * @category Internal
 */
export async function writeMockPrismaConfig({
    dirPath,
    migrationsDirPath,
}: Readonly<
    {
        dirPath: string;
    } & PartialWithUndefined<{
        migrationsDirPath: string;
    }>
>): Promise<string> {
    await mkdir(dirPath, {
        recursive: true,
    });

    const prismaConfigPath = join(dirPath, 'prisma.config.ts');

    await writeFile(
        prismaConfigPath,
        [
            "import {defineConfig} from 'prisma/config';",
            '',
            'export default defineConfig({',
            `    schema: ${JSON.stringify(mockPrismaSchema)},`,
            ...(migrationsDirPath
                ? [`    migrations: {path: ${JSON.stringify(migrationsDirPath)}},`]
                : []),
            '    datasource: {',
            "        url: 'postgresql://prisma-pglite@localhost:5432/prisma-pglite',",
            '    },',
            '});',
            '',
        ].join('\n'),
    );

    return prismaConfigPath;
}
