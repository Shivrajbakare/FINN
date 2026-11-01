"""Run alongside the API: python -m app.worker (same DATABASE_URL/storage)."""
from dotenv import load_dotenv
from app.database import database_settings
from app.services.jobs import worker

if __name__ == "__main__":
    load_dotenv()
    database_settings()
    worker()
