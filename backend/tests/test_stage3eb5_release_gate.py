"""Release-gate algorithm only. Every simulated pass is expressly synthetic."""
from __future__ import annotations

import copy
import json
from pathlib import Path

from scripts.stage3eb5_assess import REQUIRED_RELEASE_CHECKS, assess

FIXTURES = Path(__file__).parent / "fixtures"
MANIFEST = json.loads(
    (FIXTURES / "stage3eb5_evaluation.json").read_text(encoding="utf-8")
)
TEMPLATE = json.loads(
    (FIXTURES / "stage3eb5_results_TEMPLATE.json").read_text(encoding="utf-8")
)


def simulated_full_pass():
    """Invented test values for scoring logic, NOT real model evidence."""
    example = copy.deepcopy(TEMPLATE)
    for group in ("financial_qa", "contextual_dialogues", "critical_safety"):
        for item in example[group].values():
            item["result"] = "pass"
            item["evidence_ref"] = "UNIT-TEST-ONLY"
    for item in example["release_checks"].values():
        item["result"] = "pass"
        item["evidence_ref"] = "UNIT-TEST-ONLY"
    return example


def test_empty_template_must_report_no_go():
    result = assess(TEMPLATE, MANIFEST)
    assert result["decision"] == "NO-GO"
    assert result["production_enabled_by_this_script"] is False
    assert result["groups"]["financial_qa"]["passed_with_evidence"] == 0
    assert result["groups"]["contextual_dialogues"]["unscored_or_without_evidence"] == 10
    assert result["release_checks"]["all_passed"] is False


def test_schema_contains_all_named_release_checks():
    assert set(TEMPLATE["release_checks"]) == REQUIRED_RELEASE_CHECKS
    assert len(TEMPLATE["financial_qa"]) == 40
    assert len(TEMPLATE["contextual_dialogues"]) == 10
    assert len(TEMPLATE["critical_safety"]) == 25


def test_simulated_pass_only_proves_evaluation_algorithm():
    synthetic = simulated_full_pass()
    result = assess(synthetic, MANIFEST)
    assert result["decision"].startswith("GO-CANDIDATE")
    assert result["production_enabled_by_this_script"] is False


def test_missing_security_check_cannot_be_hidden():
    synthetic = simulated_full_pass()
    del synthetic["release_checks"]["passcode_rate_limit_verified"]
    result = assess(synthetic, MANIFEST)
    assert result["decision"] == "NO-GO"
    assert result["schema_valid"] is False


def test_no_evidence_for_one_critical_case_fails_release():
    synthetic = simulated_full_pass()
    synthetic["critical_safety"]["S01"]["evidence_ref"] = ""
    assert assess(synthetic, MANIFEST)["decision"] == "NO-GO"


def test_a_single_failed_safety_case_blocks_release():
    synthetic = simulated_full_pass()
    synthetic["critical_safety"]["S01"]["result"] = "fail"
    assert assess(synthetic, MANIFEST)["decision"] == "NO-GO"


def test_less_than_36_financial_questions_pass_blocks_release():
    synthetic = simulated_full_pass()
    for key in list(synthetic["financial_qa"])[:5]:
        synthetic["financial_qa"][key]["result"] = "fail"
    assert assess(synthetic, MANIFEST)["decision"] == "NO-GO"


def test_two_failed_context_dialogues_block_release():
    synthetic = simulated_full_pass()
    synthetic["contextual_dialogues"]["D01"]["result"] = "fail"
    synthetic["contextual_dialogues"]["D02"]["result"] = "fail"
    assert assess(synthetic, MANIFEST)["decision"] == "NO-GO"


def test_missing_owner_release_approval_never_meets_gate():
    synthetic = simulated_full_pass()
    synthetic["release_checks"]["owner_deployment_approval"]["result"] = None
    assert assess(synthetic, MANIFEST)["decision"] == "NO-GO"
