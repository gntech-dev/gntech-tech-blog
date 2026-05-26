---
title: Debian and Ubuntu Server Hardening Baseline for Homelab Servers
description: A practical Debian and Ubuntu hardening guide for SSH, sudo, firewall rules, automatic security updates, fail2ban, auditd, sysctl, backups, verification, and rollback.
pubDate: 2026-05-25
updatedDate: 2026-05-26
author: Gerlin Nolasco
tags:
  - linux
  - debian
  - ubuntu
  - security
  - hardening
  - ssh
  - firewall
  - fail2ban
  - auditd
  - homelab
category: Linux
draft: false
validated_by: GPT-5.5
risk_level: high
image:
  src: /images/blog/debian-ubuntu-hardening-reference.png
  alt: "Original GNTECH diagram showing a Linux server protected by layered hardening controls for updates, SSH, firewall, rate limiting, and audit logging."
  caption: "Layered hardening reference diagram for the Debian and Ubuntu baseline used in this guide."
  credit: "GNTECH"
  source: https://github.com/gntech-dev/gntech-tech-blog
  license: "GNTECH original"
---

# Debian and Ubuntu Server Hardening Baseline for Homelab Servers

Estimated reading time: 20 minutes

## Overview

This guide is a practical hardening baseline for Debian and Ubuntu servers used in a homelab, small office, or self-hosted environment.

The goal is not to make a server magically secure. The goal is to reduce the easy risks first: weak SSH exposure, missing security updates, unclear sudo access, no firewall defaults, no rate limiting, and no audit trail when something changes.

This baseline covers:

- Security updates with `unattended-upgrades`
- SSH hardening without locking yourself out
- Sudo defaults and admin group control
- UFW firewall defaults for IPv4 and IPv6
- fail2ban for SSH rate limiting
- auditd rules for high-value system changes
- sysctl network hardening
- Backup and rollback steps before risky changes
- Verification commands after each layer

Risk level: high. SSH and firewall changes can lock you out if applied blindly. Keep a console, out-of-band access, Proxmox console, IPMI, or a second SSH session open before changing access controls.

Official references used while preparing this guide:

