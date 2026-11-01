"""Identifiers are imported from NSE's published equity master, never guessed."""
import csv
from io import StringIO
import re

from sqlalchemy import select, func, or_, and_
from difflib import SequenceMatcher
from sqlalchemy.dialects.postgresql import insert

from app.models import Company, now
from app.seed import normalize_name
from app.services.source_http import SourceClient, SourceError

MASTER_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"


def parse_master(raw):
    reader = csv.DictReader(StringIO(raw.decode("utf-8-sig")))
    result = []
    for row in reader:
        row = {key.strip(): value.strip() for key, value in row.items() if key and value}
        symbol, name = row.get("SYMBOL", ""), row.get("NAME OF COMPANY", "")
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9&-]{0,39}", symbol) or not 2 <= len(name) <= 300:
            raise SourceError("invalid_master", "Official company master did not match its expected schema.")
        if not re.fullmatch(r"INE[A-Z0-9]{9}", row.get("ISIN NUMBER", "")):
            continue
        result.append({"nse_symbol": symbol, "company_name": name, "normalized_name": normalize_name(name)})
        if len(result) > 10000:
            raise SourceError("invalid_master", "Official company master exceeds the supported row count.")
    if not result:
        raise SourceError("invalid_master", "Official company master contained no validated companies.")
    return result


def refresh_registry(session):
    with SourceClient({"nsearchives.nseindia.com"}) as client:
        raw = client.get(MASTER_URL, 3_000_000, {"text/csv", "application/csv", "text/plain", "application/octet-stream"})
    rows = parse_master(raw)
    checked = now()
    rows = list({row["nse_symbol"]: row for row in rows}.values())
    for offset in range(0, len(rows), 300):
        values = [{**row, "registry_source": MASTER_URL, "registry_checked_at": checked,
                   "exchange": "NSE", "is_portfolio_company": False} for row in rows[offset:offset + 300]]
        statement = insert(Company).values(values)
        session.execute(statement.on_conflict_do_update(index_elements=[Company.nse_symbol], set_={
            field: getattr(statement.excluded, field) for field in
            ("company_name", "normalized_name", "registry_source", "registry_checked_at", "updated_at")}))
    return {"imported": len(rows), "source": MASTER_URL, "checked_at": checked.isoformat()}


COMMON_ALIASES = {
    "M&M": ["M&M"],
    "MM": ["M&M"],
    "MAHINDRA": ["M&M"],
    "MAHINDRA & MAHINDRA": ["M&M"],
    "MAHINDRA AND MAHINDRA": ["M&M"],
    "TCS": ["TCS"],
    "TATA CONSULTANCY": ["TCS"],
    "TATA CONSULTANCY SERVICES": ["TCS"],
    "RIL": ["RELIANCE"],
    "RELIANCE": ["RELIANCE"],
    "RELIANCE INDUSTRIES": ["RELIANCE"],
    "LT": ["LT"],
    "L&T": ["LT"],
    "L AND T": ["LT"],
    "LARSEN": ["LT"],
    "LARSEN & TOUBRO": ["LT"],
    "LARSEN AND TOUBRO": ["LT"],
    "SBI": ["SBIN"],
    "SBIN": ["SBIN"],
    "STATE BANK": ["SBIN"],
    "STATE BANK OF INDIA": ["SBIN"],
    "HUL": ["HINDUNILVR"],
    "HINDUSTAN UNILEVER": ["HINDUNILVR"],
    "UNILEVER": ["HINDUNILVR"],
    "BHARTI": ["BHARTIARTL"],
    "AIRTEL": ["BHARTIARTL"],
    "BHARTI AIRTEL": ["BHARTIARTL"],
    "KOTAK": ["KOTAKBANK"],
    "KOTAK BANK": ["KOTAKBANK"],
    "KOTAK MAHINDRA": ["KOTAKBANK"],
    "MARUTI": ["MARUTI"],
    "MARUTI SUZUKI": ["MARUTI"],
    "ITC": ["ITC"],
    "INFY": ["INFY"],
    "INFOSYS": ["INFY"],
    "WIPRO": ["WIPRO"],
    "HCL": ["HCLTECH"],
    "HCL TECH": ["HCLTECH"],
    "HCL TECHNOLOGIES": ["HCLTECH"],
    "BAJAJ FINANCE": ["BAJFINANCE"],
    "BAJAJ FINSERV": ["BAJAJFINSV"],
    "ICICI": ["ICICIBANK"],
    "ICICI BANK": ["ICICIBANK"],
    "AXIS": ["AXISBANK"],
    "AXIS BANK": ["AXISBANK"],
    "ASIAN PAINTS": ["ASIANPAINT"],
    "SUN PHARMA": ["SUNPHARMA"],
    "SUN PHARMACEUTICAL": ["SUNPHARMA"],
    "TATA MOTORS": ["TATAMOTORS"],
    "TATA STEEL": ["TATASTEEL"],
    "ADANI ENTERPRISES": ["ADANIENT"],
    "ADANI PORTS": ["ADANIPORTS"],
    "TITAN": ["TITAN"],
    "NTPC": ["NTPC"],
    "POWER GRID": ["POWERGRID"],
    "ONGC": ["ONGC"],
    "COAL INDIA": ["COALINDIA"],
}

