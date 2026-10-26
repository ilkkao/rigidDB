import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'RigidDB',
    description: 'Typed, indexed records in Redis',
    base: '/rigidDB/',
    cleanUrls: true,
    lastUpdated: true,

    themeConfig: {
        nav: [
            { text: 'Guide', link: '/guide/getting-started' },
            { text: 'API', link: '/api/' },
            { text: 'Changelog', link: 'https://github.com/ilkkao/rigidDB/blob/master/CHANGELOG.md' }
        ],

        sidebar: [
            {
                text: 'Guide',
                items: [
                    { text: 'Getting started', link: '/guide/getting-started' },
                    { text: 'Schemas and data types', link: '/guide/schema' },
                    { text: 'TypeScript', link: '/guide/typescript' },
                    { text: 'Errors', link: '/guide/errors' }
                ]
            },
            {
                text: 'API reference',
                items: [
                    { text: 'Overview', link: '/api/' },
                    { text: 'Connection', link: '/api/connection' },
                    { text: 'Schema', link: '/api/schema' },
                    { text: 'Records', link: '/api/records' },
                    { text: 'Queries', link: '/api/queries' },
                    { text: 'Transactions', link: '/api/transactions' },
                    { text: 'Utilities', link: '/api/utilities' }
                ]
            }
        ],

        outline: [ 2, 3 ],
        search: { provider: 'local' },

        socialLinks: [
            { icon: 'github', link: 'https://github.com/ilkkao/rigidDB' },
            { icon: 'npm', link: 'https://www.npmjs.com/package/rigiddb' }
        ],

        editLink: {
            pattern: 'https://github.com/ilkkao/rigidDB/edit/master/docs/:path'
        },

        footer: {
            message: 'Released under the MIT License.'
        }
    }
});
