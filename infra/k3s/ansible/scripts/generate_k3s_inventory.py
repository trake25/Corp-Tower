#!/usr/bin/env python3
"""Generate a temporary Ansible inventory for the isolated K3s lab."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


EXPECTED_ROLES = {
    "k3s-gateway": "gateway",
    "k3s-control-plane": "k3s_server",
    "k3s-agent": "k3s_agents",
}


def tag(instance: dict, key: str) -> str:
    for item in instance.get("Tags", []):
        if item.get("Key") == key:
            return item.get("Value", "")
    return ""


def hostname(value: str, fallback: str) -> str:
    raw = value or fallback
    normalized = re.sub(r"[^A-Za-z0-9_]+", "-", raw).strip("-").lower()
    return normalized or fallback


def flatten_instances(payload: dict) -> list[dict]:
    instances: list[dict] = []
    for reservation in payload.get("Reservations", []):
        instances.extend(reservation.get("Instances", []))
    return instances


def require_address(instance: dict, field: str, name: str) -> str:
    value = instance.get(field)
    if not value:
        raise SystemExit(f"Missing {field} for {name}.")
    return value


def write_github_env(path: Path | None, values: dict[str, str]) -> None:
    if not path:
        return
    with path.open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def write_summary(path: Path | None, gateway: dict, server: dict, agents: list[dict]) -> None:
    if not path:
        return
    with path.open("a", encoding="utf-8") as handle:
        handle.write("## K3s lab inventory\n\n")
        handle.write(f"- Gateway: `{gateway['name']}` `{gateway['public_ip']}` private `{gateway['private_ip']}`\n")
        handle.write(f"- Control plane: `{server['name']}` private `{server['private_ip']}`\n")
        handle.write("- Agents:\n")
        for agent in agents:
            handle.write(f"  - `{agent['name']}` private `{agent['private_ip']}`\n")


def build_inventory(args: argparse.Namespace, payload: dict) -> tuple[dict, dict[str, str]]:
    grouped = {role: [] for role in EXPECTED_ROLES}

    for instance in flatten_instances(payload):
        role = tag(instance, "Role")
        group = EXPECTED_ROLES.get(role)
        if group:
            grouped[role].append(instance)

    gateways = grouped["k3s-gateway"]
    servers = grouped["k3s-control-plane"]
    agents = grouped["k3s-agent"]

    if len(gateways) != 1:
        raise SystemExit(f"Expected exactly 1 k3s-gateway instance, found {len(gateways)}.")
    if len(servers) != 1:
        raise SystemExit(f"Expected exactly 1 k3s-control-plane instance, found {len(servers)}.")
    if len(agents) < 1:
        raise SystemExit("Expected at least 1 k3s-agent instance.")

    agents = sorted(agents, key=lambda item: tag(item, "Name") or item.get("PrivateIpAddress", ""))

    gateway_instance = gateways[0]
    server_instance = servers[0]

    gateway_name = tag(gateway_instance, "Name") or gateway_instance.get("InstanceId", "k3s-gateway")
    gateway_public_ip = require_address(gateway_instance, "PublicIpAddress", gateway_name)
    gateway_private_ip = require_address(gateway_instance, "PrivateIpAddress", gateway_name)
    server_name = tag(server_instance, "Name") or server_instance.get("InstanceId", "k3s-control-plane")
    server_private_ip = require_address(server_instance, "PrivateIpAddress", server_name)

    proxy_command = (
        f"ssh -i {args.ssh_key_file} "
        f"-p {args.ssh_port} "
        "-o BatchMode=yes "
        "-o ConnectTimeout=20 "
        f"-o UserKnownHostsFile={args.known_hosts_file} "
        "-o GlobalKnownHostsFile=/dev/null "
        "-o StrictHostKeyChecking=yes "
        f"-W %h:%p {args.ssh_user}@{gateway_public_ip}"
    )
    private_ssh_args = (
        f"-o ProxyCommand=\"{proxy_command}\" "
        f"-o UserKnownHostsFile={args.known_hosts_file} "
        "-o GlobalKnownHostsFile=/dev/null "
        "-o StrictHostKeyChecking=yes"
    )

    gateway_host = hostname(gateway_name, "k3s-gateway")
    server_host = hostname(server_name, "k3s-control-plane")

    inventory = {
        "all": {
            "vars": {
                "ansible_user": args.ssh_user,
                "ansible_port": int(args.ssh_port),
                "ansible_ssh_private_key_file": args.ssh_key_file,
                "ansible_python_interpreter": "/usr/bin/python3",
            },
            "children": {
                "gateway": {"hosts": {}},
                "k3s_server": {"hosts": {}},
                "k3s_agents": {"hosts": {}},
            },
        }
    }

    inventory["all"]["children"]["gateway"]["hosts"][gateway_host] = {
        "ansible_host": gateway_public_ip,
        "private_ip": gateway_private_ip,
        "public_ip": gateway_public_ip,
        "node_name": gateway_host,
    }

    inventory["all"]["children"]["k3s_server"]["hosts"][server_host] = {
        "ansible_host": server_private_ip,
        "ansible_ssh_common_args": private_ssh_args,
        "private_ip": server_private_ip,
        "node_name": server_host,
    }

    agent_private_ips = []
    for index, instance in enumerate(agents, start=1):
        name = tag(instance, "Name") or instance.get("InstanceId", f"k3s-agent-{index}")
        private_ip = require_address(instance, "PrivateIpAddress", name)
        agent_host = hostname(name, f"k3s-agent-{index}")
        inventory["all"]["children"]["k3s_agents"]["hosts"][agent_host] = {
            "ansible_host": private_ip,
            "ansible_ssh_common_args": private_ssh_args,
            "private_ip": private_ip,
            "node_name": agent_host,
        }
        agent_private_ips.append(private_ip)

    all_node_private_ips = [server_private_ip, *agent_private_ips]
    env_values = {
        "ANSIBLE_INVENTORY": str(args.inventory),
        "GATEWAY_PUBLIC_IP": gateway_public_ip,
        "GATEWAY_PRIVATE_IP": gateway_private_ip,
        "CONTROL_PLANE_PRIVATE_IP": server_private_ip,
        "K3S_AGENT_PRIVATE_IPS": " ".join(agent_private_ips),
        "K3S_NODE_PRIVATE_IPS": " ".join(all_node_private_ips),
    }

    summary_gateway = {"name": gateway_name, "public_ip": gateway_public_ip, "private_ip": gateway_private_ip}
    summary_server = {"name": server_name, "private_ip": server_private_ip}
    summary_agents = [
        {"name": tag(instance, "Name") or instance.get("InstanceId", ""), "private_ip": ip}
        for instance, ip in zip(agents, agent_private_ips)
    ]
    write_summary(args.github_summary, summary_gateway, summary_server, summary_agents)

    return inventory, env_values


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--instances-json", required=True, type=Path)
    parser.add_argument("--inventory", required=True, type=Path)
    parser.add_argument("--ssh-user", required=True)
    parser.add_argument("--ssh-port", required=True)
    parser.add_argument("--ssh-key-file", required=True)
    parser.add_argument("--known-hosts-file", required=True)
    parser.add_argument("--github-env", type=Path)
    parser.add_argument("--github-summary", type=Path)
    args = parser.parse_args()

    payload = json.loads(args.instances_json.read_text(encoding="utf-8"))
    inventory, env_values = build_inventory(args, payload)

    args.inventory.parent.mkdir(parents=True, exist_ok=True)
    args.inventory.write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    write_github_env(args.github_env, env_values)


if __name__ == "__main__":
    main()