- [Debian security information](https://www.debian.org/security/)
- [Ubuntu security documentation](https://ubuntu.com/security)
- [OpenSSH server manual](https://man.openbsd.org/sshd_config)
- [Ubuntu server firewall documentation](https://documentation.ubuntu.com/server/how-to/security/firewalls/)
- [fail2ban documentation](https://github.com/fail2ban/fail2ban/wiki)
- [Linux audit userspace project](https://github.com/linux-audit/audit-userspace)

## Why I Built/Tested This

Most hardening guides are either too generic or too aggressive. Some disable services without explaining the rollback path. Others copy enterprise settings into a homelab and break Docker networking, remote management, backup agents, or monitoring exporters.

For GNTECH-style infrastructure, I want a baseline that is boring, readable, and reversible:

- Safe enough for internet-adjacent servers
- Clear enough to review line by line
- Practical for Proxmox VMs, bare-metal Linux servers, and small cloud instances
- Compatible with Docker hosts, Cloudflare Tunnel endpoints, monitoring agents, and normal sysadmin work
- Honest about what is not tested on the reader's machine

This post does not claim that every command was executed against your server. Treat it as a validated configuration pattern. Apply it in stages, verify each stage, and keep rollback paths ready.

## Hardware/Software Used

Reference targets for this guide:

| Component | Baseline assumption |
| --- | --- |
| Operating system | Debian 12 or Ubuntu 22.04/24.04 server |
| Access method | SSH with a sudo-capable admin user |
| Firewall tool | UFW, backed by nftables on modern Debian/Ubuntu |
| Rate limiting | fail2ban using systemd journal or auth log backend |
| Audit logging | auditd and audit rules under `/etc/audit/rules.d/` |
| Update automation | unattended-upgrades |
| Console fallback | Proxmox console, provider console, IPMI, or local keyboard/monitor |

Do not start by applying this to your only production server over a fragile remote connection. Test the workflow on a VM first.

## Architecture

The baseline is layered. Each layer should be applied and verified before moving to the next one.

```text
Internet / LAN clients
        |
        v
[Firewall defaults]
        |
        v
[SSH access policy] ---- [fail2ban rate limiting]
        |
        v
[sudo and admin groups]
        |
        v
[security updates + sysctl]
        |
        v
[audit logs + backup/rollback]
```

Recommended order:

1. Create a rollback point.
2. Confirm your admin user and SSH key work.
3. Install required packages.
4. Configure automatic security updates.
5. Harden SSH and verify syntax before reload.
6. Configure firewall defaults and allow required ports before enabling.
7. Enable fail2ban for SSH.
8. Add auditd rules.
9. Apply sysctl hardening.
10. Run the full verification checklist.

The order matters. A firewall rule before an SSH allow rule can lock you out. SSH hardening before key verification can lock you out. Audit rules before log rotation can fill disks on chatty systems.

## Installation

Start with a package refresh and install the baseline tools.

```bash
sudo apt update
sudo apt install -y \
  openssh-server \
  ufw \
  fail2ban \
  auditd \
  audispd-plugins \
  unattended-upgrades \
  needrestart \
  debsums
```

I intentionally leave rootkit scanners and antivirus tools out of the baseline. They can be useful in specific environments, but they also create noise and false positives. Add them later if you have a monitoring process for their findings.

Check the installed tools:

```bash
ssh -V
sudo ufw version
fail2ban-client -V
sudo auditctl -s
sudo unattended-upgrades --help >/dev/null
```

If this is a remote server, open a second SSH session now and keep it open until every access-control change is verified.

## Full Configuration

### 1. Create a rollback bundle first

Before changing SSH, sudo, firewall, or audit rules, save the current configuration.

```bash
sudo mkdir -p /root/hardening-backup-$(date +%F)
BACKUP_DIR="/root/hardening-backup-$(date +%F)"

sudo cp -a /etc/ssh "$BACKUP_DIR/ssh"
sudo cp -a /etc/sudoers "$BACKUP_DIR/sudoers"
sudo cp -a /etc/sudoers.d "$BACKUP_DIR/sudoers.d"
sudo cp -a /etc/ufw "$BACKUP_DIR/ufw"
sudo cp -a /etc/fail2ban "$BACKUP_DIR/fail2ban"
sudo cp -a /etc/audit "$BACKUP_DIR/audit"
sudo cp -a /etc/sysctl.conf "$BACKUP_DIR/sysctl.conf" 2>/dev/null || true
sudo cp -a /etc/sysctl.d "$BACKUP_DIR/sysctl.d" 2>/dev/null || true

sudo tar -C /root -czf "/root/hardening-backup-$(date +%F).tar.gz" "$(basename "$BACKUP_DIR")"
sudo chmod 600 "/root/hardening-backup-$(date +%F).tar.gz"
```

Rollback example:

```bash
sudo tar -C /root -xzf /root/hardening-backup-YYYY-MM-DD.tar.gz
sudo cp -a /root/hardening-backup-YYYY-MM-DD/ssh /etc/ssh
sudo cp -a /root/hardening-backup-YYYY-MM-DD/sudoers /etc/sudoers
sudo cp -a /root/hardening-backup-YYYY-MM-DD/sudoers.d /etc/sudoers.d
sudo sshd -t
sudo systemctl reload ssh
```

Do not delete the backup bundle until the server has survived a reboot and you have verified access.

### 2. Confirm the admin user and SSH key

Replace `gerlin` with your real admin username.

```bash
id gerlin
sudo getent group sudo
sudo usermod -aG sudo gerlin
```

Verify the admin user has an SSH public key:

```bash
sudo install -d -m 700 -o gerlin -g gerlin /home/gerlin/.ssh
sudo test -s /home/gerlin/.ssh/authorized_keys
sudo chmod 700 /home/gerlin/.ssh
sudo chmod 600 /home/gerlin/.ssh/authorized_keys
sudo chown -R gerlin:gerlin /home/gerlin/.ssh
```

Before disabling password authentication, test a new login from your workstation:

```bash
ssh -o PreferredAuthentications=publickey gerlin@server.example.com
```

Do not continue unless that key-based login works.

### 3. Configure unattended security updates

Create `/etc/apt/apt.conf.d/20auto-upgrades`:

```ini
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
```

Create `/etc/apt/apt.conf.d/52gntech-security-upgrades`:

```ini
Unattended-Upgrade::Allowed-Origins {
        "${distro_id}:${distro_codename}-security";
        "${distro_id}ESMApps:${distro_codename}-apps-security";
        "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::Package-Blacklist {
};

Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
```

I do not blacklist kernels by default here. Kernel security updates matter. On ZFS, GPU passthrough, or special storage hosts, you may decide to pin kernel packages and apply them manually during a maintenance window, but that should be a conscious host-specific exception.

Verify with a dry run:

```bash
sudo unattended-upgrades --dry-run --debug
systemctl status unattended-upgrades --no-pager
```

### 4. Harden SSH safely

Create `/etc/ssh/sshd_config.d/99-gntech-hardening.conf`:

```text
# GNTECH baseline SSH hardening.
# Verify with: sudo sshd -t

PermitRootLogin prohibit-password
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
AuthenticationMethods publickey

MaxAuthTries 3
MaxSessions 4
LoginGraceTime 30
MaxStartups 3:50:10

X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding yes
PermitTunnel no
GatewayPorts no

ClientAliveInterval 300
ClientAliveCountMax 2

LogLevel VERBOSE
```

Notes:

- `PermitRootLogin prohibit-password` still allows root login by key. If you never need root SSH, use `PermitRootLogin no` after confirming your sudo user works.
- I do not force a custom cipher list in the baseline. OpenSSH defaults are actively maintained, and overly strict lists can break older automation clients. Audit crypto policy separately if you have compliance requirements.
- `AllowTcpForwarding yes` is kept because many admins use SSH tunnels for emergency maintenance. Set it to `no` on servers where forwarding is not needed.

Validate before reload:

```bash
sudo sshd -t
sudo systemctl reload ssh
```

From your workstation, open a fresh SSH connection:

```bash
ssh gerlin@server.example.com
```

If the fresh login fails, keep your existing session open and rollback the SSH drop-in file:

```bash
sudo mv /etc/ssh/sshd_config.d/99-gntech-hardening.conf /root/99-gntech-hardening.conf.disabled
sudo sshd -t
sudo systemctl reload ssh
```

### 5. Set sudo defaults

Use `visudo` for sudo files. Do not edit sudoers files with a normal editor without syntax checking.

Create `/etc/sudoers.d/99-gntech-hardening` with:

```text
Defaults        env_reset
Defaults        mail_badpass
Defaults        secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Defaults        timestamp_timeout=5
Defaults        passwd_timeout=1
Defaults        logfile="/var/log/sudo.log"
Defaults        log_input,log_output
Defaults        iolog_dir="/var/log/sudo-io"

%sudo   ALL=(ALL:ALL) ALL
```

Apply safely:

```bash
sudo visudo -cf /etc/sudoers.d/99-gntech-hardening
sudo install -d -m 700 /var/log/sudo-io
```

Verify:

```bash
sudo -k
sudo -v
sudo tail -n 20 /var/log/sudo.log 2>/dev/null || true
```

If sudo breaks, use console access and remove the drop-in:

```bash
rm -f /etc/sudoers.d/99-gntech-hardening
visudo -c
```

### 6. Configure UFW firewall defaults

Decide which services should be reachable before enabling the firewall. For a normal SSH-managed server, allow SSH first.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH management'
```

If the server hosts web traffic directly, add only what you need:

```bash
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
```

If management should only come from a VPN or LAN subnet, use a source allow rule instead of a world-open SSH rule:

```bash
sudo ufw delete allow 22/tcp
sudo ufw allow from 10.10.0.0/16 to any port 22 proto tcp comment 'SSH from VPN or management LAN'
```

Enable IPv6 support in `/etc/default/ufw`:

```ini
IPV6=yes
```

Enable UFW only after the SSH allow rule exists:

```bash
sudo ufw status verbose
sudo ufw enable
sudo ufw status numbered
```

Rollback:

```bash
sudo ufw disable
```

### 7. Enable fail2ban for SSH

Create `/etc/fail2ban/jail.d/sshd.local`:

```ini
[sshd]
enabled = true
port = ssh
filter = sshd
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
ignoreip = 127.0.0.1/8 ::1
```

If you have a trusted management subnet, add it to `ignoreip`:

```ini
ignoreip = 127.0.0.1/8 ::1 10.10.0.0/16
```

Restart and verify:

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

Rollback:

```bash
sudo systemctl stop fail2ban
sudo rm -f /etc/fail2ban/jail.d/sshd.local
sudo systemctl start fail2ban
```

### 8. Add auditd rules for high-value changes

Create `/etc/audit/rules.d/99-gntech-hardening.rules`:

```text
-D

# Identity and authentication changes
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/gshadow -p wa -k identity
-w /etc/security/opasswd -p wa -k identity

# Sudo and privilege changes
-w /etc/sudoers -p wa -k sudoers
-w /etc/sudoers.d/ -p wa -k sudoers
-w /var/log/sudo.log -p wa -k sudo-log

# SSH configuration and authorized keys
-w /etc/ssh/sshd_config -p wa -k sshd-config
-w /etc/ssh/sshd_config.d/ -p wa -k sshd-config
-w /root/.ssh/ -p wa -k root-ssh

# Package management activity
-w /usr/bin/apt -p x -k package-management
-w /usr/bin/apt-get -p x -k package-management
-w /usr/bin/dpkg -p x -k package-management

# Kernel module loading and unloading
-a always,exit -F arch=b64 -S init_module,finit_module,delete_module -k kernel-modules
-a always,exit -F arch=b32 -S init_module,delete_module -k kernel-modules
```

Load and verify:

```bash
sudo augenrules --load
sudo auditctl -s
sudo auditctl -l
```

Search audit events by key:

```bash
sudo ausearch -k sshd-config
sudo ausearch -k sudoers
sudo ausearch -k package-management
```

Rollback:

```bash
sudo rm -f /etc/audit/rules.d/99-gntech-hardening.rules
sudo augenrules --load
```

### 9. Apply sysctl network hardening

Create `/etc/sysctl.d/99-gntech-hardening.conf`:

```ini
# Ignore ICMP redirects and source-routed packets.
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# Do not send redirects from this host unless it is intentionally routing.
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Log suspicious martian packets on IPv4.
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# Reverse path filtering for normal single-homed servers.
# Use mode 2 or disable selectively on routers, VPN gateways, asymmetric routing, or multi-WAN hosts.
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# SYN flood protection.
net.ipv4.tcp_syncookies = 1

# Reduce information exposure.
kernel.kptr_restrict = 1
kernel.dmesg_restrict = 1

# Core dump hardening.
fs.suid_dumpable = 0
```

Apply:

```bash
sudo sysctl --system
```

Important network note: do not apply strict reverse path filtering blindly on routers, WireGuard gateways, multi-WAN hosts, or asymmetric routing designs. Those systems may need `rp_filter = 2` or interface-specific exceptions.

Rollback:

```bash
sudo rm -f /etc/sysctl.d/99-gntech-hardening.conf
sudo sysctl --system
```

### 10. Optional service account pattern

For application services, avoid running everything as your admin user.

Example for a non-login service account:

```bash
sudo useradd --system --home /var/lib/myapp --create-home --shell /usr/sbin/nologin myapp
sudo install -d -o myapp -g myapp -m 750 /var/lib/myapp
sudo install -d -o myapp -g myapp -m 750 /var/log/myapp
```

If the service needs access to a specific directory, grant that directory only:

```bash
sudo chown -R myapp:myapp /srv/myapp-data
sudo chmod 750 /srv/myapp-data
```

Do not add service accounts to `sudo`, `docker`, or broad admin groups unless there is a specific reason.

## Verification

Run these checks after applying the baseline.

### SSH

```bash
sudo sshd -t
sudo systemctl status ssh --no-pager
ssh -o PreferredAuthentications=publickey gerlin@server.example.com
```

Password login should fail from a test client:

```bash
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no gerlin@server.example.com
```

### Sudo

```bash
sudo visudo -c
sudo -k
sudo -v
sudo test -d /var/log/sudo-io
```

### Firewall

```bash
sudo ufw status verbose
sudo ufw status numbered
```

From another machine, test only the ports you expect to expose:

```bash
nmap -Pn -p 22,80,443 server.example.com
```

### fail2ban

```bash
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

### auditd

```bash
sudo auditctl -s
sudo auditctl -l
sudo ausearch -k sudoers | tail -n 20
```

### sysctl

```bash
sysctl net.ipv4.tcp_syncookies
sysctl net.ipv4.conf.all.accept_redirects
sysctl net.ipv6.conf.all.accept_redirects
sysctl kernel.dmesg_restrict
```

### Updates

```bash
sudo unattended-upgrades --dry-run --debug
systemctl status unattended-upgrades --no-pager
```

### Package integrity spot check

```bash
sudo debsums -s
```

No output from `debsums -s` usually means no modified package files were reported. Review any output before assuming compromise; local config changes and admin modifications can create expected differences.

## Troubleshooting

| Symptom | Likely cause | Safe fix |
| --- | --- | --- |
| New SSH login fails | Key auth not working or SSH drop-in invalid | Keep old session open, run `sudo sshd -t`, move the drop-in out of `/etc/ssh/sshd_config.d/`, reload SSH |
| UFW enabled and SSH stopped working | SSH allow rule missing or source subnet wrong | Use console access, run `sudo ufw disable`, correct rules, then re-enable |
| fail2ban banned your own IP | `ignoreip` missing your VPN/LAN subnet | Use console or another IP, run `sudo fail2ban-client set sshd unbanip YOUR_IP`, update `ignoreip` |
| Docker or VPN traffic breaks after sysctl | Reverse path filtering too strict | Set `rp_filter = 2` or add interface-specific exceptions |
| audit logs grow too quickly | Rules are too broad for the host | Remove noisy watches, tune audit log rotation, verify disk space alerts |
| unattended-upgrades wants to restart services | Package update touched shared libraries | Use `needrestart` output to plan manual service restarts |
| sudo prompts too often | `timestamp_timeout` is short | Increase `timestamp_timeout` after deciding the convenience/security trade-off |
| IPv6 behaves unexpectedly | UFW IPv6 setting or router advertisements conflict | Confirm `/etc/default/ufw`, UFW status, and network manager settings |

## Security Notes

This baseline helps with common operational risks, but it is not a full security program.

It does not replace:

- Backups with restore tests
- Vulnerability management
- Secrets management
- Centralized logging
- Endpoint detection
- Network segmentation
- Application-specific hardening
- Physical security

High-risk warnings:

- SSH and firewall changes can lock you out. Keep console access available.
- Do not disable password login until key login is verified from a new session.
- Do not restrict SSH by source IP unless your management IP or VPN range is stable.
- Do not enable strict sysctl routing settings blindly on routers, VPN gateways, or multi-homed systems.
- Do not add service users to the `docker` group unless you accept that Docker group membership is effectively root-equivalent.
- Do not treat fail2ban as a substitute for key-only SSH. It is a rate limiter, not an authentication control.

For internet-facing admin interfaces, prefer a VPN, Cloudflare Access, Tailscale, WireGuard, or a management VLAN instead of exposing SSH to the whole internet.

## Performance Notes

No benchmark was run for this article, so there are no measured performance numbers to report.

Expected operational impact:

- UFW rules have negligible overhead for normal homelab traffic.
- fail2ban watches authentication logs and is usually lightweight, but noisy logs can increase CPU usage.
- auditd overhead depends on rule volume. The rules in this guide focus on high-value files and package/module activity instead of tracing every command.
- `debsums` can read many files and may touch disk heavily during a scan. Run it manually or during low-traffic periods.
- unattended-upgrades can temporarily increase CPU, disk, and network usage while packages are downloaded and installed.

If a host is latency-sensitive, apply one layer at a time and monitor CPU, disk I/O, journal volume, and service latency before adding the next layer.

## Lessons Learned

Hardening is safer when it is boring and reversible.

My practical rules:

1. Make one access-control change at a time.
2. Keep a second SSH session open.
3. Validate syntax before reloading services.
4. Keep console access available for SSH and firewall changes.
5. Prefer small drop-in files over editing large default configs.
6. Record why a rule exists, not just what it does.
7. Avoid compliance cargo-cult settings unless you understand the operational impact.
8. Test rollback steps before you need them.

A hardening guide that nobody can operate will eventually be bypassed. The best baseline is one you can maintain calmly during a real outage.

## Future Improvements

Good next steps after this baseline:

- Add centralized logs to Loki, Elasticsearch, or another SIEM-style target.
- Add Prometheus node exporter and alerts for disk, CPU, service health, and failed SSH attempts.
- Create an Ansible role so the baseline is repeatable across servers.
- Add AppArmor profile review for exposed services.
- Add WireGuard or Tailscale for management-plane access.
- Add tested backup and restore documentation per service.
- Add CIS Benchmark comparison notes, clearly marked as a comparison and not as a certification claim.
- Add a Proxmox-specific variant for LXC containers and VM templates.
