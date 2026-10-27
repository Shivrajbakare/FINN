"""
Portfolio configuration — the 18 portfolio companies + 5 research-only companies.

Design decision: Store portfolio as static config, not in a database.
Rationale: For a prototype, the portfolio is fixed. A production system would
store this per-user in a DB, but adding user auth and DB-backed portfolios
adds complexity without demonstrating the core value (filtering + analysis).
"""

from pydantic import BaseModel


class Company(BaseModel):
    """A company in the portfolio or research set."""
    ticker: str           # Yahoo Finance ticker (e.g. "RELIANCE.NS")
    name: str             # Human-readable name
    sector: str           # Sector classification
    size: str             # "large", "mid", "small"
    in_portfolio: bool    # True = portfolio (push alerts), False = research-only


# --- Portfolio: 18 companies across 9 sectors ---
PORTFOLIO: list[Company] = [
    # Large-cap
    Company(ticker="RELIANCE.NS", name="Reliance Industries", sector="Energy / Conglomerate", size="large", in_portfolio=True),
    Company(ticker="TCS.NS", name="Tata Consultancy Services", sector="IT", size="large", in_portfolio=True),
    Company(ticker="HDFCBANK.NS", name="HDFC Bank", sector="Banking", size="large", in_portfolio=True),
    Company(ticker="INFY.NS", name="Infosys", sector="IT", size="large", in_portfolio=True),
    Company(ticker="BHARTIARTL.NS", name="Bharti Airtel", sector="Telecom", size="large", in_portfolio=True),
    Company(ticker="SUNPHARMA.NS", name="Sun Pharma", sector="Pharma", size="large", in_portfolio=True),
    Company(ticker="BAJFINANCE.NS", name="Bajaj Finance", sector="NBFC", size="large", in_portfolio=True),

    # Mid-cap
    Company(ticker="PIDILITIND.NS", name="Pidilite Industries", sector="Chemicals", size="mid", in_portfolio=True),
    Company(ticker="TRENT.NS", name="Trent Ltd", sector="Retail", size="mid", in_portfolio=True),
    Company(ticker="PERSISTENT.NS", name="Persistent Systems", sector="IT", size="mid", in_portfolio=True),
    Company(ticker="CUMMINSIND.NS", name="Cummins India", sector="Industrials", size="mid", in_portfolio=True),
    Company(ticker="POLYCAB.NS", name="Polycab India", sector="Electricals", size="mid", in_portfolio=True),
    Company(ticker="ASTRAL.NS", name="Astral Ltd", sector="Building Materials", size="mid", in_portfolio=True),
    Company(ticker="CDSL.NS", name="CDSL", sector="Financial Infra", size="mid", in_portfolio=True),

    # Small-cap
    Company(ticker="GRINDWELL.NS", name="Grindwell Norton", sector="Industrials", size="small", in_portfolio=True),
    Company(ticker="KAYNES.NS", name="Kaynes Technology", sector="Electronics (EMS)", size="small", in_portfolio=True),
    Company(ticker="IIFL.NS", name="IIFL Finance", sector="NBFC", size="small", in_portfolio=True),
    Company(ticker="AFFLE.NS", name="Affle India", sector="Ad-tech", size="small", in_portfolio=True),
]

# --- Research-only companies (for Pull demo) ---
RESEARCH_COMPANIES: list[Company] = [
    Company(ticker="TITAN.NS", name="Titan Company", sector="Consumer", size="large", in_portfolio=False),
    Company(ticker="DMART.NS", name="Avenue Supermarts", sector="Retail", size="large", in_portfolio=False),
    Company(ticker="ZOMATO.NS", name="Zomato", sector="Internet", size="large", in_portfolio=False),
    Company(ticker="DIXON.NS", name="Dixon Technologies", sector="Electronics (EMS)", size="mid", in_portfolio=False),
    Company(ticker="MARICO.NS", name="Marico", sector="FMCG", size="large", in_portfolio=False),
]

ALL_COMPANIES: list[Company] = PORTFOLIO + RESEARCH_COMPANIES


def get_company(ticker: str) -> Company | None:
    """Look up a company by ticker. Returns None if not found."""
    for c in ALL_COMPANIES:
        if c.ticker == ticker or c.ticker.split(".")[0] == ticker:
            return c
    return None


def get_portfolio_tickers() -> list[str]:
    """Return just the Yahoo Finance tickers for portfolio companies."""
    return [c.ticker for c in PORTFOLIO]


def get_all_tickers() -> list[str]:
    """Return all tickers (portfolio + research)."""
    return [c.ticker for c in ALL_COMPANIES]
