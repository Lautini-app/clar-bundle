from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import jwt
from datetime import datetime, timezone, timedelta
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'clar-dev-secret-change-in-production')
JWT_ALGO = 'HS256'

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ Models ============
class ClarApp(BaseModel):
    slug: str
    name: str
    tagline: str
    description: str
    url: str
    icon: str  # emoji or symbol name
    color: str  # hex accent
    available: bool = True  # if False -> "coming soon" placeholder


class AppleSignInPayload(BaseModel):
    apple_user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None


class User(BaseModel):
    id: str
    apple_user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    selected_apps: List[str] = []
    created_at: str


class SelectedAppsPayload(BaseModel):
    selected_apps: List[str]


class SubscriptionStatus(BaseModel):
    plan: Optional[str] = None  # 'single' | 'bundle' | None
    entitlement: Optional[str] = None  # 'single_app' | 'bundle' | None
    apps_unlocked: List[str] = []
    billing_period: Optional[str] = None  # 'monthly' | 'yearly'
    price_chf: Optional[float] = None
    expires_at: Optional[str] = None


class PurchasePayload(BaseModel):
    plan: str  # 'single' | 'bundle'
    billing_period: str  # 'monthly' | 'yearly'
    app_slug: Optional[str] = None  # required for 'single'


# ============ Static App Catalog ============
APPS_CATALOG = [
    ClarApp(
        slug="heim",
        name="clar·heim",
        tagline="Haushaltsorganisation",
        description="Strukturiere deinen Haushalt mit klaren Routinen und Listen.",
        url="https://clar.heim.lautini.ch",
        icon="home",
        color="#2E5C3E",
        available=True,
    ),
    ClarApp(
        slug="markt",
        name="clar·markt",
        tagline="Einkaufsplanung",
        description="Einkaufslisten, die mit dir mitdenken.",
        url="https://clar.markt.lautini.ch",
        icon="cart",
        color="#C97B3A",
        available=True,
    ),
    ClarApp(
        slug="lern",
        name="clar·lern",
        tagline="Lernunterstützung für Kinder",
        description="Kindgerechte Lernhilfe — bald verfügbar.",
        url="",
        icon="book",
        color="#5B7AAE",
        available=False,
    ),
    ClarApp(
        slug="zeit",
        name="clar·zeit",
        tagline="Zeitmanagement für ADHS",
        description="Ruhige Zeitstruktur für neurodiverse Köpfe.",
        url="",
        icon="time",
        color="#A85C7D",
        available=False,
    ),
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


# ============ Routes ============
@api_router.get("/")
async def root():
    return {"app": "clar by lautini", "status": "ok"}


@api_router.get("/apps", response_model=List[ClarApp])
async def list_apps():
    """Return the extensible catalog of clar apps. New apps can be added here
    without requiring an App Store update on the shell."""
    return APPS_CATALOG


@api_router.post("/auth/apple", response_model=AuthResponse)
async def sign_in_with_apple(payload: AppleSignInPayload):
    """Mock Sign in with Apple. In native production builds, the client will
    send the Apple identity token here for verification. For now we trust the
    payload to establish a session for the user."""
    existing = await db.users.find_one({"apple_user_id": payload.apple_user_id}, {"_id": 0})
    if existing:
        user_id = existing["id"]
        # update missing fields
        update = {}
        if payload.email and not existing.get("email"):
            update["email"] = payload.email
        if payload.full_name and not existing.get("full_name"):
            update["full_name"] = payload.full_name
        if update:
            await db.users.update_one({"id": user_id}, {"$set": update})
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
    else:
        user_id = str(uuid.uuid4())
        new_user = {
            "id": user_id,
            "apple_user_id": payload.apple_user_id,
            "email": payload.email,
            "full_name": payload.full_name,
            "selected_apps": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(new_user.copy())
        user = new_user

    token = create_token(user_id)
    return AuthResponse(
        token=token,
        user_id=user_id,
        email=user.get("email"),
        full_name=user.get("full_name"),
    )


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/user/selected-apps")
async def save_selected_apps(payload: SelectedAppsPayload, user: dict = Depends(get_current_user)):
    valid_slugs = {a.slug for a in APPS_CATALOG if a.available}
    cleaned = [s for s in payload.selected_apps if s in valid_slugs]
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"selected_apps": cleaned}},
    )
    return {"selected_apps": cleaned}


@api_router.get("/subscription/status", response_model=SubscriptionStatus)
async def subscription_status(user: dict = Depends(get_current_user)):
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
    """MOCK RevenueCat purchase. In production builds this will be replaced
    by client-side native RevenueCat purchase flow + webhook verification."""
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
    await db.subscriptions.update_one(
        {"user_id": user["id"]},
        {"$set": sub_doc},
        upsert=True,
    )
    return SubscriptionStatus(
        plan=payload.plan,
        entitlement=entitlement,
        apps_unlocked=apps_unlocked,
        billing_period=payload.billing_period,
        price_chf=price,
        expires_at=expires,
    )


@api_router.post("/subscription/cancel")
async def cancel(user: dict = Depends(get_current_user)):
    await db.subscriptions.delete_one({"user_id": user["id"]})
    return {"status": "cancelled"}


@api_router.get("/sso/token")
async def sso_token(user: dict = Depends(get_current_user)):
    """MOCK SSO endpoint: returns a short-lived token the WebView could pass to
    external web apps. Web apps must be updated to accept this — for now this
    is illustrative and not consumed by clar.heim / clar.markt."""
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
