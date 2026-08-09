#!/usr/bin/env node
/**
 * Serves Metro to the tailnet only.
 *
 * Metro is started with --host localhost so it binds loopback; nobody can
 * reach it off the machine. This proxy listens on the Tailscale interface
 * (100.64.0.0/10) and forwards every byte to the loopback Metro, so only
 * devices on the tailnet can load the bundle. Raw TCP, so HTTP, HMR and the
 * message socket all pass through untouched.
 */
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const TAILNET_PORT = 8081;
const METRO_TARGET = { host: 'localhost', port: 8081 };

function isTailnetIp(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

function tailnetHost() {
  const pinned = process.env.HOST;
  if (pinned) return pinned;
  try {
    const out = execFileSync('tailscale', ['ip', '-4'], { timeout: 5000 }).toString();
    const first = out.trim().split(/\s+/)[0];
    if (first && isTailnetIp(first)) return first;
  } catch {
    throw new Error('no Tailscale IPv4 found — cannot serve Metro outside the tailnet');
  }
  throw new Error('no Tailscale IPv4 found — cannot serve Metro outside the tailnet');
}

const host = tailnetHost();

const server = net.createServer((client) => {
  const upstream = net.connect(METRO_TARGET, () => {
    client.pipe(upstream);
    upstream.pipe(client);
  });
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
});

server.listen(TAILNET_PORT, host, () => {
  console.log(
    `Metro tailnet proxy on ${host}:${TAILNET_PORT} -> ${METRO_TARGET.host}:${METRO_TARGET.port}`,
  );
});