OVERSEAS_MARKETS = {
    "AAPL": "Apple Inc. (NASDAQ)",
    "MSFT": "Microsoft Corp. (NASDAQ)",
    "GOOG": "Alphabet Inc. (NASDAQ)",
    "GOOGL": "Alphabet Inc. (NASDAQ)",
    "AMZN": "Amazon.com Inc. (NASDAQ)",
    "NVDA": "NVIDIA Corp. (NASDAQ)",
    "META": "Meta Platforms Inc. (NASDAQ)",
    "TSLA": "Tesla Inc. (NASDAQ)",
    "NFLX": "Netflix Inc. (NASDAQ)",
    "BABA": "Alibaba Group (NYSE)",
    "AMD": "Advanced Micro Devices (NASDAQ)",
    "INTC": "Intel Corp. (NASDAQ)",
    "SPY": "SPDR S&P 500 ETF (NYSE)",
    "QQQ": "Invesco QQQ Trust (NASDAQ)",
    "BRK": "Berkshire Hathaway (NYSE)",
    "BRK.A": "Berkshire Hathaway (NYSE)",
    "BRK.B": "Berkshire Hathaway (NYSE)",
    "JPM": "JPMorgan Chase & Co. (NYSE)",
    "V": "Visa Inc. (NYSE)",
    "DIS": "Walt Disney Co. (NYSE)",
    "PYPL": "PayPal Holdings (NASDAQ)",
    "UBER": "Uber Technologies (NYSE)",
    "COIN": "Coinbase Global (NASDAQ)",
    "PLTR": "Palantir Technologies (NYSE)",
    "ARM": "Arm Holdings (NASDAQ)",
    "ORCL": "Oracle Corp. (NYSE)",
    "CRM": "Salesforce Inc. (NYSE)",
    "ADBE": "Adobe Inc. (NASDAQ)",
    "NKE": "Nike Inc. (NYSE)",
    "SONY": "Sony Group Corp. (NYSE)",
    "TSM": "Taiwan Semiconductor (NYSE)",
    "ASML": "ASML Holding (NASDAQ)",
    "SAP": "SAP SE (NYSE)",
    "BND": "Vanguard Total Bond Market ETF (NASDAQ)",
    "VOO": "Vanguard S&P 500 ETF (NYSE)",
}


def check_unsupported_market(query: str) -> tuple[bool, str | None]:
    clean = query.strip().upper()
    if not clean:
        return False, None
    if clean in OVERSEAS_MARKETS:
        desc = OVERSEAS_MARKETS[clean]
        return True, f"'{clean}' ({desc}) is listed on a US/overseas exchange. FINN dynamic research currently supports NSE and BSE Indian equities. US and international equities are not in coverage."
    overseas_suffixes = {".US": "US (NASDAQ/NYSE)", ".L": "London (LSE)", ".TO": "Toronto (TSX)", ".AX": "Australia (ASX)", ".HK": "Hong Kong (HKEX)"}
    for suffix, market_name in overseas_suffixes.items():
        if clean.endswith(suffix):
            ticker_name = clean.removesuffix(suffix)
            return True, f"'{clean}' is listed on {market_name}. FINN dynamic research currently supports NSE and BSE Indian equities. Overseas markets are not in coverage."
    return False, None


def search_companies(session, query, limit=20, offset=0):
    clean = query.strip().upper().removesuffix(".NS").removesuffix(".BO")
    clean_no_punct = re.sub(r"[^A-Z0-9]+", " ", clean).strip()

    alias_symbols = COMMON_ALIASES.get(clean) or COMMON_ALIASES.get(clean_no_punct) or []

    normalized = re.sub(r"[^a-z0-9]+", " ", query.lower()).strip()
    raw_tokens = re.findall(r"[a-z0-9]+", normalized)
    stopwords = {"and", "limited", "ltd", "corp", "corporation", "inc", "co"}
    tokens = [t for t in raw_tokens if t not in stopwords]
    multi_char = [t for t in tokens if len(t) >= 2]
    search_tokens = multi_char if multi_char else ([] if alias_symbols or len(clean) <= 2 else tokens)

    clauses = []
    if clean:
        clauses.append(Company.nse_symbol == clean)
        clauses.append(Company.nse_symbol.startswith(clean, autoescape=True))
        clauses.append(Company.bse_code == clean)
    if alias_symbols:
        clauses.append(Company.nse_symbol.in_(alias_symbols))
    if search_tokens:
        clauses.append(and_(*(Company.normalized_name.contains(t, autoescape=True) for t in search_tokens)))

    if not clauses:
        if not query.strip():
            condition = Company.id.is_not(None)
        else:
            condition = Company.nse_symbol == clean
    else:
        condition = or_(*clauses)

    total = session.scalar(select(func.count()).select_from(Company).where(condition))

    order_clauses = []
    if clean:
        order_clauses.append((Company.nse_symbol == clean).desc())
    if alias_symbols:
        order_clauses.append(Company.nse_symbol.in_(alias_symbols).desc())
    if clean:
        order_clauses.append(Company.nse_symbol.startswith(clean, autoescape=True).desc())
    order_clauses.append(Company.is_portfolio_company.desc())
    order_clauses.append(Company.company_name)
    order_clauses.append(Company.id)

    rows = session.scalars(
        select(Company).where(condition).order_by(*order_clauses).offset(offset).limit(limit)
    ).all()
    return rows, total


def spelling_suggestions(session, query):
    """Suggestions only: never silently substitute another issuer."""
    text = re.sub(r"[^a-z0-9]", "", query.lower())
    if len(text) < 4:
        return []
    candidates = session.scalars(select(Company).order_by(Company.id).limit(10000)).all()
    def score(company):
        name = re.sub(r"\b(limited|ltd)\b", "", company.normalized_name)
        choices = [re.sub(r"[^a-z0-9]", "", name), (company.nse_symbol or "").lower(), *name.split()]
        return max(SequenceMatcher(None, text, choice).ratio() for choice in choices)
    return [company for weight, company in sorted(((score(c), c) for c in candidates),
            key=lambda item: (-item[0], item[1].company_name))[:5] if weight >= 0.76]

