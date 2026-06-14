import {readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {prismaApi} from 'prisma-vir';
import {generatedOutputDirPath, mockPrismaConfig} from './file-paths.mock.js';

/**
 * Prisma generates `export const DbNull = runtime.objectEnumValues.instances.DbNull` (and the same
 * for `JsonNull` and `AnyNull`) without a type annotation. Under TypeScript declaration emit this
 * fails with TS4094 because the inferred type is an anonymous class with a private field. Adding an
 * explicit type query annotation lets declaration emit reference the named runtime type instead of
 * re-serializing the anonymous class.
 */
const nullEnumValueNames = [
    'DbNull',
    'JsonNull',
    'AnyNull',
];

async function patchGeneratedNullTypeAnnotations() {
    await Promise.all(
        [
            'prismaNamespace.ts',
            'prismaNamespaceBrowser.ts',
        ].map(async (fileName) => {
            const filePath = join(generatedOutputDirPath, 'internal', fileName);
            const original = await readFile(filePath, 'utf8');
            const patched = nullEnumValueNames.reduce((contents, name) => {
                const unannotated = `export const ${name} = runtime.objectEnumValues.instances.${name}`;
                const annotated = `export const ${name}: typeof runtime.objectEnumValues.instances.${name} = runtime.objectEnumValues.instances.${name}`;
                return contents.replace(unannotated, annotated);
            }, original);

            /* node:coverage ignore next 3: whether a patch is needed depends on Prisma's generated output, not test logic */
            if (patched !== original) {
                await writeFile(filePath, patched);
            }
        }),
    );
}

export async function setupPrisma() {
    await rm(generatedOutputDirPath, {
        force: true,
        recursive: true,
    });
    await prismaApi.client.generate({
        configPath: mockPrismaConfig,
    });

    await patchGeneratedNullTypeAnnotations();

    /* node:coverage ignore next 1: dynamic imports do not have branches */
    const {PrismaClient} = await import('../generated/client.js');

    return PrismaClient;
}
