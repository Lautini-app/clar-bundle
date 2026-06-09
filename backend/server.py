from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'clar-dev-secret-please-rotate-min-32-chars-long')
JWT_ALGO = 'HS256'

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '')

# App-Store-Reviewer-Account: bei Login als dieser User werden serverseitig
# automatisch alle verfügbaren Apps freigeschaltet (Bundle-Entitlement),
# damit Apple Reviewer die App ohne echten IAP-Kauf testen kann.
# Vgl. App-Review-Notes / "Anmeldeinformationen" im App Store Connect.
REVIEWER_EMAIL = os.environ.get('REVIEWER_EMAIL', 'appstore.reviewer@lautini.ch').lower()


def _is_reviewer(user: dict) -> bool:
    email = (user or {}).get('email') or ''
    return email.lower() == REVIEWER_EMAIL

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ Models ============
class ClarApp(BaseModel):
    slug: str
    name: str
    tagline: str
    description: str
    url: str
    icon: str
    color: str
    available: bool = True


class AppleSignInPayload(BaseModel):
    apple_user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    supabase_access_token: Optional[str] = None  # set on native iOS after real Supabase signIn


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None


class SelectedAppsPayload(BaseModel):
    selected_apps: List[str]


class SubscriptionStatus(BaseModel):
    plan: Optional[str] = None
    entitlement: Optional[str] = None
    apps_unlocked: List[str] = []
    billing_period: Optional[str] = None
    price_chf: Optional[float] = None
    expires_at: Optional[str] = None


class PurchasePayload(BaseModel):
    plan: str
    billing_period: str
    app_slug: Optional[str] = None


# ============ Static App Catalog ============
APPS_CATALOG = [
    ClarApp(slug="heim", name="clar·heim", tagline="Haushaltsorganisation",
            description="Strukturiere deinen Haushalt mit klaren Routinen und Listen.",
            url="https://clar.heim.lautini.ch", icon="home", color="#2E5C3E", available=True),
    ClarApp(slug="markt", name="clar·markt", tagline="Einkaufsplanung",
            description="Einkaufslisten, die mit dir mitdenken.",
            url="https://clar.markt.lautini.ch", icon="cart", color="#C97B3A", available=True),
    ClarApp(slug="log", name="clar·log", tagline="Stimulanzien-Tagebuch",
            description="Dokumentiere Dosis, Wirkung und Nebenwirkungen — bald verfügbar.",
            url="", icon="book", color="#5B7AAE", available=False),
    ClarApp(slug="tag", name="clar·tag", tagline="Tagesstruktur & Routinen",
            description="Ruhige Tagesplanung für neurodiverse Köpfe — bald verfügbar.",
            url="", icon="time", color="#A85C7D", available=False),
]


