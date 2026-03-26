import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Agent Sentinel',
  description: 'Real-time AI agent monitoring for VS Code',
  base: '/agent-sentinel-extension/',

  head: [
    ['meta', { name: 'theme-color', content: '#3a7bd5' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/architecture' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Eval Authoring', link: '/guide/eval-authoring' },
            { text: 'Harness Support', link: '/guide/harness-support' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Extension API', link: '/reference/api' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/VolitionLabsAi/agent-sentinel-extension' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/VolitionLabsAi/agent-sentinel-extension/edit/main/docs-site/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright 2026 Volition Labs',
    },
  },
})
