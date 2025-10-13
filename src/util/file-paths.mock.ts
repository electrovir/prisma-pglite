import {join, resolve} from 'node:path';

export const repoDirPath = resolve(import.meta.dirname, '..', '..');
export const testFilesDirPath = join(repoDirPath, 'test-files');
export const invalidPrismaSchema = join(testFilesDirPath, 'invalid-schema');
export const mockPrismaSchema = join(testFilesDirPath, 'schema.prisma');
export const notCommittedDirPath = join(repoDirPath, '.not-committed');
export const mockMigrationsDirPath = join(notCommittedDirPath, 'migrations');
export const generatedOutputDirPath = join(repoDirPath, 'src', 'generated');
