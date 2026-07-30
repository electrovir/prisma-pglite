/**
 * This file is copied from
 * https://github.com/lucasthevenet/pglite-utils/blob/97a566f7df47841845ff8e3c3a61f5b40f5a9e98/packages/prisma-adapter/src/errors.ts
 *
 * Which has the MIT license, author `Lucas Thevenet <lcervantes@dc.uba.ar>`. It has been modified
 * slightly to pass this package's ESLint and TypeScript settings.
 */

/* node:coverage disable */

import type * as pglite from '@electric-sql/pglite';
import {
    type Error as DriverAdapterErrorObject,
    type MappedError,
} from '@prisma/driver-adapter-utils';

export function convertDriverError(error: unknown): DriverAdapterErrorObject {
    if (isDriverError(error)) {
        return {
            ...(error.code === undefined
                ? {}
                : {
                      originalCode: error.code,
                  }),
            originalMessage: error.message,
            ...mapDriverError(error),
        };
    }

    throw error;
}

function mapDriverError(error: pglite.messages.DatabaseError): MappedError {
    // eslint-disable-next-line @virmator/no-switch
    switch (error.code) {
        case '22001':
            return {
                kind: 'LengthMismatch',
                ...(error.column === undefined
                    ? {}
                    : {
                          column: error.column,
                      }),
            };
        case '22003':
            return {
                kind: 'ValueOutOfRange',
                cause: error.message,
            };
        case '22P02':
            return {
                kind: 'InvalidInputValue',
                message: error.message,
            };
        case '23505': {
            const fields = error.detail
                ?.match(/Key \(([^)]+)\)/)
                ?.at(1)
                ?.split(', ');
            return {
                kind: 'UniqueConstraintViolation',
                ...(fields === undefined
                    ? {}
                    : {
                          constraint: {
                              fields,
                          },
                      }),
            };
        }
        case '23502': {
            const fields = error.detail
                ?.match(/Key \(([^)]+)\)/)
                ?.at(1)
                ?.split(', ');
            return {
                kind: 'NullConstraintViolation',
                ...(fields === undefined
                    ? {}
                    : {
                          constraint: {
                              fields,
                          },
                      }),
            };
        }
        case '23503':
            if (error.column) {
                return {
                    kind: 'ForeignKeyConstraintViolation',
                    constraint: {
                        fields: [error.column],
                    },
                };
            }
            if (error.constraint) {
                return {
                    kind: 'ForeignKeyConstraintViolation',
                    constraint: {
                        index: error.constraint,
                    },
                };
            }
            return {
                kind: 'ForeignKeyConstraintViolation',
            };
        case '3D000': {
            const db = error.message.split(' ').at(1)?.split('"').at(1);
            return {
                kind: 'DatabaseDoesNotExist',
                ...(db === undefined
                    ? {}
                    : {
                          db,
                      }),
            };
        }
        case '28000': {
            const db = error.message
                .split(',')
                .find((segment) => segment.startsWith(' database'))
                ?.split('"')
                .at(1);
            return {
                kind: 'DatabaseAccessDenied',
                ...(db === undefined
                    ? {}
                    : {
                          db,
                      }),
            };
        }
        case '28P01': {
            const user = error.message.split(' ').pop()?.split('"').at(1);
            return {
                kind: 'AuthenticationFailed',
                ...(user === undefined
                    ? {}
                    : {
                          user,
                      }),
            };
        }
        case '40001':
            return {
                kind: 'TransactionWriteConflict',
            };
        case '42P01': {
            const table = error.message.split(' ').at(1)?.split('"').at(1);
            return {
                kind: 'TableDoesNotExist',
                ...(table === undefined
                    ? {}
                    : {
                          table,
                      }),
            };
        }
        case '42703': {
            const column = error.message.split(' ').at(1)?.split('"').at(1);
            return {
                kind: 'ColumnNotFound',
                ...(column === undefined
                    ? {}
                    : {
                          column,
                      }),
            };
        }
        case '42P04': {
            const db = error.message.split(' ').at(1)?.split('"').at(1);
            return {
                kind: 'DatabaseAlreadyExists',
                ...(db === undefined
                    ? {}
                    : {
                          db,
                      }),
            };
        }
        case '53300':
            return {
                kind: 'TooManyConnections',
                cause: error.message,
            };
        default:
            return {
                kind: 'postgres',
                code: error.code ?? 'N/A',
                severity: error.severity ?? 'N/A',
                message: error.message,
                detail: error.detail,
                column: error.column,
                hint: error.hint,
            };
    }
}

function isDriverError(error: unknown): error is pglite.messages.DatabaseError {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const candidate = error as Record<string, unknown>;

    return (
        typeof candidate.code === 'string' &&
        typeof candidate.message === 'string' &&
        typeof candidate.severity === 'string' &&
        (typeof candidate.detail === 'string' || candidate.detail === undefined) &&
        (typeof candidate.column === 'string' || candidate.column === undefined) &&
        (typeof candidate.hint === 'string' || candidate.hint === undefined)
    );
}
