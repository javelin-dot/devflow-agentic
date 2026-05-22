"""Stage transition authority. Mirrors harness/05-stage-gates.md.

Stages: backlog → analyzing → development → uat → prerelease → released
Any stage may also fall back to backlog. Detailed gate checks (e.g. verify_commands)
live in the quality module; here we only encode the legal topology.
"""

from __future__ import annotations

from dataclasses import dataclass

Stage = str

STAGES: tuple[Stage, ...] = (
    "backlog",
    "analyzing",
    "development",
    "uat",
    "prerelease",
    "released",
)

# Forward transitions only — backlog rollback handled separately.
_FORWARD: dict[Stage, set[Stage]] = {
    "backlog": {"analyzing"},
    "analyzing": {"development"},
    "development": {"uat"},
    "uat": {"prerelease"},
    "prerelease": {"released"},
    "released": set(),
}


@dataclass(slots=True)
class GateDecision:
    allowed: bool
    reason: str = ""


def can_transition(from_stage: Stage, to_stage: Stage) -> GateDecision:
    if to_stage not in STAGES:
        return GateDecision(False, f"unknown stage: {to_stage}")
    if from_stage == to_stage:
        return GateDecision(False, "already at target stage")
    if to_stage == "backlog":
        return GateDecision(True, "rollback to backlog always allowed")
    if to_stage in _FORWARD.get(from_stage, set()):
        return GateDecision(True)
    return GateDecision(False, f"illegal transition: {from_stage} -> {to_stage}")
