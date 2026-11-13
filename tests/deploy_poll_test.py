import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("deploy_poll", Path(__file__).parents[1] / "scripts/deploy-poll.py")
poll = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poll)


class DeploymentGateTests(unittest.TestCase):
    def test_latest_matching_run_must_pass(self):
        sha = "a" * 40
        run = {"head_sha": sha, "head_branch": "main", "event": "push", "status": "completed", "conclusion": "success"}
        with patch.object(poll, "api", return_value={"workflow_runs": [run]}):
            self.assertTrue(poll.ci_passed(sha))
        with patch.object(poll, "api", return_value={"workflow_runs": [{**run, "conclusion": "failure"}, run]}):
            self.assertFalse(poll.ci_passed(sha))
        with patch.object(poll, "api", return_value={"workflow_runs": [{**run, "event": "pull_request"}]}):
            self.assertFalse(poll.ci_passed(sha))

    def test_poll_does_not_deploy_without_success_or_twice(self):
        sha = "a" * 40
        with tempfile.TemporaryDirectory() as directory, patch.object(poll, "STATE", Path(directory)), \
             patch.object(poll, "main_sha", return_value=sha), patch.object(poll, "ci_passed", return_value=False), \
             patch.object(poll, "deploy") as deploy:
            poll.main()
            deploy.assert_not_called()
            (Path(directory) / "deployed-sha").write_text(sha)
            poll.main()
            deploy.assert_not_called()
            (Path(directory) / "deployed-sha").unlink()
            (Path(directory) / "baseline-sha").write_text(sha)
            poll.main()
            deploy.assert_not_called()

    def test_failed_restart_restores_previous_release(self):
        sha = "a" * 40
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            target = home / "magness-contact-release"
            target.mkdir()
            (target / "previous").touch()
            node_bin = home / "node/bin"
            node_bin.mkdir(parents=True)
            (node_bin / "node").touch()
            (node_bin / "npm").touch()

            def run(args, **kwargs):
                if args[0] == "git":
                    Path(args[-1]).mkdir()
                elif args[0] == "sudo":
                    raise RuntimeError("restart failed")

            def output(args, **kwargs):
                return sha if args[0] == "git" else "site-key"

            with patch.object(poll, "HOME", home), patch.object(poll, "TARGET", target), \
                 patch.object(poll, "NODE_BIN", node_bin), patch.object(poll, "run", side_effect=run), \
                 patch.object(poll.subprocess, "check_output", side_effect=output), \
                 patch.object(poll.subprocess, "run"), patch.object(poll, "main_sha", return_value=sha), \
                 patch.object(poll, "ci_passed", return_value=True):
                with self.assertRaisesRegex(RuntimeError, "restart failed"):
                    poll.deploy(sha)
            self.assertTrue((target / "previous").exists())


if __name__ == "__main__":
    unittest.main()
