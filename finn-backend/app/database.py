"""Synchronous PostgreSQL access. Schema changes belong exclusively to Alembic."""
from contextlib import contextmanager
from functools import lru_cache
import os
import re

from sqlalchemy import create_engine, text, event
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import Session


class DatabaseUnavailable(RuntimeError):
    pass


def database_settings():
    raw = os.getenv("DATABASE_URL", "").strip()
    if not raw:
        raise DatabaseUnavailable("Configure DATABASE_URL and run database migrations to enable dynamic research.")
    try:
        if raw.startswith("postgres://"):
            raw = "postgresql://" + raw[len("postgres://"):]
        url = make_url(raw)
        if url.drivername not in {"postgresql", "postgresql+psycopg"} or not url.database or not url.host:
            raise ValueError()
        url = url.set(drivername="postgresql+psycopg")
        if url.host not in {"localhost", "127.0.0.1", "::1"} and "sslmode" not in url.query:
            url = url.update_query_dict({"sslmode": "require"})
        options = {}
        if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", os.getenv("DATABASE_SCHEMA", "public")):
            raise ValueError()
        for name, default, maximum in [("POOL_SIZE", 5, 50), ("MAX_OVERFLOW", 5, 50), ("POOL_TIMEOUT", 10, 60)]:
            value = int(os.getenv("DATABASE_" + name, str(default)))
            if value < (0 if name == "MAX_OVERFLOW" else 1) or value > maximum:
                raise ValueError()
            options[name.lower()] = value
        if options["pool_size"] + options["max_overflow"] < 3:
            raise ValueError()
        return url, options
    except (ValueError, TypeError, ArgumentError) as exc:
        raise ValueError("Invalid PostgreSQL URL or pool configuration; check DATABASE_* settings.") from exc


@lru_cache(maxsize=1)
def engine():
    url, options = database_settings()
    database_engine = create_engine(url, **options, pool_pre_ping=True, pool_recycle=300,
                         connect_args={"connect_timeout": 15, "prepare_threshold": None}, hide_parameters=True,
                         execution_options={"schema_translate_map": {None: os.getenv("DATABASE_SCHEMA", "public")}})
    @event.listens_for(database_engine, "connect")
    def configure_connection(connection, _):
        # Hosted session poolers may reject the startup `options` parameter.
        with connection.cursor() as cursor:
            cursor.execute('SET search_path TO "' + os.getenv("DATABASE_SCHEMA", "public") + '"')
            cursor.execute("SET statement_timeout = 15000")
        connection.commit()
    return database_engine


@contextmanager
def transaction():
    with Session(engine(), expire_on_commit=False) as session:
        with session.begin():
            yield session


def readiness():
    with engine().connect() as connection:
        from sqlalchemy import select
        from app.models import Company
        connection.execute(select(Company.id).limit(1))


def validate_startup():
    # Legacy market/Infosys routes remain usable without a database. Invalid
    # supplied configuration fails startup, never silently falls back to SQLite.
    if os.getenv("DATABASE_URL"):
        database_settings()
    for name, default, upper in [("DOCUMENT_CACHE_HOURS", 24, 720), ("DOCUMENT_RETENTION_DAYS", 30, 3650)]:
        try:
            if not 1 <= int(os.getenv(name, str(default))) <= upper:
                raise ValueError()
        except ValueError as exc:
            raise ValueError(f"{name} must be an integer from 1 to {upper}.") from exc


def close_database():
    if engine.cache_info().currsize:
        engine().dispose()
        engine.cache_clear()
