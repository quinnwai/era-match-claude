"""Level 3 LLM-as-judge evaluation harness."""
import json

import anthropic
from pydantic import BaseModel
from src.config import ANTHROPIC_API_KEY, DB_PATH
from src.matching import run_matching_pipeline
from tests.test_fixtures import TEST_CASES


class CriterionScore(BaseModel):
    criterion: str
    passed: bool
    reasoning: str


class JudgeResult(BaseModel):
    criteria_scores: list[CriterionScore]
    overall_score: float
    suggestions: str


JUDGE_PROMPT = """\
You are an impartial judge evaluating the quality of a network matching system. You will receive:
1. A founder's ask and their company context
2. The system's response (either matches or a clarification request)
3. Evaluation criteria

Score each criterion as PASS or FAIL with brief reasoning. Then give an overall score from 0.0 to 1.0.

<ask>{ask}</ask>
<company>{company}</company>

<system_response>
{response}
</system_response>

<criteria>
{criteria}
</criteria>

Evaluate each criterion strictly. A criterion passes only if the evidence clearly supports it.
"""


def evaluate_results(test_case: dict, pipeline_results: dict) -> dict:
    """Use Claude to judge whether pipeline results meet test criteria."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    if pipeline_results["type"] == "clarification":
        response_text = f"CLARIFICATION REQUESTED: {pipeline_results['clarifying_question']}"
    else:
        matches_text = []
        for i, m in enumerate(pipeline_results.get("matches") or [], 1):
            matches_text.append(
                f"{i}. {m['name']} — {m['title']} @ {m['company']}\n"
                f"   LinkedIn: {m['linkedin_url']}\n"
                f"   Explanation: {m['explanation']}\n"
                f"   Conversation hooks: {m['conversation_hooks']}"
            )
        response_text = "\n\n".join(matches_text)

    criteria_text = "\n".join(f"- {c}" for c in test_case["criteria"])

    prompt = JUDGE_PROMPT.format(
        ask=test_case["ask"],
        company=test_case["company"],
        response=response_text,
        criteria=criteria_text,
    )

    tools = [{
        "name": "report_evaluation",
        "description": "Report the evaluation results",
        "input_schema": JudgeResult.model_json_schema(),
    }]
    message = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
        tools=tools,
        tool_choice={"type": "tool", "name": "report_evaluation"},
    )
    for block in message.content:
        if block.type == "tool_use":
            result = JudgeResult.model_validate(block.input)
            break
    else:
        raise ValueError("No tool_use block in judge response")
    return {
        "test_id": test_case["id"],
        "criteria_scores": [s.model_dump() for s in result.criteria_scores],
        "overall_score": result.overall_score,
        "suggestions": result.suggestions,
    }


def run_full_evaluation(test_cases: list[dict] | None = None) -> dict:
    """Run all test cases through pipeline + judge. Returns aggregate results."""
    cases = test_cases or TEST_CASES
    results = []
    total_criteria = 0
    passed_criteria = 0

    for tc in cases:
        print(f"\n--- Running: {tc['id']} ---")
        print(f"Ask: {tc['ask']}")
        print(f"Company: {tc['company']}")

        pipeline_result = run_matching_pipeline(tc["ask"], tc["company"], DB_PATH)

        if pipeline_result["type"] == "matches":
            for i, m in enumerate(pipeline_result.get("matches") or [], 1):
                print(f"  Match {i}: {m['name']} — {m['title']} @ {m['company']}")
        else:
            print(f"  Clarification: {pipeline_result['clarifying_question']}")

        judge = evaluate_results(tc, pipeline_result)
        results.append(judge)

        for cs in judge["criteria_scores"]:
            total_criteria += 1
            if cs["passed"]:
                passed_criteria += 1
            status = "PASS" if cs["passed"] else "FAIL"
            print(f"  [{status}] {cs['criterion']}: {cs['reasoning']}")

        print(f"  Overall: {judge['overall_score']:.2f}")
        print(f"  Suggestions: {judge['suggestions']}")

    pass_rate = passed_criteria / total_criteria if total_criteria else 0
    print(f"\n=== AGGREGATE: {passed_criteria}/{total_criteria} criteria passed ({pass_rate:.0%}) ===")

    return {
        "results": results,
        "total_criteria": total_criteria,
        "passed_criteria": passed_criteria,
        "pass_rate": pass_rate,
    }


if __name__ == "__main__":
    run_full_evaluation()
