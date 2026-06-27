"""ADK tool wrappers over the validated CareVoice backend tool routes."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx

from .config import settings

RISK_SCORE_BASE = {
    "stable": 15,
    "watch": 30,
    "concern": 50,
    "high": 75,
    "urgent": 92,
}


def get_elder_profile(elder_id: str | None = None) -> dict[str, Any]:
    """Load the elder profile before starting or resuming the check-in."""

    return _post_tool("get_elder_profile", {"elderId": elder_id or settings.elder_id})


def get_recent_memories(limit: int = 8, elder_id: str | None = None) -> dict[str, Any]:
    """Load recent longitudinal memories that should guide the conversation."""

    return _post_tool(
        "get_recent_memories",
        {"elderId": elder_id or settings.elder_id, "limit": limit},
    )


def record_risk_decision(
    session_id: str,
    risk_level: str,
    confidence: float,
    evidence: list[str],
    open_questions: list[str],
    next_goal: str,
    recommended_action: str,
    should_create_alert: bool,
    latest_elder_text_ja: str | None = None,
    latest_elder_text_en: str | None = None,
    elder_id: str | None = None,
) -> dict[str, Any]:
    """Persist Gemini's current risk decision and optionally create an alert."""

    resolved_elder_id = elder_id or settings.elder_id
    normalized_risk = _normalize_risk_level(risk_level)
    bounded_confidence = max(0.0, min(1.0, confidence))
    decision = {
        "riskLevel": normalized_risk,
        "confidence": bounded_confidence,
        "evidence": evidence,
        "openQuestions": open_questions,
        "nextGoal": next_goal,
        "recommendedAction": recommended_action,
        "shouldContinueConversation": True,
        "shouldCreateAlert": should_create_alert,
        "shouldFinalizeCall": False,
    }
    risk_state = {
        "riskLevel": normalized_risk,
        "riskScore": _risk_score(normalized_risk, bounded_confidence),
        "knownFacts": evidence,
        "uncertainties": open_questions,
        "nextGoal": next_goal,
        "recommendedAction": recommended_action,
        "alertRequired": should_create_alert,
        "signals": _signals_from_evidence(normalized_risk, evidence),
    }
    payload: dict[str, Any] = {
        "elderId": resolved_elder_id,
        "sessionId": session_id,
        "decision": decision,
        "riskState": risk_state,
    }

    if latest_elder_text_ja:
        payload["transcriptTurn"] = {
            "id": f"turn_{uuid4()}",
            "speaker": "elder",
            "textJa": latest_elder_text_ja,
            "textEn": latest_elder_text_en,
            "timestamp": _now_iso(),
        }

    update_result = _post_tool("update_call_state", payload)
    alert_result = None

    if should_create_alert:
        alert_result = _post_tool(
            "create_alert",
            {
                "elderId": resolved_elder_id,
                "sessionId": session_id,
                "severity": normalized_risk,
                "title": "Welfare check follow-up recommended",
                "reason": "; ".join(evidence),
                "suggestedAction": recommended_action,
                "evidence": evidence,
            },
        )

    return {"riskUpdate": update_result, "alert": alert_result}


def save_memory(
    category: str,
    text: str,
    importance: str,
    session_id: str | None = None,
    elder_id: str | None = None,
) -> dict[str, Any]:
    """Persist one durable memory learned during the conversation."""

    return _post_tool(
        "save_memory",
        {
            "elderId": elder_id or settings.elder_id,
            "sessionId": session_id,
            "category": category,
            "text": text,
            "importance": importance,
        },
    )


def finalize_call(
    session_id: str,
    summary: str,
    risk_level: str,
    risk_score: int,
    key_evidence: list[str],
    recommended_follow_up: str,
    elder_id: str | None = None,
) -> dict[str, Any]:
    """Finalize the check-in summary when the agent has enough information."""

    return _post_tool(
        "finalize_call_summary",
        {
            "elderId": elder_id or settings.elder_id,
            "sessionId": session_id,
            "summary": summary,
            "riskLevel": _normalize_risk_level(risk_level),
            "riskScore": max(0, min(100, risk_score)),
            "keyEvidence": key_evidence,
            "recommendedFollowUp": recommended_follow_up,
        },
    )


def _post_tool(tool_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    with httpx.Client(timeout=8.0) as client:
        response = client.post(
            f"{settings.carevoice_api_base_url}/api/agent-tools/{tool_name}",
            json=payload,
        )
        response.raise_for_status()
        return response.json()


def _normalize_risk_level(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in RISK_SCORE_BASE:
        return "watch"
    return normalized


def _risk_score(risk_level: str, confidence: float) -> int:
    return max(
        0,
        min(100, RISK_SCORE_BASE[risk_level] + round((confidence - 0.5) * 10)),
    )


def _signals_from_evidence(risk_level: str, evidence: list[str]) -> list[dict[str, Any]]:
    if risk_level == "stable":
        return []

    detected_at = _now_iso()
    return [
        {
            "id": f"sig_{uuid4()}",
            "label": risk_level,
            "severity": risk_level,
            "evidence": item,
            "detectedAt": detected_at,
        }
        for item in evidence[:4]
    ]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

