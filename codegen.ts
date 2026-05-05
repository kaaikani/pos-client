import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
    overwrite: true,
    ignoreNoDocuments: true,
    generates: {
        'src/gql/admin/schema.ts': {
            schema: { 'http://127.0.0.1:3000/admin-api': {} },
            plugins: ['typescript'],
            config: {
                skipTypename: false,
                useTypeImports: true,
                enumsAsTypes: true,
                scalars: {
                    DateTime: 'string',
                    JSON: 'Record<string, any>',
                    Money: 'number',
                    Upload: 'File',
                },
            },
        },
        'src/gql/shop/schema.ts': {
            schema: { 'http://127.0.0.1:3000/shop-api': {} },
            plugins: ['typescript'],
            config: {
                skipTypename: false,
                useTypeImports: true,
                enumsAsTypes: true,
                scalars: {
                    DateTime: 'string',
                    JSON: 'Record<string, any>',
                    Money: 'number',
                    Upload: 'File',
                },
            },
        },
        'src/gql/admin/schema.graphql': {
            schema: { 'http://127.0.0.1:3000/admin-api': {} },
            plugins: ['schema-ast'],
        },
        'src/gql/shop/schema.graphql': {
            schema: { 'http://127.0.0.1:3000/shop-api': {} },
            plugins: ['schema-ast'],
        },
    },
};

export default config;
