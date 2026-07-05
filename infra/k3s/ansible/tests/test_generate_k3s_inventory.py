import json
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.generate_k3s_inventory import build_inventory


def instance(name, role, private_ip, public_ip=None):
    payload = {
        "InstanceId": name,
        "PrivateIpAddress": private_ip,
        "Tags": [
            {"Key": "Name", "Value": name},
            {"Key": "Role", "Value": role},
        ],
    }
    if public_ip:
        payload["PublicIpAddress"] = public_ip
    return payload


class GenerateK3sInventoryTests(unittest.TestCase):
    def test_generates_bastion_inventory(self):
        payload = {
            "Reservations": [
                {
                    "Instances": [
                        instance("corp-tower-k3s-lab-gw", "k3s-gateway", "10.60.1.10", "203.0.113.10"),
                        instance("corp-tower-k3s-lab-cp", "k3s-control-plane", "10.60.10.10"),
                        instance("corp-tower-k3s-lab-agent-1", "k3s-agent", "10.60.10.11"),
                        instance("corp-tower-k3s-lab-agent-2", "k3s-agent", "10.60.10.12"),
                    ]
                }
            ]
        }

        with tempfile.TemporaryDirectory() as tmp:
            args = Namespace(
                inventory=Path(tmp) / "inventory.json",
                ssh_user="ec2-user",
                ssh_port="22",
                ssh_key_file="/home/runner/.ssh/ec2_key",
                known_hosts_file="/home/runner/.ssh/known_hosts",
                github_summary=None,
            )

            inventory, env_values = build_inventory(args, json.loads(json.dumps(payload)))

        self.assertEqual(env_values["GATEWAY_PUBLIC_IP"], "203.0.113.10")
        self.assertEqual(env_values["CONTROL_PLANE_PRIVATE_IP"], "10.60.10.10")
        self.assertEqual(env_values["K3S_NODE_PRIVATE_IPS"], "10.60.10.10 10.60.10.11 10.60.10.12")

        server = inventory["all"]["children"]["k3s_server"]["hosts"]["corp-tower-k3s-lab-cp"]
        self.assertIn("ProxyJump=ec2-user@203.0.113.10:22", server["ansible_ssh_common_args"])


if __name__ == "__main__":
    unittest.main()
