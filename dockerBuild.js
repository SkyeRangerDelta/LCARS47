// docker-build.js
const { execSync } = require('child_process');
const tag = execSync('git describe --tags --abbrev=0').toString().trim();
execSync(`docker build --build-arg GIT_TAG=${tag} -t lcars47 .`, { stdio: 'inherit' });
