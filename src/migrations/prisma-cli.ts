import {check} from '@augment-vir/assert';
import {log} from '@augment-vir/common';
import {askQuestion, extractRelevantArgs, runShellCommand} from '@augment-vir/node';
import minimist from 'minimist';
import {createPgliteMigration} from './migrate-dev.js';
import {resetPgliteDatabase} from './migrate-reset.js';

/**
 * Parse raw args passed to {@link runPrisma} from a raw CLI.
 *
 * @category Internal
 */
export function parseRawArgs(
    /** The `import.meta` from your script file that's directly calling this. */
    importMeta: ImportMeta,
    rawArgs: ReadonlyArray<string>,
) {
    return extractRelevantArgs({
        binName: 'prisma-pglite',
        fileName: importMeta.filename,
        rawArgs,
    });
}

/**
 * Run the Prisma CLI but intercept the `prisma migrate dev` and `prisma migrate reset` commands to
 * use a PGlite database. All other commands are passed directly to the Prisma CLI.
 *
 * @category CLI
 */
export async function runPrisma(cliArgs: ReadonlyArray<string>, env?: Record<string, string>) {
    const parsedArgs = minimist([...cliArgs]);
    const silent = !!parsedArgs.silent;

    const schemaPath = parsedArgs.schema;

    if (cliArgs[0] === 'migrate' && cliArgs[1] === 'dev') {
        return await createPgliteMigration({
            schemaFilePath: schemaPath,
            migrationName: parsedArgs.name || (await askQuestion('Please enter a migration name:')),
            silent,
            snapshotFileName: parsedArgs.snapshot,
            migrationsDirPath: parsedArgs.migrations,
        });
    } else if (cliArgs[0] === 'migrate' && cliArgs[1] === 'reset') {
        const databasePath = parsedArgs.database;
        return await resetPgliteDatabase({
            silent,
            schemaFilePath: schemaPath,
            pgliteDatabaseDirPath: databasePath,
        });
    } else {
        const extraFlags =
            check.startsWith(cliArgs, 'generate') && !cliArgs.includes('--no-hints')
                ? ['--no-hints']
                : [''];

        const fullCommand = [
            'prisma',
            ...cliArgs,
            ...extraFlags,
        ].join(' ');

        log.if(!silent).faint(
            [
                '>',
                fullCommand,
            ].join(' '),
        );

        return await runShellCommand(fullCommand, {
            hookUpToConsole: true,
            rejectOnError: true,
            env: {
                ...process.env,
                ...env,
            },
        });
    }
}
