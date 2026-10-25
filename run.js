// Starts the API (server) and the web app (client) together. No extra packages needed.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const env = path.join(__dirname, 'server', '.env');
if (!fs.existsSync(env)) fs.copyFileSync(path.join(__dirname, 'server', '.env.example'), env);

function run(name, dir, color) {
  const cwd = path.join(__dirname, dir);
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    console.log(`[${name}] installing packages (first run only)...`);
    spawnSync('npm', ['install'], { cwd, stdio: 'inherit', shell: true });
  }
  const child = spawn('npm', ['start'], { cwd, shell: true });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) =>
    out.write(String(d).split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
}

run('api', 'server', 34);
run('web', 'client', 32);
console.log('\nKeep this window open. Press Ctrl+C to stop both.');
console.log('When you see "Local: http://localhost:5173/" open it in your browser. Login: omar@uni.test / password123\n');
