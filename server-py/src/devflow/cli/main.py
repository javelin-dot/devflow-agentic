from __future__ import annotations

import asyncio
from pathlib import Path

import typer
from rich.console import Console

from devflow.cli.init_db import seed_admin_async
from devflow.cli.migrate_sqlite import migrate_sqlite_async

app = typer.Typer(help="DevFlow management CLI", no_args_is_help=True)
console = Console()


@app.command("seed-admin")
def seed_admin() -> None:
    """Create default local-admin user if missing."""
    asyncio.run(seed_admin_async())
    console.print("[green]ok[/green] local-admin ensured")


@app.command("migrate-sqlite")
def migrate_sqlite(
    sqlite_path: Path = typer.Argument(..., help="Path to legacy devflow.db"),
    attachments_dir: Path | None = typer.Option(None, help="Path to legacy attachments directory"),
    dry_run: bool = typer.Option(False, help="Report counts without writing"),
) -> None:
    """Migrate data from legacy SQLite (server/) to PostgreSQL."""
    asyncio.run(migrate_sqlite_async(sqlite_path, attachments_dir, dry_run=dry_run))


if __name__ == "__main__":
    app()
