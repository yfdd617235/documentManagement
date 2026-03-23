const { spawn } = require('child_process');

const proc = spawn('npx.cmd', ['vercel', 'env', 'add', 'VERTEX_AI_LOCATION', 'production'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true
});

// Write the value without newlines
proc.stdin.write('europe-west4');
proc.stdin.end();

proc.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});
