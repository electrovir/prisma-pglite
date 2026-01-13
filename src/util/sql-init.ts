import {wrapString} from '@augment-vir/common';
import {interpolationSafeWindowsPath, runShellCommand} from '@augment-vir/node';

/**
 * The Prisma CLI does not (yet) support initializing a PGlite database. Instead, this function uses
 * the Prisma CLI to dump a single SQL script which can then be loaded by a PGlite instance to setup
 * the database to match the given schema.
 *
 * This currently only supports initializing a database from nothing. Meaning, this cannot be used
 * to apply new migrations to an existing PGlite instance.
 *
 * @category Internal
 * @returns The raw SQL to be executed
 * @see https://github.com/lucasthevenet/pglite-utils/issues/8#issuecomment-2147944548
 */
export async function generateInitSql(schemaFilePath: string): Promise<string> {
    const diffCommand = [
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema-datamodel',
        wrapString({value: interpolationSafeWindowsPath(schemaFilePath), wrapper: "'"}),
        '--script',
    ].join(' ');

    const {stdout} = await runShellCommand(diffCommand, {
        rejectOnError: true,
    });

    return stdout;
}
