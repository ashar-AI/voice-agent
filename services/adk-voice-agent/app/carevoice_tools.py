"""ADK tool wrappers over the validated CareVoice backend tool routes."""

from contextvars import ContextVar, Token
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

_current_elder_id: ContextVar[str | None] = ContextVar("carevoice_elder_id", default=None)
_current_session_id: ContextVar[str | None] = ContextVar("carevoice_session_id", default=None)


def bind_call_context(elder_id: str, session_id: str) -> tuple[Token[str | None], Token[str | None]]:
    """Bind the validated WebSocket identity to ADK tool calls in this session."""

    return (_current_elder_id.set(elder_id), _current_session_id.set(session_id))


def reset_call_context(tokens: tuple[Token[str | None], Token[str | None]]) -> None:
    """Reset the WebSocket call context after the ADK live session exits."""

    elder_token, session_token = tokens
    _current_elder_id.reset(elder_token)
    _current_session_id.reset(session_token)


def get_elder_profile(elder_id: str | None = None) -> dict[str, Any]:
    """Load the elder profile before starting or resuming the check-in."""

    return _post_tool("get_elder_profile", {"elderId": _resolve_elder_id(elder_id)})


def get_recent_memories(limit: int = 8, elder_id: str | None = None) -> dict[str, Any]:
    """Load recent longitudinal memories that should guide the conversation."""

    return _post_tool(
        "get_recent_memories",
        {"elderId": _resolve_elder_id(elder_id), "limit": limit},
    )


def record_risk_decision(
    risk_level: str,
    confidence: float,
    evidence: list[str],
    open_questions: list[str],
    next_goal: str,
    recommended_action: str,
    should_create_alert: bool,
    session_id: str | None = None,
    latest_elder_text_ja: str | None = None,
    latest_elder_text_en: str | None = None,
    elder_id: str | None = None,
) -> dict[str, Any]:
    """Persist Gemini's current risk decision and optionally create an alert."""

    resolved_elder_id = _resolve_elder_id(elder_id)
    resolved_session_id = _resolve_session_id(session_id)
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
        "sessionId": resolved_session_id,
        "decision": decision,
        "riskState": risk_state,
    }

    if latest_elder_text_ja:
        transcript_turn = {
            "id": f"turn_{uuid4()}",
            "speaker": "elder",
            "textJa": latest_elder_text_ja,
            "timestamp": _now_iso(),
        }
        if latest_elder_text_en:
            transcript_turn["textEn"] = latest_elder_text_en
        payload["transcriptTurn"] = transcript_turn

    update_result = _post_tool("update_call_state", payload)
    alert_result = None

    if should_create_alert:
        alert_result = _post_tool(
            "create_alert",
            {
                "elderId": resolved_elder_id,
                "sessionId": resolved_session_id,
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

    payload = {
        "elderId": _resolve_elder_id(elder_id),
        "category": category,
        "text": text,
        "importance": importance,
    }
    resolved_session_id = _current_session_id.get() or session_id
    if resolved_session_id:
        payload["sessionId"] = resolved_session_id

    return _post_tool("save_memory", payload)


def finalize_call(
    summary: str,
    risk_level: str,
    risk_score: int,
    key_evidence: list[str],
    recommended_follow_up: str,
    session_id: str | None = None,
    elder_id: str | None = None,
) -> dict[str, Any]:
    """Finalize the check-in summary when the agent has enough information."""

    return _post_tool(
        "finalize_call_summary",
        {
            "elderId": _resolve_elder_id(elder_id),
            "sessionId": _resolve_session_id(session_id),
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
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise RuntimeError(
                f"CareVoice tool {tool_name} failed with {response.status_code}: {response.text}"
            ) from error
        return response.json()


def _resolve_elder_id(model_elder_id: str | None = None) -> str:
    # Trust the server-bound WebSocket identity over any model-provided identity.
    return _current_elder_id.get() or model_elder_id or settings.elder_id


def _resolve_session_id(model_session_id: str | None = None) -> str:
    resolved = _current_session_id.get() or model_session_id
    if not resolved:
        raise ValueError("CareVoice session_id is required for this tool call")
    return resolved


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
