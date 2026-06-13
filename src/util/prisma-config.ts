import {loadConfigFromFile} from '@prisma/config';
import {dirname, isAbsolute, resolve} from 'node:path';

/**
 * Schema and migration locations resolved from a Prisma config file.
 *
 * @category Internal
 */
export type ResolvedPrismaConfigPaths = {
    /** Absolute path to the Prisma schema referenced by the config. */
    schemaPath: string;
    /**
     * Absolute path to the migrations directory if the config specifies one (`migrations.path`),
     * otherwise `undefined`.
     */
    migrationsDirPath: string | undefined;
};

/**
 * Loads a Prisma config file (`prisma.config.ts`) and resolves the schema path and, if the config
 * specifies one, the migrations directory path. Prisma v7 stores both locations in the config file
 * rather than in the schema, so this reads them back out for the `prisma migrate diff` inputs this
 * package relies on. Paths are resolved relative to the config file's directory.
 *
 * @category Internal
 */
export async function resolvePrismaConfigPaths(
    prismaConfigPath: string,
): Promise<ResolvedPrismaConfigPaths> {
    const loaded = await loadConfigFromFile({
        configFile: prismaConfigPath,
    });

    if (loaded.error) {
        throw new Error(
            `Failed to load Prisma config at '${prismaConfigPath}': ${loaded.error._tag}.`,
        );
    } else if (!loaded.config.schema) {
        throw new Error(`Prisma config at '${prismaConfigPath}' does not define a schema path.`);
    }

    const configDir = dirname(prismaConfigPath);
    const resolveFromConfig = (filePath: string) =>
        isAbsolute(filePath) ? filePath : resolve(configDir, filePath);

    const migrationsPath = loaded.config.migrations?.path;

    return {
        schemaPath: resolveFromConfig(loaded.config.schema),
        migrationsDirPath: migrationsPath ? resolveFromConfig(migrationsPath) : undefined,
    };
}
