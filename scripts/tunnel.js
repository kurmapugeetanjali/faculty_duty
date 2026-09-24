const { spawn } = require('child_process');
const https = require('https');

console.log('🚀 Starting F.A.S.T High-Availability Mobile Tunnels...');

// 1. Start Cloudflare Tunnel with HTTP2 protocol
function startCloudflare() {
    const cf = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--protocol', 'http2', '--url', 'http://localhost:3000'], {
        shell: true
    });

    cf.stdout.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
            console.log('\n======================================================');
            console.log('🌐 CLOUDFLARE PUBLIC MOBILE LINK (Any Phone / Any Network):');
            console.log(`👉 ${match[0]}`);
            console.log('======================================================\n');
        }
    });

    cf.stderr.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
            console.log('\n======================================================');
            console.log('🌐 CLOUDFLARE PUBLIC MOBILE LINK (Any Phone / Any Network):');
            console.log(`👉 ${match[0]}`);
            console.log('======================================================\n');
        }
    });

    cf.on('close', (code) => {
        console.log(`Cloudflare tunnel exited (${code}). Reconnecting in 3s...`);
        setTimeout(startCloudflare, 3000);
    });
}

// 2. Start LocalTunnel with Auto-Restart
function startLocalTunnel() {
    const lt = spawn('npx', ['-y', 'localtunnel', '--port', '3000'], {
        shell: true
    });

    lt.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text.includes('your url is:')) {
            console.log('\n======================================================');
            console.log('🌐 LOCALTUNNEL BACKUP LINK:');
            console.log(`👉 ${text.replace('your url is:', '').trim()}`);
            console.log('🔑 Tunnel IP Password (if prompted): 106.192.3.187');
            console.log('======================================================\n');
        }
    });

    lt.on('close', (code) => {
        console.log(`Localtunnel exited (${code}). Reconnecting in 3s...`);
        setTimeout(startLocalTunnel, 3000);
    });
}

startCloudflare();
startLocalTunnel();
