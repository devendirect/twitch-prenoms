import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Les pages importent /socle/dom.js, servi par le socle : les tests le lisent dans le
    // socle installé (lien `file:` ou `npm link` en développement, copie depuis GitHub sinon).
    alias: [{ find: /^\/socle\//, replacement: fileURLToPath(new URL('./node_modules/socle/public/socle/', import.meta.url)) }],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
