import {findAncestor} from '@augment-vir/node';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';

/**
 * Generate a default PGlite directory for storing dev and test databases.
 *
 * @category Internal
 */
export function getDefaultDbParentDirPath() {
    const packageLockJsonPath = findAncestor(process.cwd(), (currentPath) => {
        return existsSync(join(currentPath, 'package-lock.json'));
    });
    /* node:coverage ignore next 1: can't test this branch because this repo has a package-lock.json file. */
    const basePath = join(packageLockJsonPath || process.cwd());

    return join(basePath, '.not-committed', 'pglite');
}

/**
 * Generate a default `schema.prisma` path from the current directory.
 *
 * @category Internal
 */
export function getDefaultSchemaPath() {
    return join(process.cwd(), 'prisma', 'schema.prisma');
}

/**
 * Generate a default migrations directory path from the current directory.
 *
 * @category Internal
 */
export function getDefaultMigrationsDirPath(schemaFilePath: string) {
    return join(dirname(schemaFilePath), 'migrations');
}
