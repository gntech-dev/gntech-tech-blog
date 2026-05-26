---
title: Expose One Homelab Service with Cloudflare Tunnel and Compose
description: A practical, low-risk Cloudflare Tunnel pattern for publishing one internal web service without opening router ports.
pubDate: 2026-05-25
updatedDate: 2026-05-25
author: Gerlin Nolasco
tags:
  - cloudflare
  - cloudflare-tunnel
  - homelab
  - networking
  - cloudflared
  - docker
  - compose
category: Infrastructure
draft: false
validated_by: GPT-5.5
risk_level: low
image:
  src: /images/blog/cloudflare-tunnel-docs-how-to.png
  alt: "Official Cloudflare Tunnel diagram showing a private origin connected to Cloudflare through an outbound tunnel."
  caption: "Cloudflare Tunnel reference image from Cloudflare Docs showing how outbound tunnel connectivity reaches a private origin."
  credit: "Cloudflare Docs"
  source: https://github.com/cloudflare/cloudflare-docs/blob/production/src/assets/images/pages/how-to/tunnel.png
  license: "CC BY 4.0"
---

# Expose One Homelab Service with Cloudflare Tunnel and Compose

Estimated reading time: 12 minutes

## Overview

This guide shows a safe pattern for exposing one internal HTTP service through Cloudflare Tunnel using `cloudflared` and `docker compose`.

The goal is simple: make a private service reachable at `https://service.example.com` without opening inbound ports on the router, without depending on a static public IP, and without placing the service directly on the public internet.

Cloudflare Tunnel works by keeping an outbound connection from your server to Cloudflare. Public visitors hit Cloudflare first. Cloudflare then routes the request back through the established tunnel to the local service.

Official references:

