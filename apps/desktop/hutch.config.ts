export default {
  packageManager: 'bun',
  scripts: {
    dev: ['hutch', 'electrobun', 'dev'],
    build: ['hutch', 'electrobun', 'build', '--env=stable'],
    'build:canary': ['hutch', 'electrobun', 'build', '--env=canary'],
  },
};
