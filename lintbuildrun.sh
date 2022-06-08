pm2 stop 0
npm run lint
npm run build
pm2 start built/index.js
