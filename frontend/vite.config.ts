import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

function printModuleTree(): PluginOption {
  return {
    name: 'print-module-tree',
    generateBundle(_options, bundle) {
      const treeLines: string[] = []

      const seen = new Set<string>()
      const printTree = (id: string, indent: string) => {
        if (seen.has(id)) {
          treeLines.push(`${indent}- ${id} (seen)`)
          return
        }
        seen.add(id)
        treeLines.push(`${indent}- ${id}`)

        const info = this.getModuleInfo(id)
        if (!info) return
        for (const dep of info.importedIds) {
          printTree(dep, `${indent}  `)
        }
      }

      const chunkLines: string[] = []
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk') continue

        const moduleIds = Object.keys(item.modules)
        for (const id of moduleIds) {
          const info = this.getModuleInfo(id)
          if (info?.isEntry) {
            treeLines.push(`\n=== Entry: ${id} ===`)
            printTree(id, '')
          }
        }

        chunkLines.push(`\n=== Chunk: ${fileName} ===`)
        chunkLines.push(`isEntry: ${item.isEntry}`)
        chunkLines.push(`imports: ${item.imports.join(', ') || '(none)'}`)
        chunkLines.push(`dynamicImports: ${item.dynamicImports.join(', ') || '(none)'}`)
        chunkLines.push('modules:')
        for (const id of moduleIds) {
          chunkLines.push(`  - ${id}`)
        }
      }

      const treeOut = path.resolve(__dirname, 'dependency-tree.txt')
      const chunksOut = path.resolve(__dirname, 'dependency-chunks.txt')
      fs.writeFileSync(treeOut, treeLines.join('\n'))
      fs.writeFileSync(chunksOut, chunkLines.join('\n'))
      console.log(`[print-module-tree] wrote ${treeOut}`)
      console.log(`[print-import-tree] wrote ${chunksOut}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), printModuleTree()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
