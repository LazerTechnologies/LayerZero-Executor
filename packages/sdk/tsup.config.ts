import { defineConfig, getDefaultConfig } from '@lz/config-tsup'

export default defineConfig({
    ...getDefaultConfig(),
    entry: {
        index: 'src/index.ts',
    },
})
