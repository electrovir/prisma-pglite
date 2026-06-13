import {combineErrorMessages, wrapString} from '@augment-vir/common';
import {interpolationSafeWindowsPath, runShellCommand} from '@augment-vir/node';
import {resolvePrismaConfigPaths} from './prisma-config.js';

/**
 * The Prisma CLI does not (yet) support initializing a PGlite database. Instead, this function uses
 * the Prisma CLI to dump a single SQL script which can then be loaded by a PGlite instance to setup
 * the database to match the schema referenced by the given Prisma config.
 *
 * This currently only supports initializing a database from nothing. Meaning, this cannot be used
 * to apply new migrations to an existing PGlite instance.
 *
 * @category Internal
 * @param prismaConfigPath Path to a Prisma config file (`prisma.config.ts`). Prisma v7 reads the
 *   schema location and datasource from this config.
 * @returns The raw SQL to be executed
 * @see https://github.com/lucasthevenet/pglite-utils/issues/8#issuecomment-2147944548
 */
export async function generateInitSql(prismaConfigPath: string): Promise<string> {
    const {schemaPath} = await resolvePrismaConfigPaths(prismaConfigPath);

    const diffCommand = [
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema',
        wrapString({
            value: interpolationSafeWindowsPath(schemaPath),
            wrapper: "'",
        }),
        '--config',
        wrapString({
            value: interpolationSafeWindowsPath(prismaConfigPath),
            wrapper: "'",
        }),
        '--script',
    ].join(' ');

    const result = await runShellCommand(diffCommand, {
        rejectOnError: false,
    });

    if (result.exitCode !== 0) {
        throw new Error(
            combineErrorMessages(
                `prisma migrate diff failed with exit code ${result.exitCode}.`,
                result.stderr,
            ),
        );
    }

    return result.stdout;
}
