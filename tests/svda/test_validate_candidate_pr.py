import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "svda" / "validate_candidate_pr.py"
SPEC = importlib.util.spec_from_file_location("validate_candidate_pr", MODULE_PATH)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(validator)


def candidate(**overrides):
    value = {
        "id": "cand-001",
        "url": "https://events.example.com/calendar",
        "event_page_fetched": True,
        "registry_row_proposed": True,
        "agent_confidence": 0.8,
        "extraction_score": 0.7,
        "dedup_status": "novel",
        "monthly_event_estimate": 3,
        "sample_events": [
            {"title": "Real event", "date": "2026-08-01", "url": "https://events.example.com/1"}
        ],
    }
    value.update(overrides)
    return value


def document(candidates):
    return {
        "session_duration_minutes": 6,
        "total_cost_usd": 1.5,
        "candidates_proposed": candidates,
    }


class CandidateValidationTests(unittest.TestCase):
    def test_valid_proposal_passes(self):
        proposed = validator.validate_candidate_document(document([candidate()]))
        self.assertEqual(len(proposed), 1)

    def test_unfetched_proposal_fails(self):
        with self.assertRaisesRegex(validator.ValidationError, "directly fetched"):
            validator.validate_candidate_document(document([candidate(event_page_fetched=False)]))

    def test_yearly_volume_cannot_pass_monthly_cutoff(self):
        with self.assertRaisesRegex(validator.ValidationError, "below 3"):
            validator.validate_candidate_document(document([candidate(monthly_event_estimate=1)]))

    def test_runner_caps_are_enforced(self):
        bad = document([candidate(registry_row_proposed=False)] * 6)
        bad["session_duration_minutes"] = 25
        with self.assertRaises(validator.ValidationError) as error:
            validator.validate_candidate_document(bad)
        self.assertIn("candidate cap exceeded", str(error.exception))
        self.assertIn("session duration exceeds", str(error.exception))

    def test_existing_registry_rows_are_immutable(self):
        base = [{"name": "Existing", "domain": "existing.example"}]
        changed = [{"name": "Rewritten", "domain": "existing.example"}]
        with self.assertRaisesRegex(validator.ValidationError, "append-only"):
            validator.validate_registry_change(base, changed, [])

    def test_registry_additions_must_match_proposals(self):
        base = [{"name": "Existing", "domain": "existing.example"}]
        current = base + [{"name": "Other", "domain": "other.example"}]
        with self.assertRaisesRegex(validator.ValidationError, "exactly match"):
            validator.validate_registry_change(base, current, [candidate()])


if __name__ == "__main__":
    unittest.main()