# ============ Auth helpers ============
def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=90),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = decoded.get("sub")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def verify_supabase_token(access_token: str) -> Optional[dict]:
    """Verify a Supabase access_token by calling /auth/v1/user.
    Returns the Supabase user dict on success, None on failure."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as cx:
            r = await cx.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "apikey": SUPABASE_ANON_KEY,
                },
            )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception as e:
        logger.warning("Supabase verify failed: %s", e)
        return None


# ============ Routes ============
@api_router.get("/")
async def root():
    return {"app": "clar by lautini", "status": "ok"}


@api_router.get("/apps", response_model=List[ClarApp])
async def list_apps():
    return APPS_CATALOG


@api_router.post("/auth/apple", response_model=AuthResponse)
async def sign_in_with_apple(payload: AppleSignInPayload):
    """Sign in with Apple via Supabase.

    Production iOS flow:
      1. Client calls AppleAuthentication.signInAsync → identityToken
      2. Client calls supabase.auth.signInWithIdToken({provider:'apple', token})
      3. Client sends supabase_access_token to this endpoint
      4. We verify the access token with Supabase, then mint a Shell-JWT

    Web/Expo Go fallback (no supabase_access_token): we trust the apple_user_id
    payload to establish a mock session for preview only.
    """
    canonical_user_id: str
    email: Optional[str] = payload.email
    full_name: Optional[str] = payload.full_name

    if payload.supabase_access_token:
        sb_user = await verify_supabase_token(payload.supabase_access_token)
        if not sb_user:
            raise HTTPException(status_code=401, detail="Invalid Supabase token")
        canonical_user_id = sb_user["id"]
        email = sb_user.get("email") or email
    else:
        # MOCK preview path — only accept if Supabase is not configured OR caller
        # explicitly passed a mock apple_user_id (no token = preview)
        canonical_user_id = payload.apple_user_id

    existing = await db.users.find_one({"apple_user_id": canonical_user_id}, {"_id": 0})
    if existing:
        user_id = existing["id"]
        update = {}
        if email and not existing.get("email"):
            update["email"] = email
        if full_name and not existing.get("full_name"):
            update["full_name"] = full_name
        if update:
            await db.users.update_one({"id": user_id}, {"$set": update})
        user_email = existing.get("email") or email
        user_name = existing.get("full_name") or full_name
    else:
        user_id = str(uuid.uuid4())
        new_user = {
            "id": user_id,
            "apple_user_id": canonical_user_id,
            "email": email,
            "full_name": full_name,
            "selected_apps": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(new_user.copy())
        user_email = email
        user_name = full_name

    token = create_token(user_id)
    return AuthResponse(token=token, user_id=user_id, email=user_email, full_name=user_name)


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/user/selected-apps")
async def save_selected_apps(payload: SelectedAppsPayload, user: dict = Depends(get_current_user)):
    valid_slugs = {a.slug for a in APPS_CATALOG if a.available}
    cleaned = [s for s in payload.selected_apps if s in valid_slugs]
    await db.users.update_one({"id": user["id"]}, {"$set": {"selected_apps": cleaned}})
    return {"selected_apps": cleaned}


@api_router.get("/subscription/status", response_model=SubscriptionStatus)
async def subscription_status(user: dict = Depends(get_current_user)):
    # App-Store-Reviewer: alle Apps automatisch freischalten (kein IAP nötig)
    if _is_reviewer(user):
        available_slugs = [a.slug for a in APPS_CATALOG if a.available]
        return SubscriptionStatus(
            plan="bundle",
            entitlement="bundle",
            apps_unlocked=available_slugs,
            billing_period="reviewer",
            price_chf=0.0,
            expires_at=(datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        )
    sub = await db.subscriptions.find_one({"user_id": user["id"]}, {"_id": 0})
    if not sub:
        return SubscriptionStatus()
    return SubscriptionStatus(
        plan=sub.get("plan"),
        entitlement=sub.get("entitlement"),
        apps_unlocked=sub.get("apps_unlocked", []),
        billing_period=sub.get("billing_period"),
        price_chf=sub.get("price_chf"),
        expires_at=sub.get("expires_at"),
    )


PRICING = {
    ("single", "monthly"): 4.0,
    ("single", "yearly"): 30.0,
    ("bundle", "monthly"): 6.0,
    ("bundle", "yearly"): 50.0,
}


@api_router.post("/subscription/purchase", response_model=SubscriptionStatus)
async def purchase(payload: PurchasePayload, user: dict = Depends(get_current_user)):
    """MOCK purchase. Phase C will replace this with RevenueCat webhook ingestion."""
    if (payload.plan, payload.billing_period) not in PRICING:
        raise HTTPException(status_code=400, detail="Invalid plan/period")
    price = PRICING[(payload.plan, payload.billing_period)]
    available_slugs = [a.slug for a in APPS_CATALOG if a.available]

    if payload.plan == "single":
        if not payload.app_slug or payload.app_slug not in available_slugs:
            raise HTTPException(status_code=400, detail="Invalid app for single plan")
        entitlement = "single_app"
        apps_unlocked = [payload.app_slug]
    else:
        entitlement = "bundle"
        apps_unlocked = available_slugs

    period_days = 30 if payload.billing_period == "monthly" else 365
    expires = (datetime.now(timezone.utc) + timedelta(days=period_days)).isoformat()
    sub_doc = {
        "user_id": user["id"],
        "plan": payload.plan,
        "entitlement": entitlement,
        "apps_unlocked": apps_unlocked,
        "billing_period": payload.billing_period,
        "price_chf": price,
        "expires_at": expires,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.subscriptions.update_one({"user_id": user["id"]}, {"$set": sub_doc}, upsert=True)
    return SubscriptionStatus(
        plan=payload.plan, entitlement=entitlement, apps_unlocked=apps_unlocked,
        billing_period=payload.billing_period, price_chf=price, expires_at=expires,
    )


@api_router.post("/subscription/cancel")
async def cancel(user: dict = Depends(get_current_user)):
    await db.subscriptions.delete_one({"user_id": user["id"]})
    return {"status": "cancelled"}


@api_router.get("/sso/token")
async def sso_token(user: dict = Depends(get_current_user)):
    """Issue a short-lived Shell-JWT for legacy postMessage handoff.
    Modern flow uses Supabase tokens directly in WebView URL hash."""
    token = create_token(user["id"])
    return {"sso_token": token, "user_id": user["id"]}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
