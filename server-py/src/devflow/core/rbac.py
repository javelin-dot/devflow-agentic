"""Casbin enforcer wired to a simple RBAC model. Disabled by default — toggle via DEVFLOW_RBAC_ENABLED."""

from __future__ import annotations

import casbin

from devflow.config import get_settings

_MODEL = """
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && keyMatch(r.obj, p.obj) && (r.act == p.act || p.act == "*")
"""


_enforcer: casbin.Enforcer | None = None


def _build_enforcer() -> casbin.Enforcer:
    import tempfile

    with tempfile.NamedTemporaryFile("w", suffix=".conf", delete=False) as f:
        f.write(_MODEL)
        model_path = f.name

    e = casbin.Enforcer(model_path)
    # Built-in defaults — replaced/extended at startup from DB
    e.add_policy("admin", "/api/*", "*")
    e.add_policy("editor", "/api/requirements*", "*")
    e.add_policy("editor", "/api/documents*", "*")
    e.add_policy("viewer", "/api/*", "GET")
    return e


def get_enforcer() -> casbin.Enforcer:
    global _enforcer
    if _enforcer is None:
        _enforcer = _build_enforcer()
    return _enforcer


def check(role: str, path: str, method: str) -> bool:
    if not get_settings().rbac_enabled:
        return True
    return get_enforcer().enforce(role, path, method.upper())
