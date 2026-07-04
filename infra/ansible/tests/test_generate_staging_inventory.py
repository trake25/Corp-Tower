import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from generate_staging_inventory import InventoryError, build_inventory


def instance(instance_id, role, public_ip, private_ip, subnet_id="subnet-1", state="running", name=None):
    return {
        "InstanceId": instance_id,
        "PublicIpAddress": public_ip,
        "PrivateIpAddress": private_ip,
        "SubnetId": subnet_id,
        "State": {"Name": state},
        "Tags": [
            {"Key": "Role", "Value": role},
            {"Key": "Name", "Value": name or instance_id},
        ],
    }


def payload(*instances):
    return {"Reservations": [{"Instances": list(instances)}]}


class GenerateStagingInventoryTests(unittest.TestCase):
    def build(self, data):
        return build_inventory(
            data,
            ssh_user="ec2-user",
            ssh_port="22",
            ssh_key_file="/home/runner/.ssh/ec2_key",
            known_hosts_file="/home/runner/.ssh/known_hosts",
        )

    def test_builds_gateway_and_worker_groups(self):
        inventory, env = self.build(
            payload(
                instance("i-gateway", "gateway-redis-proxy-learning", "54.0.0.1", "10.0.0.10"),
                instance("i-worker-1", "docker-server-worker", "54.0.0.2", "10.0.0.20", name="worker-1"),
                instance("i-worker-2", "docker-server-worker", "54.0.0.3", "10.0.0.30", name="worker-2"),
            )
        )

        self.assertEqual(list(inventory["all"]["children"]["gateway"]["hosts"].keys()), ["gateway"])
        self.assertEqual(len(inventory["all"]["children"]["workers"]["hosts"]), 2)
        self.assertEqual(env["GATEWAY_PRIVATE_IP"], "10.0.0.10")
        self.assertEqual(env["WORKER_PRIVATE_IPS"], "10.0.0.20 10.0.0.30")
        self.assertEqual(inventory["all"]["vars"]["redis_url"], "redis://10.0.0.10:6379")

    def test_requires_gateway(self):
        with self.assertRaisesRegex(InventoryError, "Expected exactly 1 running gateway"):
            self.build(
                payload(
                    instance("i-worker-1", "docker-server-worker", "54.0.0.2", "10.0.0.20"),
                    instance("i-worker-2", "docker-server-worker", "54.0.0.3", "10.0.0.30"),
                )
            )

    def test_requires_two_workers(self):
        with self.assertRaisesRegex(InventoryError, "Expected at least 2 running Docker worker"):
            self.build(
                payload(
                    instance("i-gateway", "gateway-redis-proxy-learning", "54.0.0.1", "10.0.0.10"),
                    instance("i-worker-1", "docker-server-worker", "54.0.0.2", "10.0.0.20"),
                )
            )

    def test_rejects_mixed_subnets(self):
        with self.assertRaisesRegex(InventoryError, "not all in one subnet"):
            self.build(
                payload(
                    instance("i-gateway", "gateway-redis-proxy-learning", "54.0.0.1", "10.0.0.10"),
                    instance("i-worker-1", "docker-server-worker", "54.0.0.2", "10.0.0.20"),
                    instance("i-worker-2", "docker-server-worker", "54.0.0.3", "10.0.0.30", subnet_id="subnet-2"),
                )
            )

    def test_rejects_missing_ip(self):
        with self.assertRaisesRegex(InventoryError, "missing PublicIpAddress"):
            self.build(
                payload(
                    instance("i-gateway", "gateway-redis-proxy-learning", "54.0.0.1", "10.0.0.10"),
                    instance("i-worker-1", "docker-server-worker", "", "10.0.0.20"),
                    instance("i-worker-2", "docker-server-worker", "54.0.0.3", "10.0.0.30"),
                )
            )


if __name__ == "__main__":
    unittest.main()
