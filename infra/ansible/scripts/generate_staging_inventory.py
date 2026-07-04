#!/usr/bin/env python3
"""Generate transient Ansible inventory from AWS EC2 describe-instances JSON."""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
from pathlib import Path
from typing import Any


GATEWAY_ROLES = {
    "gateway-redis-proxy-learning",
    "gateway-redis-proxy-k3s-learning",
}
WORKER_ROLE = "docker-server-worker"


class InventoryError(ValueError):
    """Raised when AWS discovery data cannot produce a safe inventory."""


def _tag(instance: dict[str, Any], key: str) -> str:
    for tag in instance.get("Tags", []):
        if tag.get("Key") == key:
            return str(tag.get("Value", ""))
    return ""


def _sanitize_host_name(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", value.strip()).strip("_").lower()
    return cleaned or fallback


def _load_running_instances(data: dict[str, Any]) -> list[dict[str, Any]]:
    instances: list[dict[str, Any]] = []
    for reservation in data.get("Reservations", []):
        for instance in reservation.get("Instances", []):
            state = instance.get("State", {}).get("Name")
            role = _tag(instance, "Role")
            if state == "running" and role in GATEWAY_ROLES | {WORKER_ROLE}:
                instances.append(instance)
    return instances


def _require_ip(instance: dict[str, Any], field: str, role: str) -> str:
    value = str(instance.get(field) or "").strip()
    if not value:
        instance_id = instance.get("InstanceId", "<unknown>")
        raise InventoryError(f"{role} instance {instance_id} is missing {field}.")
    try:
        ipaddress.ip_address(value)
    except ValueError as exc:
        instance_id = instance.get("InstanceId", "<unknown>")
        raise InventoryError(f"{role} instance {instance_id} has invalid {field}: {value}") from exc
    return value


def _github_env_line(key: str, value: str) -> str:
    if "\n" in value or "\r" in value:
        raise InventoryError(f"Cannot write multiline GitHub environment value for {key}.")
    return f"{key}={value}\n"


def build_inventory(
    data: dict[str, Any],
    *,
    ssh_user: str,
    ssh_port: str,
    ssh_key_file: str,
    known_hosts_file: str,
) -> tuple[dict[str, Any], dict[str, str]]:
    instances = _load_running_instances(data)
    gateways = [instance for instance in instances if _tag(instance, "Role") in GATEWAY_ROLES]
    workers = [instance for instance in instances if _tag(instance, "Role") == WORKER_ROLE]

    if len(gateways) != 1:
        raise InventoryError(f"Expected exactly 1 running gateway instance. Found: {len(gateways)}.")

    if len(workers) < 2:
        raise InventoryError(f"Expected at least 2 running Docker worker instances. Found: {len(workers)}.")

    subnet_ids = {
        str(instance.get("SubnetId", "")).strip()
        for instance in [*gateways, *workers]
        if str(instance.get("SubnetId", "")).strip()
    }
    if len(subnet_ids) != 1:
        raise InventoryError(
            "Gateway and workers are not all in one subnet. "
            f"Discovered subnet IDs: {', '.join(sorted(subnet_ids)) or '<none>'}."
        )

    gateway = gateways[0]
    gateway_public_ip = _require_ip(gateway, "PublicIpAddress", "gateway")
    gateway_private_ip = _require_ip(gateway, "PrivateIpAddress", "gateway")

    workers = sorted(
        workers,
        key=lambda instance: (
            _tag(instance, "Name"),
            str(instance.get("InstanceId", "")),
        ),
    )

    worker_public_ips: list[str] = []
    worker_private_ips: list[str] = []
    gateway_hosts: dict[str, dict[str, Any]] = {}
    worker_hosts_map: dict[str, dict[str, Any]] = {}
    worker_hosts: list[str] = []

    gateway_hosts["gateway"] = {
        "ansible_host": gateway_public_ip,
        "private_ip": gateway_private_ip,
        "role": _tag(gateway, "Role"),
        "instance_id": gateway.get("InstanceId", ""),
    }

    for index, worker in enumerate(workers, start=1):
        public_ip = _require_ip(worker, "PublicIpAddress", "worker")
        private_ip = _require_ip(worker, "PrivateIpAddress", "worker")
        worker_public_ips.append(public_ip)
        worker_private_ips.append(private_ip)

        host_name = _sanitize_host_name(_tag(worker, "Name"), f"worker_{index}")
        if host_name in gateway_hosts or host_name in worker_hosts_map:
            host_name = f"{host_name}_{index}"

        worker_hosts.append(host_name)
        worker_hosts_map[host_name] = {
            "ansible_host": public_ip,
            "private_ip": private_ip,
            "role": _tag(worker, "Role"),
            "instance_id": worker.get("InstanceId", ""),
        }

    ansible_ssh_common_args = (
        f"-o UserKnownHostsFile={known_hosts_file} "
        "-o GlobalKnownHostsFile=/dev/null "
        "-o StrictHostKeyChecking=yes "
        "-o BatchMode=yes "
        "-o ConnectTimeout=20 "
        "-o ConnectionAttempts=3"
    )

    inventory = {
        "all": {
            "vars": {
                "ansible_user": ssh_user,
                "ansible_port": int(ssh_port),
                "ansible_ssh_private_key_file": ssh_key_file,
                "ansible_ssh_common_args": ansible_ssh_common_args,
                "gateway_private_ip": gateway_private_ip,
                "redis_url": f"redis://{gateway_private_ip}:6379",
            },
            "children": {
                "gateway": {"hosts": gateway_hosts},
                "workers": {"hosts": worker_hosts_map},
            },
        },
    }

    env = {
        "GATEWAY_PUBLIC_IP": gateway_public_ip,
        "GATEWAY_PRIVATE_IP": gateway_private_ip,
        "WORKER_PUBLIC_IPS": " ".join(worker_public_ips),
        "WORKER_PRIVATE_IPS": " ".join(worker_private_ips),
        "WORKER_COUNT": str(len(worker_hosts)),
        "STAGING_SUBNET_ID": next(iter(subnet_ids)),
    }

    return inventory, env


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--instances-json", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--ssh-user", required=True)
    parser.add_argument("--ssh-port", required=True)
    parser.add_argument("--ssh-key-file", required=True)
    parser.add_argument("--known-hosts-file", required=True)
    parser.add_argument("--github-env")
    parser.add_argument("--github-summary")
    args = parser.parse_args()

    try:
        data = json.loads(Path(args.instances_json).read_text(encoding="utf-8"))
        inventory, env = build_inventory(
            data,
            ssh_user=args.ssh_user,
            ssh_port=args.ssh_port,
            ssh_key_file=args.ssh_key_file,
            known_hosts_file=args.known_hosts_file,
        )
        Path(args.inventory).write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")

        if args.github_env:
            with Path(args.github_env).open("a", encoding="utf-8") as github_env:
                github_env.write(_github_env_line("ANSIBLE_INVENTORY", args.inventory))
                for key, value in env.items():
                    github_env.write(_github_env_line(key, value))

        if args.github_summary:
            with Path(args.github_summary).open("a", encoding="utf-8") as summary:
                summary.write("## EC2 target discovery\n\n")
                summary.write(f"- Workers found: `{env['WORKER_COUNT']}`\n")
                summary.write(f"- Shared subnet: `{env['STAGING_SUBNET_ID']}`\n")
                summary.write(f"- Gateway public IP: `{env['GATEWAY_PUBLIC_IP']}`\n")
                summary.write(f"- Inventory: `{args.inventory}`\n")

        print(f"Generated Ansible inventory: {args.inventory}")
        print(f"Gateway: {env['GATEWAY_PUBLIC_IP']} ({env['GATEWAY_PRIVATE_IP']})")
        print(f"Workers: {env['WORKER_PUBLIC_IPS']}")
    except (OSError, json.JSONDecodeError, InventoryError, ValueError) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