- [Cloudflare Tunnel overview](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [cloudflared downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
- [Cloudflare Tunnel configuration file](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [Route traffic to a tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/)

## Why I Built/Tested This

Opening router ports for every homelab service does not scale well. It also creates unnecessary exposure when the service only needs to be reachable by a small number of people.

This pattern is useful for services like:

- Internal dashboards
- Small admin panels
- Documentation sites
- Private Git or automation tools
- Test services that need temporary external access

For a first real blog post, this is also a good end-to-end test for the site itself: it includes commands, a full compose file, a full `cloudflared` config, validation steps, security notes, and enough practical detail for readers to comment on with Giscus.

Important boundary: this article prepares and validates the configuration pattern. It does not claim that a benchmark was run, and it does not claim that these commands were executed against your own Cloudflare account.

## Hardware/Software Used

| Component | Example used in this guide |
| --- | --- |
| Server OS | Debian or Ubuntu Linux |
| Container runtime | Docker Engine with the Compose plugin |
| Tunnel client | `cloudflared` |
| Public DNS | A domain already managed in Cloudflare |
| Local service | Any HTTP service listening on port `8080` |
| Public hostname | `service.example.com` placeholder |

Replace every placeholder before using this in production:

- `service.example.com`
- `<tunnel-name>`
- `<tunnel-uuid>`
- `/home/gntech/tunnels/my-service`
- `http://host.docker.internal:8080` if your origin is somewhere else

## Architecture

```text
Browser / user
    |
    | HTTPS request to service.example.com
    v
Cloudflare DNS and edge
    |
    | Encrypted tunnel traffic over an outbound connection
    v
cloudflared container on the homelab server
    |
    | Local HTTP request
    v
Internal service on 127.0.0.1:8080 or another LAN/internal address
```

No router port forward is required. The tunnel connector dials out to Cloudflare, so the firewall only needs to allow outbound connectivity from the server.

For a single service, I prefer one small tunnel directory per exposed service:

```text
/home/gntech/tunnels/my-service/
├── compose.yml
└── cloudflared/
    ├── config.yml
    └── <tunnel-uuid>.json
```

The JSON credentials file is sensitive. Treat it like a password.

## Installation

Install Docker Engine and the Docker Compose plugin using Docker's official instructions for your distribution.

Verify Docker and Compose are available:

```bash
docker --version
docker compose version
```

Install `cloudflared` locally only for tunnel creation and validation. On Debian or Ubuntu, use Cloudflare's package repository from the official download page:

```bash
sudo mkdir -p /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install cloudflared
```

Verify the install:

```bash
cloudflared version
```

The exact version will vary. That is expected.

## Full Configuration

### 1. Create a tunnel

Authenticate `cloudflared` with your Cloudflare account:

```bash
cloudflared tunnel login
```

Create a named tunnel:

```bash
cloudflared tunnel create <tunnel-name>
```

Example:

```bash
cloudflared tunnel create my-service
```

Cloudflare returns a tunnel UUID and writes a credentials file under:

```text
~/.cloudflared/<tunnel-uuid>.json
```

List tunnels if you need to find the UUID again:

```bash
cloudflared tunnel list
```

### 2. Create the tunnel working directory

```bash
mkdir -p /home/gntech/tunnels/my-service/cloudflared
cp ~/.cloudflared/<tunnel-uuid>.json /home/gntech/tunnels/my-service/cloudflared/<tunnel-uuid>.json
chmod 600 /home/gntech/tunnels/my-service/cloudflared/<tunnel-uuid>.json
cd /home/gntech/tunnels/my-service
```

Do not commit this directory to a public repository. It contains tunnel credentials.

### 3. Route DNS to the tunnel

Create the Cloudflare DNS route:

```bash
cloudflared tunnel route dns <tunnel-name> service.example.com
```

Example:

```bash
cloudflared tunnel route dns my-service service.example.com
```

This creates a proxied CNAME record that points the hostname to the tunnel.

### 4. Create the cloudflared config

Create `/home/gntech/tunnels/my-service/cloudflared/config.yml`:

```bash
cat > /home/gntech/tunnels/my-service/cloudflared/config.yml <<'EOF'
tunnel: <tunnel-uuid>
credentials-file: /etc/cloudflared/<tunnel-uuid>.json

# QUIC is the default protocol. If UDP is blocked on your network,
# change this to http2.
protocol: quic

ingress:
  - hostname: service.example.com
    service: http://host.docker.internal:8080

  # Always keep a final catch-all rule.
  - service: http_status:404
EOF
```

Why `host.docker.internal`? In this compose file, `cloudflared` runs inside a container while the target service is assumed to be listening on the Docker host at `127.0.0.1:8080`. The compose file below maps `host.docker.internal` to the Linux host gateway.

If the target service is another container on the same Compose network, use the service name instead, for example:

```yaml
service: http://app:8080
```

Validate the ingress rules before running the tunnel:

```bash
cloudflared tunnel --config /home/gntech/tunnels/my-service/cloudflared/config.yml ingress validate
cloudflared tunnel --config /home/gntech/tunnels/my-service/cloudflared/config.yml ingress rule https://service.example.com
```

### 5. Create the Compose file

Create `/home/gntech/tunnels/my-service/compose.yml`:

```bash
cat > /home/gntech/tunnels/my-service/compose.yml <<'EOF'
services:
  tunnel:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-my-service
    restart: unless-stopped
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared:/etc/cloudflared:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - tunnel-net

networks:
  tunnel-net:
    driver: bridge
EOF
```

This compose file exposes no ports. The connector only makes outbound connections to Cloudflare.

Validate the Compose file syntax:

```bash
docker compose -f /home/gntech/tunnels/my-service/compose.yml config
```

Start the tunnel:

```bash
cd /home/gntech/tunnels/my-service
docker compose up -d
```

Check logs:

```bash
docker compose logs tunnel --tail=50
```

Look for a message similar to:

```text
Registered tunnel connection
```

Do not paste tunnel tokens or credentials into chat, screenshots, GitHub issues, or blog comments.

## Verification

Use these checks before calling the service ready.

Check the local origin first:

```bash
curl -I http://127.0.0.1:8080
```

Expected result: an HTTP response from your internal service. The status code depends on the app.

Check that the `cloudflared` config is valid:

```bash
cloudflared tunnel --config /home/gntech/tunnels/my-service/cloudflared/config.yml ingress validate
```

Check which rule matches the public hostname:

```bash
cloudflared tunnel --config /home/gntech/tunnels/my-service/cloudflared/config.yml ingress rule https://service.example.com
```

Check the container:

```bash
docker compose ps
docker compose logs tunnel --tail=50
```

Check the public hostname from outside the LAN:

```bash
curl -I https://service.example.com
```

Useful response headers include:

```text
server: cloudflare
cf-ray: <ray-id>
```

Finally, confirm that the router is not exposing the origin directly. From a machine outside the LAN, scan only the ports you expect to be closed:

```bash
nmap -Pn -p 80,443,8080 <your-public-ip>
```

Expected result: no direct open port for the internal service. Do not run broad scans against networks you do not own.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Public hostname returns Cloudflare 502 | `cloudflared` cannot reach the local service | Test `curl -I http://127.0.0.1:8080` on the host and confirm the `service:` URL in `config.yml` |
| Tunnel container exits immediately | Bad config path or missing credentials file | Run `docker compose logs tunnel --tail=100` and verify the mounted `/etc/cloudflared` files |
| `cloudflared tunnel ingress validate` fails | Missing final catch-all rule or invalid YAML | Add `- service: http_status:404` as the final ingress rule and fix indentation |
| QUIC connection fails | UDP is blocked by the network | Change `protocol: quic` to `protocol: http2` and restart the container |
| DNS route does not work | Hostname was not routed to the tunnel | Run `cloudflared tunnel route dns <tunnel-name> service.example.com` again, or check the Cloudflare DNS dashboard |
| Works locally but not externally | Cloudflare Access, app auth, or origin firewall is blocking the request | Check Cloudflare Zero Trust policies, app logs, and local firewall rules |

If you change the config, restart the tunnel:

```bash
cd /home/gntech/tunnels/my-service
docker compose restart tunnel
```

## Security Notes

Risk level: low, if the tunnel is configured carefully.

Important security checks:

- Keep the tunnel credentials file private: `chmod 600 /home/gntech/tunnels/my-service/cloudflared/<tunnel-uuid>.json`.
- Do not commit `cloudflared/<tunnel-uuid>.json` to Git.
- Keep the final catch-all ingress rule: `- service: http_status:404`.
- Do not expose the origin service on `0.0.0.0` unless LAN access is intentional.
- Add Cloudflare Access for admin panels or private apps.
- Keep the app's own authentication enabled. Cloudflare Tunnel is not a replacement for app-level auth.
- Review request logging before exposing sensitive services.
- Use separate tunnels or separate configs for services with different risk profiles.
- Document rollback before making DNS changes.

Rollback steps:

```bash
cd /home/gntech/tunnels/my-service
docker compose down
cloudflared tunnel route dns delete <tunnel-name> service.example.com
```

If you want to remove the tunnel entirely, confirm that no other hostname uses it, then run:

```bash
cloudflared tunnel delete <tunnel-name>
```

That deletion is destructive for the tunnel, so do it only after checking `cloudflared tunnel list` and Cloudflare DNS.

## Performance Notes

No benchmark was run for this article.

Expected practical behavior:

- A tunnel adds an extra network hop through Cloudflare.
- QUIC usually works well when outbound UDP is allowed.
- HTTP/2 is often more reliable on restrictive networks because it uses TCP.
- This pattern is appropriate for dashboards, APIs, admin tools, and lightweight web apps.
- I would not assume it is ideal for high-bitrate media streaming without testing your own workload.

If performance matters, measure it with your own service and document the test method clearly. A useful starting point is:

```bash
curl -o /dev/null -s -w 'dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} total=%{time_total}\n' https://service.example.com
```

Run the same test locally against the origin and compare the difference.

## Lessons Learned

The safest Cloudflare Tunnel setups are boring:

- One hostname maps to one intended origin.
- The config has a final 404 catch-all rule.
- Credentials stay outside Git.
- Docker Compose exposes no unnecessary ports.
- The local app is verified before debugging Cloudflare.
- Public DNS is changed only after the local config validates.

The most common mistake is debugging Cloudflare first when the local service is not responding. Start with `curl -I http://127.0.0.1:8080`, then validate `cloudflared`, then test public DNS.

## Future Improvements

Good follow-up improvements:

- Add Cloudflare Access to require SSO or one-time PIN login before reaching the app.
- Pin the `cloudflare/cloudflared` image to a specific version and update it intentionally.
- Export `cloudflared` metrics to Prometheus.
- Add Uptime Kuma monitoring for the public hostname.
- Add a second connector on another host for higher availability.
- Document the exact rollback path in the service runbook.
